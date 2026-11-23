// The data layer on Postgres. Same public API as the Sheets-backed Db (so no
// domain code changes), with stronger guarantees:
//
// - exclusive(): one in-process queue AND one database transaction holding an
//   advisory lock, so a multi-step write is atomic and serialized across every
//   server process. Any error rolls the whole step back.
// - Reads are always fresh (no cache): Postgres is fast enough, and a cache
//   only adds staleness risk between processes.
// - Constraints in the schema back up the app's own checks (unique email,
//   no double-booking, one expiry per lead and deadline, …).
// - The Places monthly cap is checked and incremented in ONE statement.

import { randomUUID } from 'node:crypto';
import { ConflictError, Db, NotFoundError, type TabState } from '../sheets/db.ts';
import type { SheetsBackend } from '../sheets/backend.ts';
import type { Row, TabName } from '../sheets/schema.ts';
import { TABLE, ValueError, columnsFor, ident, rowFromDb, toDb, type ColumnDef } from './tables.ts';
import { migrate } from './migrate.ts';
import type { PgPool } from './pg.ts';

/** Placeholder: the Sheets backend is never used by PgDb. */
const NO_SHEETS: SheetsBackend = new Proxy({} as SheetsBackend, {
  get: () => () => Promise.reject(new Error('PgDb does not use a Sheets backend')),
});

const SYSTEM = new Set(['id', 'createdAt', 'updatedAt', 'updatedBy']);

export class PgDb extends Db {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    readonly pg: PgPool,
    opts: { now?: () => Date } = {},
  ) {
    super(NO_SHEETS, { now: opts.now, cacheTtlMs: 0 });
  }

  // ─── Setup ──────────────────────────────────────────────────────────────

  override async ensureSchema(): Promise<void> {
    await migrate(this.pg);
  }

  // ─── Queue ──────────────────────────────────────────────────────────────

  override exclusive<T>(task: () => Promise<T>): Promise<T> {
    // Nested calls (already inside our transaction) run directly.
    if (this.pg.current) return task();
    const run = this.chain.then(
      () => this.pg.transaction(task),
      () => this.pg.transaction(task),
    );
    this.chain = run.catch(() => undefined);
    return run;
  }

  // ─── Reads (always fresh) ───────────────────────────────────────────────

  private async select(tab: TabName, where = '', params: unknown[] = [], lock = false): Promise<Row[]> {
    const sql = `SELECT * FROM ${ident(TABLE[tab])}${where ? ` WHERE ${where}` : ''} ORDER BY "_seq"${lock && this.pg.current ? ' FOR UPDATE' : ''}`;
    const res = await this.pg.query(sql, params);
    return res.rows.map((r) => rowFromDb(tab, r));
  }

  override async all(tab: TabName): Promise<Row[]> {
    return this.select(tab);
  }

  override async find(tab: TabName, id: string): Promise<Row | undefined> {
    return (await this.select(tab, '"id" = $1', [id]))[0];
  }

  override async loadFresh(tabs: TabName[]): Promise<TabState[]> {
    const fetchedAt = this.now().getTime();
    // Inside a transaction the client runs them in order; otherwise in parallel.
    const results = await Promise.all(tabs.map((t) => this.select(t)));
    return results.map((rows) => ({ header: [], rows, rowNumbers: new Map(), fetchedAt }));
  }

  override invalidate(): void {
    // No cache to drop.
  }

  // ─── Writes ─────────────────────────────────────────────────────────────

  private values(cols: ColumnDef[], row: Record<string, string>, tab: TabName): unknown[] {
    return cols.map((c) => {
      try {
        return toDb(c.type, row[c.key]);
      } catch (e) {
        if (e instanceof ValueError) throw new Error(`${tab}.${c.key}: ${e.message}`);
        throw e;
      }
    });
  }

  /** Insert rows exactly as given (system fields included). Used by the import, restore and the inserts below. */
  async insertRaw(tab: TabName, rows: Row[], onConflict: 'error' | 'nothing' = 'error'): Promise<number> {
    if (!rows.length) return 0;
    const cols = columnsFor(tab);
    let inserted = 0;
    // Chunk to stay well under the parameter limit.
    const per = Math.max(1, Math.floor(1000 / cols.length));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per);
      const params: unknown[] = [];
      const tuples = chunk.map((r) => {
        const vals = this.values(cols, r, tab);
        const start = params.length;
        params.push(...vals);
        return `(${vals.map((_, j) => `$${start + j + 1}`).join(', ')})`;
      });
      const sql = `INSERT INTO ${ident(TABLE[tab])} (${cols.map((c) => ident(c.column)).join(', ')}) VALUES ${tuples.join(', ')}${onConflict === 'nothing' ? ' ON CONFLICT DO NOTHING' : ''}`;
      inserted += (await this.pg.query(sql, params)).rowCount ?? 0;
    }
    return inserted;
  }

  override async insertManyUnqueued(tab: TabName, items: Record<string, string>[], actorId: string): Promise<Row[]> {
    if (!items.length) return [];
    const stamp = this.now().toISOString();
    const rows = items.map((data) => ({ ...data, id: data.id || randomUUID(), createdAt: stamp, updatedAt: stamp, updatedBy: actorId }) as Row);
    try {
      await this.insertRaw(tab, rows);
    } catch (e) {
      if ((e as { code?: string }).code === '23505' && !((e as { constraint?: string }).constraint ?? '').includes('pkey')) throw Object.assign(new ConflictError('That already exists.'), { code: '23505', constraint: (e as { constraint?: string }).constraint });
      throw e;
    }
    return rows;
  }

  override async updateManyUnqueued(
    tab: TabName,
    changes: { id: string; patch: Record<string, string>; expectedUpdatedAt?: string }[],
    actorId: string,
  ): Promise<{ before: Row; after: Row }[]> {
    if (!changes.length) return [];
    const ids = changes.map((c) => c.id);
    const current = await this.select(tab, '"id" = ANY($1)', [ids], true);
    const now = this.now().toISOString();
    const cols = new Map(columnsFor(tab).map((c) => [c.key, c]));
    const out: { before: Row; after: Row; keys: string[] }[] = [];
    for (const { id, patch, expectedUpdatedAt } of changes) {
      const before = current.find((r) => r.id === id);
      if (!before) throw new NotFoundError();
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== before.updatedAt) throw new ConflictError();
      const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => !SYSTEM.has(k) && cols.has(k)));
      // Same rule as the Sheets layer: every write moves updatedAt forward.
      const prev = Date.parse(before.updatedAt);
      const stamp = Number.isNaN(prev) || now > before.updatedAt ? now : new Date(prev + 1).toISOString();
      const after = { ...before, ...safe, updatedAt: stamp, updatedBy: actorId } as Row;
      out.push({ before, after, keys: [...Object.keys(safe), 'updatedAt', 'updatedBy'] });
    }
    for (const { after, keys } of out) {
      const defs = keys.map((k) => cols.get(k)!);
      const params = this.values(defs, after, tab);
      const set = defs.map((d, i) => `${ident(d.column)} = $${i + 1}`).join(', ');
      await this.pg.query(`UPDATE ${ident(TABLE[tab])} SET ${set} WHERE "id" = $${defs.length + 1}`, [...params, after.id]);
    }
    return out.map(({ before, after }) => ({ before, after }));
  }

  override async removeUnqueued(tab: TabName, id: string, _actorId: string, expectedUpdatedAt?: string): Promise<Row> {
    const [row] = await this.select(tab, '"id" = $1', [id], true);
    if (!row) throw new NotFoundError();
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== row.updatedAt) throw new ConflictError();
    await this.pg.query(`DELETE FROM ${ident(TABLE[tab])} WHERE "id" = $1`, [id]);
    return row;
  }

  // ─── Atomic helpers (Postgres only) ─────────────────────────────────────

  /**
   * Claim one paid Places call for the month, in ONE statement: the month's
   * counter is created or incremented only while below the cap, and the
   * claim row is written only if that succeeded. Returns the claim id, or
   * null when the cap is reached. Safe under any concurrency.
   */
  async claimPlacesCall(yearMonth: string, sku: string, actorId: string, cap: number): Promise<string | null> {
    const id = randomUUID();
    const stamp = this.now().toISOString();
    const res = await this.pg.query<{ id: string }>(
      `WITH bump AS (
         INSERT INTO "places_usage" ("year_month", "used", "updated_at")
         SELECT $1, 1, now() WHERE $2::int > 0
         ON CONFLICT ("year_month") DO UPDATE SET "used" = "places_usage"."used" + 1, "updated_at" = now()
           WHERE "places_usage"."used" < $2::int
         RETURNING "used"
       )
       INSERT INTO "places_claims" ("id", "created_at", "updated_at", "updated_by", "year_month", "sku", "status", "actor_id")
       SELECT $3, $4, $4, $5, $1, $6, 'claimed', $5 FROM bump
       RETURNING "id"`,
      [yearMonth, cap, id, stamp, actorId, sku],
    );
    return res.rows[0]?.id ?? null;
  }

  /** Release an unbilled claim: flip it and give the month its slot back, atomically. */
  async releasePlacesCall(claimId: string, actorId: string): Promise<void> {
    await this.pg.transaction(async () => {
      const r = await this.pg.query<{ year_month: string }>(
        `UPDATE "places_claims" SET "status" = 'released', "updated_at" = $2, "updated_by" = $3 WHERE "id" = $1 AND "status" = 'claimed' RETURNING "year_month"`,
        [claimId, this.now().toISOString(), actorId],
      );
      if (r.rows[0]) await this.pg.query(`UPDATE "places_usage" SET "used" = GREATEST("used" - 1, 0), "updated_at" = now() WHERE "year_month" = $1`, [r.rows[0].year_month]);
    }, 'places');
  }

  /** Delete expired sessions. Returns how many. (Run by the maintenance job.) */
  async pruneExpiredSessions(): Promise<number> {
    const r = await this.pg.query(`DELETE FROM "sessions" WHERE "expires_at" < $1`, [this.now().toISOString()]);
    return r.rowCount ?? 0;
  }
}
