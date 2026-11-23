// A team member's lead history: every lead they logged a call on, including
// ones that expired or went back to the founders.
//
// Rules:
// - Only leads with a call by this person. Anything else is 403, even if it
//   exists (they never worked on it).
// - Never Google Places details: an unconfirmed lead is shown as
//   "Category · City" (we store no name for it). Only first-party, confirmed
//   contact details are ever shown.
// - A lead that is no longer theirs shows "Returned to founders": no contact
//   details, and only the calls they logged themselves.

import type { Db } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { effectiveAssignee } from './access.ts';
import { byLead, nextAction, readLeads } from './service.ts';

const confirmed = (l: Row) => Boolean(l.confirmedAt) || !l.placeId;

/** Business name when confirmed, otherwise "Category · City" — never Places content. */
export const historyLabel = (l: Row) => (confirmed(l) && l.businessName ? l.businessName : [l.category, l.city].filter(Boolean).join(' · ') || 'Lead');

function item(l: Row, user: SessionUser, myCalls: Row[], allCalls: Row[], bookings: Row[], now: Date) {
  const returned = effectiveAssignee(l, now) !== user.id;
  const last = [...myCalls].sort((a, b) => b.at.localeCompare(a.at))[0];
  const next = returned ? null : nextAction(l, allCalls, bookings, now);
  const showContact = !returned && confirmed(l) && Boolean(l.phone || l.contactPerson);
  return {
    id: l.id,
    label: historyLabel(l),
    confirmed: confirmed(l),
    status: l.status || 'New',
    returned,
    lastCallOutcome: last?.outcome ?? '',
    lastCallAt: last?.at ?? '',
    nextAction: returned ? 'Returned to founders' : next!.label,
    contact: showContact ? { businessName: l.businessName, contactPerson: l.contactPerson, phone: l.phone } : null,
  };
}

async function load(db: Db) {
  const [leads, calls, bookings, users] = await Promise.all([readLeads(db), db.all('CallLog'), db.all('Bookings'), db.all('Users')]);
  return { leads, callsBy: byLead(calls), bookingsBy: byLead(bookings), users, now: db.now() };
}

export async function leadHistory(db: Db, user: SessionUser) {
  const { leads, callsBy, bookingsBy, now } = await load(db);
  return leads
    .map((l) => {
      const all = callsBy.get(l.id) ?? [];
      const mine = all.filter((c) => c.userId === user.id);
      return mine.length ? item(l, user, mine, all, bookingsBy.get(l.id) ?? [], now) : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.lastCallAt.localeCompare(a.lastCallAt));
}

export async function leadHistoryDetail(db: Db, user: SessionUser, id: string) {
  const { leads, callsBy, bookingsBy, users, now } = await load(db);
  const lead = leads.find((l) => l.id === id);
  const all = lead ? callsBy.get(lead.id) ?? [] : [];
  const mine = all.filter((c) => c.userId === user.id);
  // Same answer whether the lead exists or not: they never worked on it.
  if (!lead || !mine.length) throw new HttpError(403, 'You can only see leads you worked on.');
  const view = item(lead, user, mine, all, bookingsBy.get(lead.id) ?? [], now);
  const shown = view.returned ? mine : all;
  return {
    lead: view,
    calls: [...shown]
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((c) => ({ id: c.id, at: c.at, outcome: c.outcome, note: c.note, by: users.find((u) => u.id === c.userId)?.name ?? '' })),
  };
}
