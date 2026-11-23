// Idempotent migration runner. Applies server/db/migrations/*.sql in name
// order, each once, inside the DB_SCHEMA schema. Safe to run at every start:
// a session advisory lock makes concurrent runs (two processes starting)
// wait for each other, and applied files are recorded in schema_migrations.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgPool } from './pg.ts';
import { log } from '../lib/log.ts';

function migrationsDir(): string {
  // Repo root when run with npm (dev, tests, Render), else next to this module.
  const fromCwd = path.resolve(process.cwd(), 'server', 'db', 'migrations');
  try {
    readdirSync(fromCwd);
    return fromCwd;
  } catch {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  }
}

export function listMigrations(): { name: string; sql: string }[] {
  const dir = migrationsDir();
  return readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }));
}

/** Apply pending migrations. Returns the names applied this time. */
export async function migrate(db: PgPool): Promise<string[]> {
  const client = await db.pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [`${db.schema}:migrate`]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${db.schema}"`);
    await client.query(`SET search_path TO "${db.schema}", extensions, public`);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const m of listMigrations()) {
      if (done.has(m.name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
        await client.query('COMMIT');
        applied.push(m.name);
        log.info('postgres: migration applied', { name: m.name, schema: db.schema });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${m.name} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`${db.schema}:migrate`]).catch(() => undefined);
    client.release();
  }
  return applied;
}
