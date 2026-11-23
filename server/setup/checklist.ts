// "Get ready" checklist for founders: everything that should be in place
// before a team member starts booking calls. Every item is derived from live
// data, so it ticks itself off — nothing to mark by hand.

import type { Db } from '../sheets/db.ts';
import type { SessionUser } from '../auth/sessions.ts';
import type { BookingService } from '../bookings/service.ts';
import { istDate } from '../../shared/time.ts';
import { normalizeMeetLink } from '../../shared/meet.ts';

const isFounderRole = (role: string) => role === 'admin' || role === 'super_admin';

export async function setupChecklist(db: Db, bookings: BookingService, actor: SessionUser, placesEnabled: boolean) {
  const [users, leads] = await Promise.all([db.all('Users'), db.all('Leads')]);
  const active = users.filter((u) => u.active !== 'FALSE');
  // Free time in the next 14 days that is not already booked.
  const open = (await bookings.slots(istDate(db.now()), 14)).filter((s) => !s.booked);
  const freeBy = new Set(open.map((s) => s.founderId));

  const founders = active
    .filter((u) => isFounderRole(u.role))
    .map((u) => ({
      id: u.id,
      name: u.name,
      meetLink: Boolean(normalizeMeetLink(u.meetLink)),
      freeSlots: freeBy.has(u.id),
      signedIn: Boolean(u.lastLoginAt),
    }));
  const members = active
    .filter((u) => u.role === 'employee')
    .map((u) => ({ id: u.id, name: u.name, canReceiveLeads: u.canReceiveLeads === 'TRUE', signedIn: Boolean(u.lastLoginAt), hasPassword: Boolean(u.passwordHash) }));
  const receivers = new Set(members.filter((m) => m.canReceiveLeads).map((m) => m.id));

  const me = founders.find((f) => f.id === actor.id);
  return {
    me: { meetLink: me?.meetLink ?? false, freeSlots: me?.freeSlots ?? false },
    founders,
    members,
    team: {
      memberCanReceiveLeads: receivers.size > 0,
      membersHavePassword: members.length > 0 && members.every((m) => m.hasPassword),
      membersSignedIn: members.length > 0 && members.every((m) => m.signedIn),
      leadsAssigned: leads.some((l) => receivers.has(l.assignedTo)),
      placesEnabled,
    },
  };
}
