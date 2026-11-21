// Entry point. Binds the port FIRST, then bootstraps Sheets in the background:
// Render needs the port open quickly, and the public site and /api/health must
// answer during a cold start while the spreadsheet is still being read.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { bootstrap } from './bootstrap.ts';
import { Db } from './sheets/db.ts';
import { MemoryBackend, type SheetsBackend } from './sheets/backend.ts';
import { GoogleSheetsBackend, parseServiceAccount } from './sheets/google.ts';
import { log } from './lib/log.ts';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const backend: SheetsBackend =
  config.SHEETS_BACKEND === 'memory'
    ? new MemoryBackend()
    : new GoogleSheetsBackend(
        config.activeSpreadsheetId!,
        parseServiceAccount(config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!),
      );

if (config.SHEETS_BACKEND === 'memory') log.warn('Using the in-memory backend: data is lost on restart (development only)');
if (config.STAGING_MODE === 'true') log.warn('STAGING MODE: using the staging spreadsheet', { assignmentTimerMinutes: config.assignmentOverrideMinutes });

const db = new Db(backend);

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
