// Open the configured data backend: Postgres (DATA_BACKEND=postgres), Google
// Sheets, or memory (local development only).

import type { Config } from '../config.ts';
import { Db } from '../sheets/db.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { GoogleSheetsBackend, parseServiceAccount } from '../sheets/google.ts';
import { PgPool } from './pg.ts';
import { PgDb } from './pgdb.ts';

/** The CA may be given as PEM or as base64 of the PEM. */
export function caFrom(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.includes('BEGIN CERTIFICATE') ? value : Buffer.from(value, 'base64').toString('utf8');
}

export function openPg(config: Pick<Config, 'DATABASE_URL' | 'DB_SCHEMA' | 'DATABASE_CA_CERT'>, opts: { schema?: string; now?: () => Date; max?: number } = {}) {
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const pool = new PgPool({ connectionString: config.DATABASE_URL, schema: opts.schema ?? config.DB_SCHEMA, caCert: caFrom(config.DATABASE_CA_CERT), max: opts.max });
  return { pool, db: new PgDb(pool, { now: opts.now }) };
}

export function openDb(config: Config): { db: Db; kind: 'postgres' | 'sheets' | 'memory'; close: () => Promise<void> } {
  if (config.DATA_BACKEND === 'postgres') {
    const { pool, db } = openPg(config);
    return { db, kind: 'postgres', close: () => pool.end() };
  }
  if (config.SHEETS_BACKEND === 'memory') return { db: new Db(new MemoryBackend()), kind: 'memory', close: async () => undefined };
  const backend = new GoogleSheetsBackend(config.activeSpreadsheetId!, parseServiceAccount(config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!));
  return { db: new Db(backend), kind: 'sheets', close: async () => undefined };
}
