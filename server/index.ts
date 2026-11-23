// Entry point. Binds the port FIRST, then bootstraps the data store (Sheets or
// Postgres: migrations, seeds) in the background:
// Render needs the port open quickly, and the public site and /api/health must
// answer during a cold start while the spreadsheet is still being read.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { bootstrap } from './bootstrap.ts';
import { openDb } from './db/open.ts';
import { log } from './lib/log.ts';
import { runMaintenance } from './leads/service.ts';
import { MAINTENANCE_INTERVAL_MS, MAINTENANCE_START_DELAY_MS, startScheduler } from './scheduler.ts';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const opened = openDb(config);
const db = opened.db;

if (opened.kind === 'memory') log.warn('Using the in-memory backend: data is lost on restart (development only)');
log.info('data backend', { backend: opened.kind, ...(opened.kind === 'postgres' ? { schema: config.DB_SCHEMA, caVerified: Boolean(config.DATABASE_CA_CERT) } : {}) });
if (config.STAGING_MODE === 'true') {
  log.warn(opened.kind === 'postgres' ? 'STAGING MODE: using the staging schema' : 'STAGING MODE: using the staging spreadsheet', { assignmentTimerMinutes: config.assignmentOverrideMinutes });
}

// Retry bootstrap until it succeeds: a transient Sheets failure at boot should
// delay the team area, not crash the public site.
const ready = (async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      await bootstrap(config, db);
      log.info('bootstrap complete');
      return;
    } catch (err) {
      log.error('bootstrap failed; retrying', { attempt, error: (err as Error).message });
      await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * attempt)));
    }
  }
})();

const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp({ config, db, ready, staticDir: path.resolve(here, '..', 'dist') });

app.listen(config.PORT, '0.0.0.0', () => {
  log.info('listening', { port: config.PORT });
});

// Maintenance sweep inside the process (no external cron needed). Waits for
// bootstrap, then uses the same idempotent, queued job as /api/maintenance/run.
if (config.internalScheduler) {
  startScheduler({
    name: 'maintenance',
    intervalMs: MAINTENANCE_INTERVAL_MS,
    startDelayMs: MAINTENANCE_START_DELAY_MS,
    task: async () => {
      await ready;
      return runMaintenance(db);
    },
  });
  log.info('internal scheduler on', { everyMinutes: MAINTENANCE_INTERVAL_MS / 60_000, firstRunSeconds: MAINTENANCE_START_DELAY_MS / 1000 });
} else {
  log.info('internal scheduler off (INTERNAL_SCHEDULER)');
}
