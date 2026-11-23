// npm run db:restore -- <backups/folder> [--schema <name>] [--dry-run]
// Load a db:backup folder into Postgres (migrating the schema first).
// Idempotent like the import: existing ids are left alone, so restore into an
// EMPTY schema for an exact copy. Prints counts only.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.ts';
import { openPg } from '../db/open.ts';
import { migrate } from '../db/migrate.ts';
import { TRANSFER_ORDER, importRows, printChecks, printSummary, verify, type SourceRows } from '../db/transfer.ts';
import type { Row } from '../sheets/schema.ts';

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--schema');
  if (!folder) throw new Error('Give the backup folder, e.g. npm run db:restore -- backups/public-2026-11-23T10-00-00');
  const si = args.indexOf('--schema');
  const schema = si >= 0 ? args[si + 1] : config.DB_SCHEMA;
  const dryRun = args.includes('--dry-run');
  const source: SourceRows = {};
  for (const tab of TRANSFER_ORDER) source[tab] = JSON.parse(readFileSync(path.resolve(folder, `${tab}.json`), 'utf8')) as Row[];
  console.log(`Restoring ${path.basename(folder)} into schema "${schema}"${dryRun ? ' (dry run)' : ''}`);
  const { pool, db } = openPg(config, { schema });
  try {
    await migrate(pool);
    const summaries = await importRows(db, source, { dryRun });
    printSummary(summaries, dryRun);
    if (!dryRun && !printChecks(await verify(source, db, summaries))) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('db:restore failed:', (e as Error).message);
  process.exitCode = 1;
});
