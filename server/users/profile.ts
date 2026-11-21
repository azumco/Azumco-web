// User profile fields beyond auth: job title, whether the person can be
// assigned leads (and earn commission), and a stable calendar colour.
//
// Founders get a colour from the theme palette, chosen once and persisted, so
// it never changes when people are added or removed. Team members get the
// neutral colour.

import type { Db } from '../sheets/db.ts';
import { boolCell } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';

/** Theme palette keys, in the order founders receive them. */
export const FOUNDER_COLOURS = ['brand', 'info', 'good', 'violet', 'warn', 'bad'] as const;
export const NEUTRAL_COLOUR = 'neutral';

export const isFounderRole = (role: string) => role === 'admin' || role === 'super_admin';

/** The first palette colour no founder uses yet (cycling when all are taken). */
export function nextFounderColour(users: Row[]): string {
  const used = new Set(users.filter((u) => isFounderRole(u.role)).map((u) => u.calendarColor));
  const free = FOUNDER_COLOURS.find((c) => !used.has(c));
  if (free) return free;
  const founders = users.filter((u) => isFounderRole(u.role)).length;
  return FOUNDER_COLOURS[founders % FOUNDER_COLOURS.length];
}

/** Profile defaults for a new user. */
export function profileDefaults(role: string, users: Row[]): Record<string, string> {
  return {
    jobTitle: '',
    canReceiveLeads: boolCell(role === 'employee'),
    calendarColor: isFounderRole(role) ? nextFounderColour(users) : NEUTRAL_COLOUR,
  };
}

/**
 * Fill in missing profile fields on existing rows (older data, hand edits).
 * Idempotent: rows that already have values are not touched.
 */
export async function reconcileProfiles(db: Db): Promise<number> {
  return db.exclusive(async () => {
    const [state] = await db.loadFresh(['Users']);
    const working = state.rows.map((r) => ({ ...r }));
    const changes: { id: string; patch: Record<string, string> }[] = [];
    for (const u of working) {
      const patch: Record<string, string> = {};
      if (u.canReceiveLeads === '' || u.canReceiveLeads === undefined) patch.canReceiveLeads = boolCell(u.role === 'employee');
      const wrongColour = isFounderRole(u.role) ? !u.calendarColor || u.calendarColor === NEUTRAL_COLOUR : u.calendarColor !== NEUTRAL_COLOUR;
      if (wrongColour) {
        patch.calendarColor = isFounderRole(u.role) ? nextFounderColour(working) : NEUTRAL_COLOUR;
        u.calendarColor = patch.calendarColor;
      }
      if (Object.keys(patch).length) changes.push({ id: u.id, patch });
    }
    await db.updateManyUnqueued('Users', changes, 'system');
    return changes.length;
  });
}
