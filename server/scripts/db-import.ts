// npm run db:import-from-sheets -- [--dry-run] [--staging] [--schema <name>]
//
// One-time copy of every tab from Google Sheets into Postgres (DB_SCHEMA, or
// --schema). Idempotent: run it again and nothing changes. Sessions are not
// copied. Prints a per-table summary and a verification of counts and totals.
// Prints names and counts only — never values, hashes or connection strings.
//
// --staging reads STAGING_SPREADSHEET_ID instead of GOOGLE_SHEETS_SPREADSHEET_ID
// and refuses to write to the "public" schema.

import { loadConfig } from '../config.ts';
import { Db } from '../sheets/db.ts';
import { GoogleSheetsBackend, parseServiceAccount } from '../sheets/google.ts';
import { openPg } from '../db/open.ts';
import { migrate } from '../db/migrate.ts';
import { importRows, printChecks, printSummary, readAllRows, verify } from '../db/transfer.ts';

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const staging = args.includes('--staging');
  const si = args.indexOf('--schema');
  const schema = si >= 0 ? args[si + 1] : config.DB_SCHEMA;
  const sheetId = staging ? config.STAGING_SPREADSHEET_ID : config.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!sheetId || !config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) throw new Error(`${staging ? 'STAGING_SPREADSHEET_ID' : 'GOOGLE_SHEETS_SPREADSHEET_ID'} and GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 are required.`);
  if (staging && schema === 'public') throw new Error('Refusing: --staging must not write to the public (production) schema. Use --schema staging.');

  const sheets = new GoogleSheetsBackend(sheetId, parseServiceAccount(config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64), {
    retries: 8,
    baseDelayMs: 2000,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 30_000))),
  });
  const title = await sheets.spreadsheetTitle();
  console.log(`Source: ${staging ? 'STAGING' : 'PRODUCTION'} spreadsheet "${title}"`);
  console.log(`Target: Postgres schema "${schema}"${dryRun ? ' (dry run)' : ''}`);

  const source = await readAllRows(new Db(sheets));
  const { pool, db } = openPg(config, { schema });
  try {
    if (!dryRun) await migrate(pool);
    else {
      const exists = (await pool.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [schema])).rowCount;
      if (!exists) await migrate(pool); // a dry run needs the empty tables to compare against
    }
    const summaries = await importRows(db, source, { dryRun });
    printSummary(summaries, dryRun);
    if (!dryRun) {
      const ok = printChecks(await verify(source, db, summaries));
      if (!ok) process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('db:import-from-sheets failed:', (e as Error).message);
  process.exitCode = 1;
});
