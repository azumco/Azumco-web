// Super-admin settings, stored as key/value rows in the Settings tab.
// Reads go through the Db cache; every write is audited with before/after.

import { z } from 'zod';
import type { Db } from './sheets/db.ts';
import { audit } from './audit.ts';

export const DEFAULT_SETTINGS = {
  placesMonthlyCap: '1000',
  placesPaused: 'FALSE',
  commissionQualifiedFee: '200',
  commissionOneTimePct: '10',
  commissionMonthlyPct: '10',
  assignmentWindowHours: '24',
  /** 'any_attempt' | 'reached_only' — which call-log entries stop an assignment timer. */
  contactedRule: 'any_attempt',
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

export interface Settings {
  placesMonthlyCap: number;
  placesPaused: boolean;
  commissionQualifiedFee: number;
  commissionOneTimePct: number;
  commissionMonthlyPct: number;
  assignmentWindowHours: number;
  contactedRule: 'any_attempt' | 'reached_only';
}

/** Parse with safe fallbacks: a garbled cell must never mean "unlimited" or "unpaused". */
export function parseSettings(raw: Record<string, string>): Settings {
  const n = (key: SettingKey, min: number, max: number) => {
    const v = Number(raw[key]);
    return Number.isFinite(v) && v >= min && v <= max ? v : Number(DEFAULT_SETTINGS[key]);
  };
  const paused = (raw.placesPaused ?? '').trim().toUpperCase();
  return {
    placesMonthlyCap: Math.floor(n('placesMonthlyCap', 0, 1_000_000)),
    // Fails closed: anything other than an explicit FALSE counts as paused.
    placesPaused: paused !== 'FALSE',
    commissionQualifiedFee: n('commissionQualifiedFee', 0, 1_000_000),
    commissionOneTimePct: n('commissionOneTimePct', 0, 100),
    commissionMonthlyPct: n('commissionMonthlyPct', 0, 100),
    assignmentWindowHours: n('assignmentWindowHours', 1, 24 * 14),
    contactedRule: raw.contactedRule === 'reached_only' ? 'reached_only' : 'any_attempt',
  };
}

async function rawSettings(db: Db, fresh = false): Promise<Record<string, string>> {
  const rows = fresh ? (await db.loadFresh(['Settings']))[0].rows : await db.all('Settings');
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function getSettings(db: Db, opts: { fresh?: boolean } = {}): Promise<Settings> {
  return parseSettings(await rawSettings(db, opts.fresh));
}

export const settingsPatchSchema = z
  .object({
    placesMonthlyCap: z.number().int().min(0).max(1_000_000),
    placesPaused: z.boolean(),
    commissionQualifiedFee: z.number().min(0).max(1_000_000),
    commissionOneTimePct: z.number().min(0).max(100),
    commissionMonthlyPct: z.number().min(0).max(100),
    assignmentWindowHours: z.number().int().min(1).max(24 * 14),
    contactedRule: z.enum(['any_attempt', 'reached_only']),
  })
  .partial()
  .strict();

export async function updateSettings(
  db: Db,
  actorId: string,
  patch: z.infer<typeof settingsPatchSchema>,
  ip?: string,
): Promise<Settings> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [SettingKey, number | boolean | string][];
  const toCell = (v: number | boolean | string) => (typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));

  const { before, after } = await db.exclusive(async () => {
    const [state] = await db.loadFresh(['Settings']);
    const before = await rawSettings(db);
    const updates = [];
    const inserts = [];
    for (const [key, value] of entries) {
      const row = state.rows.find((r) => r.key === key);
      if (row) updates.push({ id: row.id, patch: { value: toCell(value) } });
      else inserts.push({ key, value: toCell(value) });
    }
    await db.updateManyUnqueued('Settings', updates, actorId);
    await db.insertManyUnqueued('Settings', inserts, actorId);
    return { before, after: await rawSettings(db) };
  });

  const changed = entries.map(([k]) => k);
  await audit(db, {
    actorId,
    action: 'settings.update',
    entity: 'Settings',
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    ip,
  });
  return parseSettings(after);
}
