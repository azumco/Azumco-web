// npm run db:migrate [-- --schema <name>]
// Apply pending migrations to DB_SCHEMA (or --schema). Idempotent; also run
// automatically at server start when DATA_BACKEND=postgres. Prints names only.

import { loadConfig } from '../config.ts';
import { openPg } from '../db/open.ts';
import { migrate } from '../db/migrate.ts';

async function main() {
  const config = loadConfig();
  const i = process.argv.indexOf('--schema');
  const schema = i > 0 ? process.argv[i + 1] : config.DB_SCHEMA;
  const { pool } = openPg(config, { schema });
  try {
    const applied = await migrate(pool);
    console.log(`Schema "${pool.schema}": ${applied.length ? `applied ${applied.join(', ')}` : 'already up to date'}.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('db:migrate failed:', (e as Error).message);
  process.exitCode = 1;
});
