// npm run db:backup [-- --schema <name>]
// Exports every table (except sessions) to backups/<schema>-<UTC time>/<Tab>.json
// plus manifest.json with row counts. The backups/ folder is git-ignored.
// The files contain everything needed to restore, INCLUDING password hashes:
// keep them private. The console shows counts only.
//
// Restore into an empty schema (e.g. a fresh project): npm run db:restore -- <folder>

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.ts';
import { openPg } from '../db/open.ts';
import { TRANSFER_ORDER, readAllRows } from '../db/transfer.ts';

async function main() {
  const config = loadConfig();
  const i = process.argv.indexOf('--schema');
  const schema = i > 0 ? process.argv[i + 1] : config.DB_SCHEMA;
  const { pool, db } = openPg(config, { schema });
  try {
    const rows = await readAllRows(db);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = path.resolve(process.cwd(), 'backups', `${schema}-${stamp}`);
    mkdirSync(dir, { recursive: true });
    const counts: Record<string, number> = {};
    for (const tab of TRANSFER_ORDER) {
      const list = rows[tab] ?? [];
      counts[tab] = list.length;
      writeFileSync(path.join(dir, `${tab}.json`), JSON.stringify(list, null, 1));
    }
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ schema, createdAt: new Date().toISOString(), counts, note: 'Sessions are not backed up.' }, null, 2));
    console.log(`Backup written to backups/${path.basename(dir)}`);
    for (const tab of TRANSFER_ORDER) console.log(`  ${tab.padEnd(15)} ${counts[tab]} row(s)`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('db:backup failed:', (e as Error).message);
  process.exitCode = 1;
});
