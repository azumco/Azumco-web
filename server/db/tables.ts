// Postgres table map for every tab in server/sheets/schema.ts.
//
// The app works with string rows (Row = Record<string, string>), exactly as
// with Sheets. This map says how each column is stored in Postgres and how a
// value converts both ways, so the domain code does not change:
//
//   t   text, NOT NULL DEFAULT ''          '' ↔ ''
//   r   text reference (nullable, FK)      '' ↔ NULL
//   ts  timestamptz                        ISO string ↔ timestamptz, '' ↔ NULL
//   d   date                               'YYYY-MM-DD' ↔ date, '' ↔ NULL
//   tm  time                               'HH:MM' ↔ time, '' ↔ NULL
//   b   boolean                            'TRUE'/'FALSE' ↔ true/false, '' ↔ NULL
//   i   integer                            '12' ↔ 12, '' ↔ NULL
//   n   numeric (money)                    '8000' ↔ 8000, '' ↔ NULL
//   j   jsonb (audit before/after only)    JSON text ↔ jsonb, '' ↔ NULL

import { SYSTEM_COLUMNS, TABS, type Row, type TabName } from '../sheets/schema.ts';

export type ColType = 't' | 'r' | 'ts' | 'd' | 'tm' | 'b' | 'i' | 'n' | 'j';

const SPEC: Record<TabName, Record<string, ColType>> = {
  Users: {
    email: 't', name: 't', role: 't', active: 'b', passwordHash: 't', mustChangePassword: 'b', failedAttempts: 'i', lockedUntil: 'ts',
    sessionVersion: 'i', lastLoginAt: 'ts', jobTitle: 't', canReceiveLeads: 'b', calendarColor: 't', meetLink: 't',
  },
  Sessions: { tokenHash: 't', userId: 'r', sessionVersion: 'i', csrfToken: 't', expiresAt: 'ts', ip: 't', userAgent: 't' },
  Settings: { key: 't', value: 't' },
  Audit: { at: 'ts', actorId: 't', action: 't', entity: 't', entityId: 't', before: 'j', after: 'j', ip: 't' },
  Meta: { key: 't', value: 't' },
  Leads: {
    dateAdded: 'd', addedBy: 't', businessName: 't', category: 't', contactPerson: 't', phone: 't', city: 't', websiteOrInstagram: 't',
    source: 't', serviceInterest: 't', placeId: 't', state: 't', searchedAt: 'ts', phoneSource: 't', confirmedAt: 'ts', confirmedBy: 't',
    assignedTo: 'r', assignedAt: 'ts', expiresAt: 'ts', expiryApplies: 'b', timerStoppedAt: 'ts', contacted: 'b', firstCallDate: 'd',
    callOutcome: 't', rating: 't', decisionMaker: 't', need: 't', nextStep: 't', followUpDate: 'd', discoveryCallDate: 'd',
    callHappened: 'b', status: 't', dealType: 't', dealValue: 'n', clientPaid: 'b', commissionPaid: 'n', commissionPaidAt: 'ts', notes: 't',
  },
  CallLog: { leadId: 'r', at: 'ts', userId: 'r', outcome: 't', note: 't' },
  Expirations: { leadId: 'r', assigneeId: 't', assignedAt: 'ts', expiresAt: 'ts' },
  PlacesClaims: { yearMonth: 't', sku: 't', status: 't', actorId: 't' },
  Availability: { founderId: 'r', date: 'd', start: 'tm', end: 'tm', slotMinutes: 'i', repeatWeekly: 'b', repeatUntil: 'd' },
  Bookings: {
    leadId: 'r', founderId: 'r', date: 'd', start: 'tm', end: 'tm', status: 't', clientName: 't', phone: 't', mode: 't', link: 't',
    notes: 't', bookedBy: 't', callHappened: 'b',
  },
  Notifications: { userId: 'r', type: 't', message: 't', refId: 't', readAt: 'ts' },
  Expenses: { date: 'd', item: 't', amount: 'n', paidBy: 't', project: 't', repaid: 'b' },
  Projects: { name: 't', dealTotal: 'n', received: 'n', status: 't' },
  Goals: { goal: 't', task: 't', owner: 't', support: 't', start: 'd', deadline: 'd', status: 't', note: 't' },
  Milestones: { name: 't', provider: 't', gstIncluded: 'b', targetOverride: 'n', notes: 't' },
  MilestoneItems: {
    milestoneId: 'r', label: 't', amount: 'n', amountWithoutGst: 'n', note: 't', sortOrder: 'i', paid: 'b', paidBy: 't',
    paidAmount: 'n', paidAt: 'ts', expenseId: 't',
  },
  Contributions: { date: 'd', founder: 't', amount: 'n', note: 't' },
};

// Every tab in schema.ts must be fully described here (checked at load).
for (const tab of Object.keys(TABS) as TabName[]) {
  const missing = TABS[tab].filter((c) => !(c in SPEC[tab]));
  if (missing.length) throw new Error(`db/tables.ts: no Postgres type for ${tab}.${missing.join(', ')}`);
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Postgres table name for a tab. */
export const TABLE: Record<TabName, string> = Object.fromEntries(
  (Object.keys(TABS) as TabName[]).map((t) => [t, snake(t).replace(/^_/, '')]),
) as Record<TabName, string>;

export interface ColumnDef { key: string; column: string; type: ColType }

const SYSTEM: Record<string, ColType> = { id: 't', createdAt: 'ts', updatedAt: 'ts', updatedBy: 't' };

export function columnsFor(tab: TabName): ColumnDef[] {
  return [...SYSTEM_COLUMNS, ...TABS[tab]].map((key) => ({ key, column: snake(key), type: (SYSTEM[key] ?? SPEC[tab][key]) as ColType }));
}

/** Quote an identifier (every column/table name goes through this). */
export const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

export class ValueError extends Error {}

/** App string → value for a parameterized query. Throws ValueError on a value that cannot be stored. */
export function toDb(type: ColType, v: string | undefined): unknown {
  const s = (v ?? '').trim();
  switch (type) {
    case 't':
      return v ?? '';
    case 'r':
      return s || null;
    case 'ts': {
      if (!s) return null;
      const ms = Date.parse(s);
      if (Number.isNaN(ms)) throw new ValueError(`not a timestamp`);
      return new Date(ms).toISOString();
    }
    case 'd':
      if (!s) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValueError('not a date');
      return s;
    case 'tm':
      if (!s) return null;
      if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) throw new ValueError('not a time');
      return s;
    case 'b':
      if (!s) return null;
      if (/^true$/i.test(s)) return true;
      if (/^false$/i.test(s)) return false;
      throw new ValueError('not a boolean');
    case 'i': {
      if (!s) return null;
      const n = Number(s);
      if (!Number.isInteger(n)) throw new ValueError('not an integer');
      return n;
    }
    case 'n': {
      if (!s) return null;
      const n = Number(s);
      if (!Number.isFinite(n)) throw new ValueError('not a number');
      return s;
    }
    case 'j':
      if (!s) return null;
      try {
        JSON.parse(s);
        return s;
      } catch {
        throw new ValueError('not JSON');
      }
  }
}

/** Postgres value → the app's string form (inverse of toDb). */
export function fromDb(type: ColType, v: unknown): string {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'ts':
      return (v instanceof Date ? v : new Date(String(v))).toISOString();
    case 'tm':
      return String(v).slice(0, 5);
    case 'b':
      return v ? 'TRUE' : 'FALSE';
    case 'j':
      return typeof v === 'string' ? v : JSON.stringify(v);
    case 'n': {
      // numeric comes back as text; drop a trailing ".0…" so '8000' stays '8000'.
      const s = String(v);
      return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
    }
    default:
      return String(v);
  }
}

export function rowFromDb(tab: TabName, rec: Record<string, unknown>): Row {
  const row: Record<string, string> = {};
  for (const c of columnsFor(tab)) row[c.key] = fromDb(c.type, rec[c.column]);
  return row as Row;
}
