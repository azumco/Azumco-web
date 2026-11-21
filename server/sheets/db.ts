// The data layer over a spreadsheet: cached reads, one serialized write queue,
// UUID-addressed rows and optimistic concurrency.
//
// ── Reads ───────────────────────────────────────────────────────────────────
// Each tab is cached in memory for a short TTL. A write replaces the cache with
// the fresh state it just read, so this server never serves its own stale
// data; the TTL only bounds how long a hand-edit in the spreadsheet takes to
// show up.
//
// ── Writes ──────────────────────────────────────────────────────────────────
// Every write goes through `exclusive()`, a single in-process queue. Inside it
// the tab is re-read from Sheets (bypassing the cache), the row is located by
// id, the change is checked and then written. Because only one queued task runs
// at a time, a check-then-write inside `exclusive()` cannot interleave with
// another one in this process. (Cross-process safety during a deploy overlap is
// handled separately for budget claims and bookings by write-then-read-back.)

import { randomUUID } from 'node:crypto';
import { a1Tab, columnLetter, type Grid, type SheetsBackend } from './backend.ts';
import { columnsOf, TABS, type Row, type TabName } from './schema.ts';

export class ConflictError extends Error {
  readonly status = 409;
  constructor(message = 'This record was changed by someone else. Reload it and try again.') {
    super(message);
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = 'Not found.') {
    super(message);
  }
}

interface TabState {
  header: string[];
  rows: Row[];
  /** id → 1-based sheet row number at the time of the read. */
  rowNumbers: Map<string, number>;
  fetchedAt: number;
}

export interface DbOptions {
  cacheTtlMs?: number;
  now?: () => Date;
  /** Prefix for every tab name in the spreadsheet (integration tests use "__test_"). */
  tabPrefix?: string;
}

export class Db {
  private cache = new Map<TabName, TabState>();
  private sheetIds = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly ttl: number;
  private readonly prefix: string;
  readonly now: () => Date;

  constructor(
    readonly backend: SheetsBackend,
    opts: DbOptions = {},
  ) {
    this.ttl = opts.cacheTtlMs ?? 30_000;
    this.now = opts.now ?? (() => new Date());
    this.prefix = opts.tabPrefix ?? '';
  }

  /** The tab's title in the spreadsheet. */
  private t(tab: TabName): string {
    return this.prefix + tab;
  }

  // ─── Setup ──────────────────────────────────────────────────────────────

  /** Create missing tabs and missing header columns. Idempotent. */
  async ensureSchema(): Promise<void> {
    await this.exclusive(async () => {
      const names = Object.keys(TABS) as TabName[];
      const existing = new Set((await this.backend.listTabs()).map((t) => t.title));
      const missing = names.filter((n) => !existing.has(this.t(n))).map((n) => this.t(n));
      await this.backend.addTabs(missing);
      for (const t of await this.backend.listTabs()) this.sheetIds.set(t.title, t.sheetId);

      const grids = await this.backend.readTabs(names.map((n) => this.t(n)));
      const headerWrites: { range: string; values: Grid }[] = [];
      names.forEach((name, i) => {
        const header = grids[i][0] ?? [];
        const wanted = columnsOf(name);
        const add = wanted.filter((c) => !header.includes(c));
        if (add.length) {
          headerWrites.push({
            range: `${a1Tab(this.t(name))}!${columnLetter(header.length + 1)}1`,
            values: [add],
          });
        }
      });
      await this.backend.writeRanges(headerWrites);
      this.cache.clear();
    });
  }

  // ─── Queue ──────────────────────────────────────────────────────────────

  /**
   * Run `task` alone: no other exclusive task starts until it settles. A
   * failing task does not block the queue for the next one.
   */
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ─── Reads ──────────────────────────────────────────────────────────────

  /** Cached rows of a tab. */
  async all(tab: TabName): Promise<Row[]> {
    const hit = this.cache.get(tab);
    if (hit && this.now().getTime() - hit.fetchedAt < this.ttl) return hit.rows;
    return (await this.loadFresh([tab]))[0].rows;
  }

  async find(tab: TabName, id: string): Promise<Row | undefined> {
    return (await this.all(tab)).find((r) => r.id === id);
  }

  /** Read tabs straight from Sheets, refreshing the cache. Batched into one request. */
  async loadFresh(tabs: TabName[]): Promise<TabState[]> {
    const grids = await this.backend.readTabs(tabs.map((tab) => this.t(tab)));
    return tabs.map((tab, i) => {
      const state = parseGrid(grids[i], this.now().getTime());
      this.cache.set(tab, state);
      return state;
    });
  }

  invalidate(tab?: TabName): void {
    if (tab) this.cache.delete(tab);
    else this.cache.clear();
  }

  // ─── Writes (each one queued) ───────────────────────────────────────────

  insert(tab: TabName, data: Record<string, string>, actorId: string): Promise<Row> {
    return this.exclusive(() => this.insertUnqueued(tab, data, actorId));
  }

  /**
   * Update a row. Pass `expectedUpdatedAt` (the value the editor loaded) to
   * reject the write if someone else saved in between.
   */
  update(
    tab: TabName,
    id: string,
    patch: Record<string, string>,
    actorId: string,
    expectedUpdatedAt?: string,
  ): Promise<{ before: Row; after: Row }> {
    return this.exclusive(() => this.updateUnqueued(tab, id, patch, actorId, expectedUpdatedAt));
  }

  remove(tab: TabName, id: string, actorId: string, expectedUpdatedAt?: string): Promise<Row> {
    return this.exclusive(() => this.removeUnqueued(tab, id, actorId, expectedUpdatedAt));
  }

  // The *Unqueued variants are for use INSIDE an exclusive() task that needs
  // several steps to be atomic together. Calling them outside the queue
  // forfeits the serialization guarantee.

  async insertUnqueued(tab: TabName, data: Record<string, string>, actorId: string): Promise<Row> {
    return (await this.insertManyUnqueued(tab, [data], actorId))[0];
  }

  /** Insert several rows with one read and one append. */
  async insertManyUnqueued(tab: TabName, items: Record<string, string>[], actorId: string): Promise<Row[]> {
    const [state] = await this.loadFresh([tab]);
    if (!items.length) return [];
    const stamp = this.now().toISOString();
    const rows = items.map(
      (data) => ({ ...data, id: data.id || randomUUID(), createdAt: stamp, updatedAt: stamp, updatedBy: actorId }) as Row,
    );
    await this.backend.appendRows(this.t(tab), rows.map((r) => toCells(state.header, r)));
    // Row numbers are not tracked for appended rows; the next write re-reads anyway.
    state.rows = [...state.rows, ...rows];
    return rows;
  }

  async updateUnqueued(
    tab: TabName,
    id: string,
    patch: Record<string, string>,
    actorId: string,
    expectedUpdatedAt?: string,
  ): Promise<{ before: Row; after: Row }> {
    return (await this.updateManyUnqueued(tab, [{ id, patch, expectedUpdatedAt }], actorId))[0];
  }

  /** Update several rows of one tab with one read and one batched write. All-or-nothing on conflicts. */
  async updateManyUnqueued(
    tab: TabName,
    changes: { id: string; patch: Record<string, string>; expectedUpdatedAt?: string }[],
    actorId: string,
  ): Promise<{ before: Row; after: Row }[]> {
    const [state] = await this.loadFresh([tab]);
    const now = this.now().toISOString();
    const results: { before: Row; after: Row; rowNumber: number }[] = [];

    for (const { id, patch, expectedUpdatedAt } of changes) {
      const before = state.rows.find((r) => r.id === id);
      if (!before) throw new NotFoundError();
      if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== before.updatedAt) throw new ConflictError();

      // The system columns are not patchable: id is the identity, the stamps are ours.
      const { id: _i, createdAt: _c, updatedAt: _u, updatedBy: _b, ...safe } = patch;
      void _i; void _c; void _u; void _b;
      // Two edits in the same millisecond would leave updatedAt unchanged and
      // defeat the concurrency check; nudge forward so every write changes it.
      // (A hand-edited, unparseable updatedAt is simply replaced by now.)
      const prev = Date.parse(before.updatedAt);
      const stamp = Number.isNaN(prev) || now > before.updatedAt ? now : new Date(prev + 1).toISOString();
      const after = { ...before, ...safe, updatedAt: stamp, updatedBy: actorId } as Row;
      results.push({ before, after, rowNumber: state.rowNumbers.get(id)! });
    }
    if (!results.length) return [];

    const last = columnLetter(state.header.length);
    await this.backend.writeRanges(
      results.map((r) => ({
        range: `${a1Tab(this.t(tab))}!A${r.rowNumber}:${last}${r.rowNumber}`,
        values: [toCells(state.header, r.after)],
      })),
    );
    const byId = new Map(results.map((r) => [r.after.id, r.after]));
    state.rows = state.rows.map((r) => byId.get(r.id) ?? r);
    return results.map(({ before, after }) => ({ before, after }));
  }

  async removeUnqueued(tab: TabName, id: string, _actorId: string, expectedUpdatedAt?: string): Promise<Row> {
    const [state] = await this.loadFresh([tab]);
    const row = state.rows.find((r) => r.id === id);
    if (!row) throw new NotFoundError();
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== row.updatedAt) throw new ConflictError();
    const sheetId = await this.sheetIdOf(tab);
    await this.backend.deleteRow(sheetId, state.rowNumbers.get(id)!);
    // Row numbers below the deleted one shift up; drop the cache rather than patch it.
    this.cache.delete(tab);
    return row;
  }

  private async sheetIdOf(tab: TabName): Promise<number> {
    if (!this.sheetIds.has(this.t(tab))) {
      for (const t of await this.backend.listTabs()) this.sheetIds.set(t.title, t.sheetId);
    }
    const id = this.sheetIds.get(this.t(tab));
    if (id === undefined) throw new Error(`Tab ${tab} does not exist`);
    return id;
  }
}

function parseGrid(grid: Grid, fetchedAt: number): TabState {
  const header = (grid[0] ?? []).map((h) => h.trim());
  const rows: Row[] = [];
  const rowNumbers = new Map<string, number>();
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i];
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      if (h) row[h] = cells[j] ?? '';
    });
    // Blank rows (e.g. left behind by a hand-edit) are skipped, not treated as records.
    if (!row.id) continue;
    rows.push(row as Row);
    rowNumbers.set(row.id, i + 1);
  }
  return { header, rows, rowNumbers, fetchedAt };
}

function toCells(header: string[], row: Record<string, string>): string[] {
  return header.map((h) => row[h] ?? '');
}

// ─── Value helpers ───────────────────────────────────────────────────────────

export const bool = (v: string | undefined) => v === 'TRUE' || v === 'true';
export const boolCell = (v: boolean) => (v ? 'TRUE' : 'FALSE');
export const num = (v: string | undefined, fallback = 0) => {
  const n = Number(v);
  return v === undefined || v === '' || !Number.isFinite(n) ? fallback : n;
};
