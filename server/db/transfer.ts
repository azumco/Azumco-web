// Moving rows into Postgres: the one-time import from Google Sheets and the
// restore from a JSON backup share this code.
//
// - Idempotent: rows are inserted with ON CONFLICT DO NOTHING by id, so a
//   second run inserts nothing. Existing rows are compared, never changed.
// - Preserves ids, timestamps, statuses, password hashes and the audit log.
// - Sessions are never copied (everyone signs in again).
// - A reference to a row that no longer exists (e.g. a deleted lead) is
//   cleared, as the app already treats it; counted as "adjusted".
// - Output is counts and field NAMES only — never values, hashes or secrets.

import type { Row, TabName } from '../sheets/schema.ts';
import { TABS } from '../sheets/schema.ts';
import type { Db } from '../sheets/db.ts';
import { TABLE, ValueError, columnsFor, fromDb, toDb } from './tables.ts';
import type { PgDb } from './pgdb.ts';
import { commissionFor } from '../../shared/rules.ts';

/** Insert order: parents before children. Sessions are deliberately absent. */
export const TRANSFER_ORDER: TabName[] = [
  'Users', 'Settings', 'Meta', 'Milestones', 'MilestoneItems', 'Projects', 'Expenses', 'Contributions', 'Goals',
  'Leads', 'CallLog', 'Expirations', 'PlacesClaims', 'Availability', 'Bookings', 'Notifications', 'Audit',
];

/** Foreign keys: column → referenced tab (cleared when the target is missing). */
const REFS: Partial<Record<TabName, Record<string, TabName>>> = {
  Leads: { assignedTo: 'Users' },
  CallLog: { leadId: 'Leads', userId: 'Users' },
  Expirations: { leadId: 'Leads' },
  Availability: { founderId: 'Users' },
  Bookings: { leadId: 'Leads', founderId: 'Users' },
  Notifications: { userId: 'Users' },
  MilestoneItems: { milestoneId: 'Milestones' },
};

export type SourceRows = Partial<Record<TabName, Row[]>>;

export interface TableSummary {
  tab: TabName;
  read: number;
  inserted: number;
  existing: number;
  skipped: number;
  adjusted: number;
  /** Rows already in Postgres whose stored values differ from the source. */
  mismatches: number;
  /** Field names involved in skips / adjustments / mismatches (never values). */
  notes: string[];
}

export async function readAllRows(db: Db): Promise<SourceRows> {
  const tabs = TRANSFER_ORDER;
  const states = await db.loadFresh(tabs);
  return Object.fromEntries(tabs.map((t, i) => [t, states[i].rows])) as SourceRows;
}

/** JSON with keys sorted (jsonb does not keep the original key order). */
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;

/** A value as it will come back from Postgres (to compare like with like). */
function normalized(tab: TabName, row: Row): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columnsFor(tab)) {
    try {
      out[c.key] = c.type === 'j' ? (row[c.key] ? JSON.stringify(canonical(JSON.parse(row[c.key]))) : '') : fromDb(c.type, toDb(c.type, row[c.key]) as never);
    } catch {
      out[c.key] = '\u0000invalid';
    }
  }
  return out;
}

export async function importRows(target: PgDb, source: SourceRows, opts: { dryRun: boolean }): Promise<TableSummary[]> {
  const summaries: TableSummary[] = [];
  // Ids that exist (or will exist) per tab, for reference checks.
  const known = new Map<TabName, Set<string>>();
  const existingBy = new Map<TabName, Map<string, Row>>();
  // Always read the database itself (never a cache).
  const current = await target.loadFresh(TRANSFER_ORDER);
  TRANSFER_ORDER.forEach((tab, i) => existingBy.set(tab, new Map(current[i].rows.map((r) => [r.id, r]))));

  for (const tab of TRANSFER_ORDER) {
    const rows = source[tab] ?? [];
    const existing = existingBy.get(tab)!;
    const s: TableSummary = { tab, read: rows.length, inserted: 0, existing: 0, skipped: 0, adjusted: 0, mismatches: 0, notes: [] };
    const note = (n: string) => !s.notes.includes(n) && s.notes.push(n);
    const ids = new Set<string>(existing.keys());
    const toInsert: Row[] = [];
    const emails = new Set([...existing.values()].map((u) => (u.email ?? '').trim().toLowerCase()));
    const keys = new Set([...existing.values()].map((r) => r.key));

    for (const original of rows) {
      const row = { ...original } as Row;
      if (existing.has(row.id)) {
        s.existing++;
        const a = normalized(tab, row);
        const b = normalized(tab, existing.get(row.id)!);
        const diff = Object.keys(a).filter((k) => a[k] !== b[k]);
        if (diff.length) {
          s.mismatches++;
          diff.forEach((k) => note(`differs: ${k}`));
        }
        continue;
      }
      if (ids.has(row.id)) {
        s.skipped++;
        note('duplicate id in source');
        continue;
      }
      // Clear references to rows that do not exist.
      for (const [col, parent] of Object.entries(REFS[tab] ?? {})) {
        if (row[col] && !known.get(parent!)?.has(row[col])) {
          row[col] = '';
          s.adjusted++;
          note(`${col}: reference to a missing ${parent} cleared`);
        }
      }
      // Unique keys the database enforces.
      if (tab === 'Users') {
        const e = (row.email ?? '').trim().toLowerCase();
        if (emails.has(e)) {
          s.skipped++;
          note('duplicate email');
          continue;
        }
        emails.add(e);
      }
      if ((tab === 'Settings' || tab === 'Meta') && keys.has(row.key)) {
        s.skipped++;
        note('duplicate key');
        continue;
      }
      keys.add(row.key);
      // Every value must be storable as its column type.
      const bad = columnsFor(tab).filter((c) => {
        try {
          toDb(c.type, row[c.key]);
          return false;
        } catch (e) {
          if (e instanceof ValueError) return true;
          throw e;
        }
      });
      const required = bad.filter((c) => ['id', 'createdAt', 'updatedAt'].includes(c.key));
      if (required.length) {
        s.skipped++;
        note(`unusable ${required.map((c) => c.key).join(', ')}`);
        continue;
      }
      for (const c of bad) {
        // An unparseable optional value is stored empty (e.g. a hand-typed date).
        row[c.key] = '';
        s.adjusted++;
        note(`${c.key}: not a valid ${c.type === 'd' ? 'date' : c.type === 'ts' ? 'timestamp' : c.type === 'b' ? 'yes/no' : 'number'}, stored empty`);
      }
      // Bookings: an active booking needs a founder, a date and a time range.
      if (tab === 'Bookings' && (!row.founderId || !row.date || !row.start || !row.end)) {
        s.skipped++;
        note('booking without founder, date or time');
        continue;
      }
      ids.add(row.id);
      toInsert.push(row);
    }
    known.set(tab, ids);

    if (!opts.dryRun && toInsert.length) {
      try {
        s.inserted = await target.insertRaw(tab, toInsert, 'nothing');
      } catch (e) {
        // A constraint the checks above did not foresee (e.g. two overlapping
        // active bookings in the sheet): insert one by one and count the rest.
        if (!['23505', '23P01', '23503', '23514'].includes((e as { code?: string }).code ?? '')) throw e;
        for (const r of toInsert) {
          try {
            s.inserted += await target.insertRaw(tab, [r], 'nothing');
          } catch (err) {
            const code = (err as { code?: string; constraint?: string }).code ?? '';
            if (!['23505', '23P01', '23503', '23514'].includes(code)) throw err;
            s.skipped++;
            note(`rejected by constraint ${(err as { constraint?: string }).constraint ?? code}`);
          }
        }
      }
    } else if (opts.dryRun) {
      s.inserted = toInsert.length;
    }
    summaries.push(s);
  }

  if (!opts.dryRun) {
    // The Places counter is derived from the claims ledger.
    await target.pg.query(
      `INSERT INTO "places_usage" ("year_month", "used")
       SELECT "year_month", count(*) FROM "places_claims" WHERE "status" = 'claimed' GROUP BY 1
       ON CONFLICT ("year_month") DO UPDATE SET "used" = GREATEST("places_usage"."used", EXCLUDED."used"), "updated_at" = now()`,
    );
  }
  return summaries;
}

// ─── Verification ────────────────────────────────────────────────────────────

const sum = (rows: Row[], k: string) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
const countBy = (rows: Row[], f: (r: Row) => string) => {
  const m: Record<string, number> = {};
  for (const r of rows) m[f(r)] = (m[f(r)] ?? 0) + 1;
  return JSON.stringify(Object.fromEntries(Object.entries(m).sort()));
};

export interface Check { name: string; source: string; target: string; ok: boolean }

/** Compare row counts and computed totals between the source and Postgres. */
export async function verify(source: SourceRows, target: PgDb, summaries: TableSummary[]): Promise<Check[]> {
  const t = await readAllRows(target);
  const checks: Check[] = [];
  const add = (name: string, a: unknown, b: unknown) => checks.push({ name, source: String(a), target: String(b), ok: String(a) === String(b) });
  for (const tab of TRANSFER_ORDER) {
    const s = summaries.find((x) => x.tab === tab)!;
    // Rows the import skipped on purpose are not expected in Postgres.
    add(`${tab}: rows`, (source[tab] ?? []).length - s.skipped, (t[tab] ?? []).length);
  }
  const rate = (rows: Row[] | undefined, key: string, fallback: number) => Number(rows?.find((r) => r.key === key)?.value) || fallback;
  const rates = (rows: Row[] | undefined) => ({ qualifiedFee: rate(rows, 'commissionQualifiedFee', 200), oneTimePct: rate(rows, 'commissionOneTimePct', 10), monthlyPct: rate(rows, 'commissionMonthlyPct', 10) });
  const commission = (rows: Row[] | undefined, settings: Row[] | undefined) =>
    (rows ?? []).reduce((total, l) => total + commissionFor({ callHappened: l.callHappened === 'TRUE', status: l.status, clientPaid: l.clientPaid === 'TRUE', dealType: l.dealType, dealValue: Number(l.dealValue) || 0 }, rates(settings)), 0);
  add('Expenses: total amount', sum(source.Expenses ?? [], 'amount'), sum(t.Expenses ?? [], 'amount'));
  add('Contributions: total amount', sum(source.Contributions ?? [], 'amount'), sum(t.Contributions ?? [], 'amount'));
  add('Projects: deal total / received', `${sum(source.Projects ?? [], 'dealTotal')}/${sum(source.Projects ?? [], 'received')}`, `${sum(t.Projects ?? [], 'dealTotal')}/${sum(t.Projects ?? [], 'received')}`);
  add('Leads: count per status', countBy(source.Leads ?? [], (r) => r.status || 'New'), countBy(t.Leads ?? [], (r) => r.status || 'New'));
  add('Leads: commission earned (computed)', commission(source.Leads, source.Settings), commission(t.Leads, t.Settings));
  add('Leads: commission paid', sum(source.Leads ?? [], 'commissionPaid'), sum(t.Leads ?? [], 'commissionPaid'));
  add('Bookings: count per status', countBy(source.Bookings ?? [], (r) => r.status), countBy(t.Bookings ?? [], (r) => r.status));
  add('Places: claimed calls per month', countBy((source.PlacesClaims ?? []).filter((r) => r.status === 'claimed'), (r) => r.yearMonth), countBy((t.PlacesClaims ?? []).filter((r) => r.status === 'claimed'), (r) => r.yearMonth));
  add('Users: emails', (source.Users ?? []).map((u) => u.email.toLowerCase()).sort().join(','), (t.Users ?? []).map((u) => u.email.toLowerCase()).sort().join(','));
  return checks.map((c) => (c.name === 'Users: emails' ? { ...c, source: c.ok ? 'same' : 'differs', target: c.ok ? 'same' : 'differs' } : c));
}

export function printSummary(summaries: TableSummary[], dryRun: boolean): void {
  console.log(`\n${dryRun ? 'DRY RUN — nothing written.' : 'Import complete.'}`);
  console.log(`${'table'.padEnd(15)} ${'read'.padStart(6)} ${(dryRun ? 'would add' : 'inserted').padStart(9)} ${'existing'.padStart(8)} ${'skipped'.padStart(7)} ${'adjusted'.padStart(8)} ${'mismatch'.padStart(8)}`);
  for (const s of summaries) {
    console.log(`${s.tab.padEnd(15)} ${String(s.read).padStart(6)} ${String(s.inserted).padStart(9)} ${String(s.existing).padStart(8)} ${String(s.skipped).padStart(7)} ${String(s.adjusted).padStart(8)} ${String(s.mismatches).padStart(8)}${s.notes.length ? `   ${s.notes.join('; ')}` : ''}`);
  }
  console.log('Sessions: not copied (everyone signs in again).');
}

export function printChecks(checks: Check[]): boolean {
  console.log('\nVerification (source vs Postgres):');
  for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `   source=${c.source} postgres=${c.target}`}`);
  const ok = checks.every((c) => c.ok);
  console.log(ok ? 'All checks passed.' : 'Some checks FAILED.');
  return ok;
}

export { TABS, TABLE };
