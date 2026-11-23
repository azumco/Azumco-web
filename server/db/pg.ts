// Postgres connection: one small pool, TLS, the schema search_path, timeouts,
// retries on transient errors, and transactions that the write queue uses.
//
// DATABASE_URL must be the Supabase SESSION pooler string. It is never logged.
// No Supabase client library or API keys: plain node-postgres only.

import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { log } from '../lib/log.ts';

// Dates stay 'YYYY-MM-DD' strings (never shifted through a JS Date in local time).
pg.types.setTypeParser(1082, (v) => v);
// time → 'HH:MM:SS'; numeric and int8 already come back as text.
pg.types.setTypeParser(1083, (v) => v);

export interface PgOptions {
  connectionString: string;
  /** Postgres schema for every table (DB_SCHEMA). */
  schema: string;
  /** PEM of the Supabase CA. When given, the server certificate is verified. */
  caCert?: string;
  max?: number;
  statementTimeoutMs?: number;
}

const TRANSIENT = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006', '53300']);
export const isTransient = (e: unknown) => {
  const err = e as { code?: string; message?: string };
  return TRANSIENT.has(err?.code ?? '') || /Connection terminated|timeout exceeded when trying to connect|Client has encountered a connection error/i.test(err?.message ?? '');
};
/** Postgres constraint violations: unique (23505) and exclusion (23P01). */
export const isConstraintViolation = (e: unknown) => ['23505', '23P01'].includes((e as { code?: string })?.code ?? '');

/** A safe schema identifier (letters, digits, underscore). */
export function checkSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('DB_SCHEMA must be lowercase letters, digits and underscores.');
  return schema;
}

export class PgPool {
  readonly pool: pg.Pool;
  readonly schema: string;
  private readonly statementTimeoutMs: number;
  private readonly tx = new AsyncLocalStorage<pg.PoolClient>();

  constructor(opts: PgOptions) {
    this.schema = checkSchema(opts.schema);
    const url = new URL(opts.connectionString);
    // sslmode in the URL would override the ssl object below; TLS is configured here.
    url.searchParams.delete('sslmode');
    this.pool = new pg.Pool({
      connectionString: url.toString(),
      // Without the Supabase CA the link is still encrypted, but the server's
      // identity is not verified (documented in docs/RELEASE.md).
      ssl: opts.caCert ? { ca: opts.caCert, rejectUnauthorized: true } : { rejectUnauthorized: false },
      max: opts.max ?? 5,
      idleTimeoutMillis: 30_000,
      // A paused/cold project can take a while to accept the first connection.
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
      application_name: 'azumco-team',
      // Startup options (the Supabase session pooler passes these through):
      // every table lives in DB_SCHEMA; times are handled in UTC.
      options: `-c search_path=${this.schema},extensions,public -c TimeZone=UTC -c idle_in_transaction_session_timeout=60000`,
      // The pooler's role default overrides a startup statement_timeout, so
      // reads get a client-side limit and write transactions SET LOCAL one.
      query_timeout: (opts.statementTimeoutMs ?? 15_000) + 5_000,
    });
    this.statementTimeoutMs = opts.statementTimeoutMs ?? 15_000;
    // An idle client dropped by the pooler must not crash the process.
    this.pool.on('error', (e) => log.warn('postgres: idle client error', { error: String(e.message).slice(0, 120) }));
  }

  /** The client of the current transaction, if any. */
  get current(): pg.PoolClient | undefined {
    return this.tx.getStore();
  }

  /**
   * Run a parameterized query. Inside a transaction it uses that transaction's
   * client; otherwise the pool, retrying transient connection errors.
   */
  async query<R extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<pg.QueryResult<R>> {
    const c = this.current;
    if (c) return c.query<R>(text, params);
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.pool.query<R>(text, params);
      } catch (e) {
        if (attempt >= 4 || !isTransient(e)) throw e;
        log.warn('postgres: transient error, retrying', { attempt, code: (e as { code?: string }).code ?? '' });
        await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
      }
    }
  }

  /**
   * Run `task` in ONE transaction holding a transaction-scoped advisory lock,
   * so writes are serialized across every server process (e.g. during a
   * deploy overlap), not just within this one. Commits on success, rolls back
   * on any error. Nested calls join the outer transaction.
   */
  async transaction<T>(task: () => Promise<T>, lockKey = 'writes'): Promise<T> {
    if (this.current) return task();
    let client: pg.PoolClient | undefined;
    for (let attempt = 1; ; attempt++) {
      try {
        client = await this.pool.connect();
        break;
      } catch (e) {
        if (attempt >= 4 || !isTransient(e)) throw e;
        await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
      }
    }
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = ${this.statementTimeoutMs}`);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${this.schema}:${lockKey}`]);
      const result = await this.tx.run(client, task);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
