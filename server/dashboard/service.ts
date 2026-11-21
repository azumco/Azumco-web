// Dashboard numbers. The founder view covers the whole team; the employee view
// is computed from her own leads, calls and bookings only.

import type { Db } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import { bool, num } from '../sheets/db.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { commissionFor } from '../../shared/rules.ts';
import { istDate } from '../../shared/time.ts';
import { placesUsage } from '../places/budget.ts';
import { commissionInput, followUpState, leadLabel, readLeads, viewContext } from '../leads/service.ts';
import { addDays } from '../../shared/slots.ts';
import { effectiveAssignee } from '../leads/access.ts';
import { MilestoneService } from '../milestone/service.ts';

function countBy(rows: Row[], key: (r: Row) => string) {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) || 'Not set';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Commission credited to each employee: earned / paid / pending. */
function commissionByAssignee(leads: Row[], users: Row[], rates: Parameters<typeof commissionFor>[1]) {
  // Commission applies only to people who can receive leads.
  const employees = users.filter((u) => bool(u.canReceiveLeads));
  return employees.map((u) => {
    const mine = leads.filter((l) => l.assignedTo === u.id);
    const earned = mine.reduce((s, l) => s + commissionFor(commissionInput(l), rates), 0);
    const paid = mine.reduce((s, l) => s + Math.min(num(l.commissionPaid), commissionFor(commissionInput(l), rates)), 0);
    return {
      userId: u.id,
      name: u.name,
      earned,
      paid,
      pending: Math.max(0, earned - paid),
      contacted: mine.filter((l) => bool(l.contacted)).length,
      qualified: mine.filter((l) => bool(l.callHappened)).length,
      won: mine.filter((l) => l.status === 'Won').length,
    };
  });
}

function totals(leads: Row[], bookings: Row[]) {
  const won = leads.filter((l) => l.status === 'Won').length;
  const lost = leads.filter((l) => l.status === 'Lost').length;
  return {
    leads: leads.length,
    contacted: leads.filter((l) => bool(l.contacted)).length,
    callsBooked: bookings.filter((b) => b.status !== 'cancelled').length,
    qualified: leads.filter((l) => bool(l.callHappened)).length,
    won,
    lost,
    /** Won as a share of closed deals (won + lost). */
    winRate: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null,
  };
}

export async function founderDashboard(db: Db) {
  const [leads, ctx, bookings, expirations] = await Promise.all([readLeads(db), viewContext(db), db.all('Bookings'), db.all('Expirations')]);
  const today = istDate(ctx.now);
  const nameOf = (id: string) => ctx.users.find((u) => u.id === id)?.name ?? 'Unknown';

  const expiredByAssignee: Record<string, number> = {};
  for (const e of expirations) expiredByAssignee[nameOf(e.assigneeId)] = (expiredByAssignee[nameOf(e.assigneeId)] ?? 0) + 1;

  const label = (id: string) => leadLabel(leads.find((l) => l.id === id) ?? ({ businessName: 'Deleted lead' } as unknown as Row));
  const dueToday = leads.filter((l) => followUpState(l, today) === 'today');
  const weekEnd = addDays(today, 7);
  const upcoming = bookings
    .filter((b) => b.status === 'booked' && b.date >= today && b.date < weekEnd)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((b) => ({ id: b.id, date: b.date, start: b.start, mode: b.mode, founder: nameOf(b.founderId), lead: label(b.leadId), leadId: b.leadId }));
  const bucket = (l: Row) => {
    const st = l.status || 'New';
    return st === 'Proposal Sent' || st === 'Negotiating' ? 'Proposal' : st;
  };
  const pipeline = Object.fromEntries(['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'].map((k) => [k, leads.filter((l) => bucket(l) === k).length]));
  const unclaimed = leads.filter((l) => !effectiveAssignee(l, ctx.now));

  return {
    needs: {
      followUpsToday: dueToday.length,
      firstFollowUpLeadId: dueToday[0]?.id ?? null,
      overdue: leads.filter((l) => followUpState(l, today) === 'overdue').length,
      unclaimed: unclaimed.length,
      callsThisWeek: upcoming.length,
      nextCallDate: upcoming[0]?.date ?? null,
    },
    pipeline,
    upcoming,
    callsBookedThisWeek: upcoming.length,
    lastWon: label(leads.filter((l) => l.status === 'Won').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? ''),
    totals: totals(leads, bookings),
    followUps: {
      overdue: leads.filter((l) => followUpState(l, today) === 'overdue').length,
      dueToday: leads.filter((l) => followUpState(l, today) === 'today').length,
    },
    unclaimed: leads.filter((l) => !effectiveAssignee(l, ctx.now)).length,
    breakdowns: {
      rating: countBy(leads, (l) => l.rating),
      status: countBy(leads, (l) => l.status || 'New'),
      outcome: countBy(leads.filter((l) => l.callOutcome), (l) => l.callOutcome),
      source: countBy(leads, (l) => l.source),
      addedBy: countBy(leads, (l) => nameOf(l.addedBy)),
    },
    places: await placesUsage(db),
    expiredByAssignee,
    commission: commissionByAssignee(leads, ctx.users, ctx.rates),
    milestone: await milestoneSummary(db),
  };
}

/** Compact card data for the first milestone, or null when there is none. */
async function milestoneSummary(db: Db) {
  const m = (await new MilestoneService(db).overview()).milestones[0];
  return m ? { id: m.id, name: m.name, ...m.numbers } : null;
}

export async function employeeDashboard(db: Db, user: SessionUser) {
  const [all, ctx, bookings] = await Promise.all([readLeads(db), viewContext(db), db.all('Bookings')]);
  const today = istDate(ctx.now);
  const mine = all.filter((l) => effectiveAssignee(l, ctx.now) === user.id);
  const myBookings = bookings.filter((b) => b.bookedBy === user.id && b.status !== 'cancelled');
  const commission = commissionByAssignee(mine, ctx.users.filter((u) => u.id === user.id), ctx.rates)[0] ?? { earned: 0, paid: 0, pending: 0 };

  // "How it adds up": one line per lead that earns something.
  const lines = mine
    .map((l) => {
      const input = commissionInput(l);
      const parts: { kind: 'qualified' | 'won'; label: string; detail: string; amount: number; date: string }[] = [];
      const date = l.updatedAt.slice(0, 10);
      if (input.callHappened) parts.push({ kind: 'qualified', label: 'Qualified lead', detail: `${leadLabel(l)} · discovery call happened`, amount: ctx.rates.qualifiedFee, date });
      const total = commissionFor(input, ctx.rates);
      if (total > (input.callHappened ? ctx.rates.qualifiedFee : 0)) {
        const pct = input.dealType === 'Monthly' ? ctx.rates.monthlyPct : ctx.rates.oneTimePct;
        parts.push({ kind: 'won', label: 'Client won', detail: `${leadLabel(l)} · ${pct}% of ₹${input.dealValue.toLocaleString('en-IN')}`, amount: total - (input.callHappened ? ctx.rates.qualifiedFee : 0), date });
      }
      return parts;
    })
    .flat();

  return {
    lines,
    rates: ctx.rates,
    stats: {
      contacted: mine.filter((l) => bool(l.contacted)).length,
      calls: ctx.calls.filter((c) => c.userId === user.id).length,
      booked: myBookings.length,
      qualified: mine.filter((l) => bool(l.callHappened)).length,
      won: mine.filter((l) => l.status === 'Won').length,
    },
    queue: mine.filter((l) => !bool(l.contacted)).length,
    followUps: {
      overdue: mine.filter((l) => followUpState(l, today) === 'overdue').length,
      dueToday: mine.filter((l) => followUpState(l, today) === 'today').length,
    },
    earnings: { earned: commission.earned, paid: commission.paid, pending: commission.pending },
  };
}
