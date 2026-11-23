// npm run test:pg — the whole test suite on Postgres (only when DATABASE_URL
// is set). Each test file gets its own throwaway schema t_<run>_<random>; all
// of this run's schemas are dropped at the end, pass or fail. Never touches
// the public (production) or staging schemas.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { caFrom } from '../db/open.ts';

async function dropRunSchemas(runId: string): Promise<number> {
  const u = new URL(process.env.DATABASE_URL!);
  u.searchParams.delete('sslmode');
  const ca = caFrom(process.env.DATABASE_CA_CERT);
  const c = new pg.Client({ connectionString: u.toString(), ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query<{ nspname: string }>(`SELECT nspname FROM pg_namespace WHERE nspname LIKE $1`, [`t\\_${runId}\\_%`]);
    for (const r of rows) await c.query(`DROP SCHEMA "${r.nspname}" CASCADE`);
    return rows.length;
  } finally {
    await c.end();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('test:pg skipped: DATABASE_URL is not set.');
    return;
  }
  const runId = randomBytes(4).toString('hex');
  const extra = process.argv.slice(2);
  console.log(`test:pg run ${runId}: each test file uses its own schema t_${runId}_…`);
  const result = spawnSync('npx', ['vitest', 'run', '--maxWorkers=3', '--testTimeout=90000', '--hookTimeout=120000', ...extra], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, TEST_PG: '1', PG_RUN_ID: runId },
  });
  const dropped = await dropRunSchemas(runId);
  console.log(`test:pg: dropped ${dropped} throwaway schema(s).`);
  process.exitCode = result.status ?? 1;
}

main().catch((e) => {
  console.error('test:pg failed:', (e as Error).message);
  process.exitCode = 1;
});
