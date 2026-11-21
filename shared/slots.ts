// Availability → bookable slots, and planning new free slots. Shared by the
// server (which creates them) and the Add-free-slots modal (which previews
// them), so the "Adds N slots" preview is exactly what gets created.
//
// Overlap rule: for one founder on one day, a slot that overlaps a slot
// already produced by an earlier availability rule is dropped. Overlapping
// free time is therefore merged at the slot level, never duplicated.

import { fromIst, istDate } from './time.ts';

export interface AvailRule {
  founderId: string;
  date: string;
  start: string;
  end: string;
  slotMinutes: number;
  repeatWeekly: boolean;
  repeatUntil: string;
}

export type PlainSlot = {
  founderId: string;
  date: string;
  start: string;
  end: string;
};

const DAY = 86_400_000;
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const addDays = (d: string, n: number) => istDate(new Date(fromIst(d).getTime() + n * DAY));
export const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

/** Does a rule produce slots on IST day `d`? */
export function coversDay(r: AvailRule, d: string): boolean {
  if (r.date === d) return true;
  if (!r.repeatWeekly || d < r.date) return false;
  if (r.repeatUntil && d > r.repeatUntil) return false;
  return weekday(d) === weekday(r.date);
}

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && b.start < a.end;

/** Grid slots of one rule on one day (no filtering). */
function gridOf(r: Pick<AvailRule, 'founderId' | 'start' | 'end' | 'slotMinutes'>, d: string): PlainSlot[] {
  const out: PlainSlot[] = [];
  const len = r.slotMinutes || 30;
  for (let m = toMin(r.start); m + len <= toMin(r.end); m += len) out.push({ founderId: r.founderId, date: d, start: toTime(m), end: toTime(m + len) });
  return out;
}

/** Expand rules (in stored order) into slots for [from, from+days), skipping past and overlapping slots. */
export function expandRules(rules: AvailRule[], from: string, days: number, nowMs: number, founderFilter?: string): PlainSlot[] {
  const out: PlainSlot[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const kept = new Map<string, PlainSlot[]>(); // founderId → slots kept that day
    for (const r of rules) {
      if (founderFilter && r.founderId !== founderFilter) continue;
      if (!coversDay(r, d)) continue;
      const mine = kept.get(r.founderId) ?? [];
      for (const s of gridOf(r, d)) {
        if (fromIst(d, s.start).getTime() <= nowMs) continue;
        if (mine.some((k) => overlaps(k, s))) continue;
        mine.push(s);
        out.push(s);
      }
      kept.set(r.founderId, mine);
    }
  }
  return out.sort((x, y) => (x.date + x.start + x.founderId).localeCompare(y.date + y.start + y.founderId));
}

export interface SlotPlanInput {
  founderId: string;
  /** The founder's existing rules. */
  existing: AvailRule[];
  dates: string[];
  start: string;
  end: string;
  slotMinutes: number;
  nowMs: number;
}

export interface SlotPlan {
  /** New slots per chosen day (only days that gain at least one). */
  perDate: { date: string; slots: PlainSlot[] }[];
  total: number;
  error: string | null;
}

/** What adding [start, end) on `dates` would actually create. */
export function planSlots(p: SlotPlanInput): SlotPlan {
  const fail = (error: string): SlotPlan => ({ perDate: [], total: 0, error });
  if (!/^\d{2}:\d{2}$/.test(p.start) || !/^\d{2}:\d{2}$/.test(p.end)) return fail('Enter both times.');
  if (toMin(p.end) <= toMin(p.start)) return fail('"To" must be after "From".');
  if (toMin(p.end) - toMin(p.start) < p.slotMinutes) return fail(`The range is shorter than one ${p.slotMinutes}-minute call.`);
  if (!p.dates.length) return fail('Choose at least one day.');

  const perDate: SlotPlan['perDate'] = [];
  let anyFuture = false;
  for (const d of [...new Set(p.dates)].sort()) {
    const taken = expandRules(p.existing.filter((r) => r.founderId === p.founderId), d, 1, p.nowMs);
    const fresh = gridOf({ founderId: p.founderId, start: p.start, end: p.end, slotMinutes: p.slotMinutes }, d).filter((s) => {
      if (fromIst(d, s.start).getTime() <= p.nowMs) return false;
      anyFuture = true;
      return !taken.some((t) => overlaps(t, s));
    });
    if (fresh.length) perDate.push({ date: d, slots: fresh });
  }
  const total = perDate.reduce((n, x) => n + x.slots.length, 0);
  if (!total) return fail(anyFuture ? 'You already have free slots at those times.' : 'Those times are already in the past.');
  return { perDate, total, error: null };
}
