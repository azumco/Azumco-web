// Leads: assignment with expiry, the call log, confirming a contact, and the
// views each role sees. Every multi-step change runs inside db.exclusive(), so
// a check and its write cannot interleave with another change — including the
// expiry sweep.

import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import { bool, boolCell, num } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { auditUnqueued } from '../audit.ts';
import { founderIds, notify, notifyUnqueued, type Notice } from '../notifications.ts';
import { getSettings } from '../settings.ts';
import { normalizePhone } from '../../shared/phone.ts';
import { istDate } from '../../shared/time.ts';
import {
  CALL_OUTCOMES, DEAL_TYPES, LEAD_SOURCES, LEAD_STATUSES, RATINGS, commissionFor, isReachedOutcome,
} from '../../shared/rules.ts';
import { assertLeadAccess, effectiveAssignee, isFounder, isLapsed, timerRunning } from './access.ts';

const HOUR = 3_600_000;
export const ASSIGN_WINDOWS = [12, 24, 48] as const;
export const GOOGLE_SOURCE = 'Google Places';

// ─── Expiry sweep ───────────────────────────────────────────────────────────

/**
 * Return every lapsed assignment to the founders' Unclaimed list.
 *
 * Idempotent: each expiry is keyed `${leadId}:${expiresAt}` in the Expirations
 * tab, and its notifications and audit entry use ids derived from that key, so
 * running the sweep any number of times records each expiry exactly once.
 */
export async function sweepExpired(db: Db): Promise<number> {
  return db.exclusive(() => sweepExpiredUnqueued(db));
}

export async function sweepExpiredUnqueued(db: Db, onlyLeadId?: string): Promise<number> {
  const now = db.now();
  const [leads, expirations] = await db.loadFresh(['Leads', 'Expirations']);
  const lapsed = leads.rows.filter((l) => isLapsed(l, now) && (!onlyLeadId || l.id === onlyLeadId));
  if (!lapsed.length) return 0;

  await db.updateManyUnqueued(
    'Leads',
    lapsed.map((l) => ({ id: l.id, patch: { assignedTo: '', assignedAt: '', expiresAt: '', expiryApplies: 'FALSE', timerStoppedAt: '' } })),
    'system',
  );

  const known = new Set(expirations.rows.map((e) => e.id));
  const fresh = lapsed.filter((l) => !known.has(`${l.id}:${l.expiresAt}`));
  await db.insertManyUnqueued(
    'Expirations',
    fresh.map((l) => ({ id: `${l.id}:${l.expiresAt}`, leadId: l.id, assigneeId: l.assignedTo, assignedAt: l.assignedAt, expiresAt: l.expiresAt })),
    'system',
  );

  const users = await db.all('Users');
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone';
  const founders = await founderIds(db);
  const notices: Notice[] = [];
  for (const l of fresh) {
    // The person who lost it hears about it too.
    if (l.assignedTo) {
      notices.push({
        id: `expiry:${l.id}:${l.expiresAt}:${l.assignedTo}`,
        userId: l.assignedTo,
        type: 'lead_expired',
        message: `${leadLabel(l).replace(/ · Google lead$/, '')} expired and went back to the founders.`,
        refId: l.id,
      });
    }
    for (const f of founders) {
      notices.push({
        id: `expiry:${l.id}:${l.expiresAt}:${f}`,
        userId: f,
        type: 'assignment_expired',
        message: `${leadLabel(l)} was not contacted by ${nameOf(l.assignedTo)} in time and is back in Unclaimed.`,
        refId: l.id,
      });
    }
  }
  await notifyUnqueued(db, notices);
  await auditUnqueued(
    db,
    fresh.map((l) => ({
      id: `audit:expiry:${l.id}:${l.expiresAt}`,
      actorId: 'system',
      action: 'lead.assignment_expired',
      entity: 'Leads',
      entityId: l.id,
      before: { assignedTo: l.assignedTo, expiresAt: l.expiresAt },
      after: { assignedTo: '' },
    })),
  );
  return fresh.length;
}

/**
 * One "disappears in under 3 hours" notice per assignment, to the assignee.
 * Idempotent (keyed by lead + deadline); cheap when there is nothing to send.
 */
export async function notifyExpiringSoon(db: Db): Promise<number> {
  const now = db.now().getTime();
  const soon = (await db.all('Leads')).filter((l) => {
    if (!timerRunning(l)) return false;
    const left = Date.parse(l.expiresAt) - now;
    return left > 0 && left <= 3 * HOUR;
  });
  if (!soon.length) return 0;
  const existing = new Set((await db.all('Notifications')).map((n) => n.id));
  const fresh = soon.filter((l) => !existing.has(`expiring:${l.id}:${l.expiresAt}`));
  if (!fresh.length) return 0;
  await notify(
    db,
    fresh.map((l) => ({
      id: `expiring:${l.id}:${l.expiresAt}`,
      userId: l.assignedTo,
      type: 'lead_expiring',
      message: `${leadLabel(l).replace(/ · Google lead$/, '')} disappears in under 3 hours. Log a call to keep it.`,
      refId: l.id,
    })),
  );
  return fresh.length;
}

/**
 * The maintenance job: return lapsed assignments and send "expiring soon"
 * notices. Used by the in-process scheduler and by /api/maintenance/run.
 */
export async function runMaintenance(db: Db): Promise<{ expired: number; expiring: number }> {
  const expired = await sweepExpired(db);
  const expiring = await notifyExpiringSoon(db);
  return { expired, expiring };
}

/** Leads, with any lapsed assignment swept first, so reads always reflect server time. */
export async function readLeads(db: Db): Promise<Row[]> {
  const now = db.now();
  const leads = await db.all('Leads');
  if (leads.some((l) => isLapsed(l, now))) {
    await sweepExpired(db);
    return db.all('Leads');
  }
  return leads;
}

// ─── Labels and views ───────────────────────────────────────────────────────

/** Unconfirmed Google leads have no name stored: "Gym · Bhopal · Google lead". */
export function leadLabel(l: Row): string {
  if (l.businessName) return l.businessName;
  const parts = [l.category, l.city].filter(Boolean);
  return l.placeId ? `${parts.join(' · ')}${parts.length ? ' · ' : ''}Google lead` : parts.join(' · ') || 'Untitled lead';
}

export function followUpState(l: Row, today: string): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!l.followUpDate || l.status === 'Won' || l.status === 'Lost') return 'none';
  if (l.followUpDate < today) return 'overdue';
  if (l.followUpDate === today) return 'today';
  return 'upcoming';
}

export function leadView(l: Row, ctx: { now: Date; users: Row[]; calls: Row[]; rates: Parameters<typeof commissionFor>[1] }) {
  const assignee = effectiveAssignee(l, ctx.now);
  const running = timerRunning(l) && Boolean(assignee);
  const calls = ctx.calls.filter((c) => c.leadId === l.id);
  return {
    id: l.id,
    label: leadLabel(l),
    isGoogle: Boolean(l.placeId),
    confirmed: Boolean(l.confirmedAt) || !l.placeId,
    needsLiveLookup: Boolean(l.placeId) && !l.confirmedAt,
    dateAdded: l.dateAdded,
    addedBy: l.addedBy,
    addedByName: ctx.users.find((u) => u.id === l.addedBy)?.name ?? '',
    businessName: l.businessName,
    category: l.category,
    contactPerson: l.contactPerson,
    phone: l.phone,
    city: l.city,
    websiteOrInstagram: l.websiteOrInstagram,
    source: l.source,
    serviceInterest: l.serviceInterest,
    phoneSource: l.phoneSource,
    confirmedAt: l.confirmedAt || null,
    assignedTo: assignee,
    assigneeName: ctx.users.find((u) => u.id === assignee)?.name ?? '',
    assignedAt: assignee ? l.assignedAt || null : null,
    expiresAt: running ? l.expiresAt : null,
    timerRunning: running,
    msLeft: running ? Date.parse(l.expiresAt) - ctx.now.getTime() : null,
    state: l.state ?? '',
    contacted: bool(l.contacted),
    firstCallDate: l.firstCallDate,
    attempts: calls.length,
    lastAttemptAt: calls.reduce((m, c) => (c.at > m ? c.at : m), '') || null,
    lastNote: [...calls].sort((a, b) => b.at.localeCompare(a.at)).find((c) => c.note)?.note ?? '',
    callOutcome: l.callOutcome,
    rating: l.rating,
    decisionMaker: l.decisionMaker,
    need: l.need,
    nextStep: l.nextStep,
    followUpDate: l.followUpDate,
    followUp: followUpState(l, istDate(ctx.now)),
    discoveryCallDate: l.discoveryCallDate,
    callHappened: bool(l.callHappened),
    status: l.status || 'New',
    dealType: l.dealType,
    dealValue: num(l.dealValue),
    clientPaid: bool(l.clientPaid),
    commission: commissionFor(commissionInput(l), ctx.rates),
    commissionPaid: num(l.commissionPaid),
    commissionPaidAt: l.commissionPaidAt || null,
    notes: l.notes,
    updatedAt: l.updatedAt,
  };
}
export type LeadView = ReturnType<typeof leadView>;

export const commissionInput = (l: Row) => ({
  callHappened: bool(l.callHappened),
  status: l.status,
  clientPaid: bool(l.clientPaid),
  dealType: l.dealType,
  dealValue: num(l.dealValue),
});

export async function viewContext(db: Db) {
  const [users, calls, settings] = await Promise.all([db.all('Users'), db.all('CallLog'), getSettings(db)]);
  return {
    now: db.now(),
    users,
    calls,
    rates: {
      qualifiedFee: settings.commissionQualifiedFee,
      oneTimePct: settings.commissionOneTimePct,
      monthlyPct: settings.commissionMonthlyPct,
    },
  };
}

/** The leads a user may see: founders see all, an employee only her live assignments. */
export async function visibleLeads(db: Db, user: SessionUser): Promise<Row[]> {
  const leads = await readLeads(db);
  if (isFounder(user)) return leads;
  const now = db.now();
  return leads.filter((l) => effectiveAssignee(l, now) === user.id);
}

// ─── Validation ─────────────────────────────────────────────────────────────

const text = (max = 300) => z.string().trim().max(max);
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30.')]);

/** Fields the team enters when adding a lead. */
const teamFields = {
  businessName: text(200),
  category: text(100),
  contactPerson: text(150),
  phone: text(40),
  city: text(120),
  websiteOrInstagram: text(300),
  source: z.union([z.enum(LEAD_SOURCES), z.literal('')]),
  serviceInterest: text(200),
};

/** Fields the employee works on. */
const employeeFields = {
  rating: z.union([z.enum(RATINGS), z.literal('')]),
  decisionMaker: text(150),
  need: text(1000),
  nextStep: text(500),
  followUpDate: date,
  discoveryCallDate: date,
};

/** Fields only founders set when closing. */
const founderFields = {
  status: z.enum(LEAD_STATUSES),
  dealType: z.union([z.enum(DEAL_TYPES), z.literal('')]),
  dealValue: z.number().min(0).max(1e9),
  clientPaid: z.boolean(),
  callHappened: z.boolean(),
  notes: text(4000),
};

export const createLeadSchema = z.object({
  ...teamFields,
  businessName: text(200).min(1, 'Business name is required.'),
  assignTo: z.string().optional(),
  /** Manual leads get an expiry only when the assigner asks for one. */
  deadlineHours: z.union([z.literal(12), z.literal(24), z.literal(48)]).optional(),
}).partial({ category: true, contactPerson: true, phone: true, city: true, websiteOrInstagram: true, source: true, serviceInterest: true });

export const founderPatchSchema = z
  .object({ ...teamFields, ...employeeFields, ...founderFields, expectedUpdatedAt: z.string() })
  .partial()
  .strict();

export const employeePatchSchema = z.object({ ...employeeFields, expectedUpdatedAt: z.string() }).partial().strict();

export const callSchema = z.object({
  outcome: z.enum(CALL_OUTCOMES.map((o) => o.value) as [string, ...string[]]),
  note: text(1000).optional(),
  ...Object.fromEntries(Object.entries(employeeFields).map(([k, v]) => [k, v.optional()])),
}) as z.ZodType<{ outcome: string; note?: string } & Partial<Record<keyof typeof employeeFields, string>>>;

export const confirmSchema = z.object({
  businessName: text(200).min(1, 'Enter the business name you confirmed.'),
  contactPerson: text(150).optional(),
  phone: text(40).min(1, 'Enter the number you reached them on.'),
});

// ─── Duplicate checks ───────────────────────────────────────────────────────

/**
 * Every stored phone is first-party (Places numbers are never stored), so a
 * phone match against any lead is a duplicate.
 */
function phoneOwner(leads: Row[], e164: string, exceptId?: string): Row | undefined {
  return leads.find((l) => l.id !== exceptId && l.phone && normalizePhone(l.phone) === e164);
}

function cleanPhone(raw: string | undefined, leads: Row[], exceptId?: string): string {
  if (!raw) return '';
  const e164 = normalizePhone(raw);
  if (!e164) throw new HttpError(400, 'That phone number does not look right. Use 10 digits, or +country code for numbers outside India.');
  const dup = phoneOwner(leads, e164, exceptId);
  if (dup) throw new HttpError(409, `This number is already in your leads as "${leadLabel(dup)}".`, 'DUPLICATE');
  return e164;
}

// ─── Assignment ─────────────────────────────────────────────────────────────

/** Only active users with "Can receive leads" may be assigned leads (and earn commission). */
export async function activeAssignee(db: Db, id: string): Promise<Row> {
  const user = (await db.all('Users')).find((u) => u.id === id);
  if (!user || !bool(user.active)) throw new HttpError(400, 'Choose an active team member to assign to.');
  if (!bool(user.canReceiveLeads)) throw new HttpError(400, `${user.name.split(' ')[0]} is not set up to receive leads.`);
  return user;
}

let assignmentMinutesOverride: number | null = null;
/** Staging only (validated in config): shorten assignment timers to minutes. */
export function setAssignmentMinutesOverride(minutes: number | null) {
  assignmentMinutesOverride = minutes;
}
/** Timer length in ms for an assignment of `hours`, honouring the staging override. */
export const timerMs = (hours: number) => (assignmentMinutesOverride ? assignmentMinutesOverride * 60_000 : hours * HOUR);

function assignmentPatch(now: Date, assigneeId: string, hours: number | null): Record<string, string> {
  return {
    assignedTo: assigneeId,
    assignedAt: now.toISOString(),
    expiresAt: hours ? new Date(now.getTime() + timerMs(hours)).toISOString() : '',
    expiryApplies: boolCell(Boolean(hours)),
    timerStoppedAt: '',
  };
}

/** Assign (or reassign) leads. A new assignment always restarts the timer. */
export async function assignLeads(
  db: Db,
  actor: SessionUser,
  leadIds: string[],
  assigneeId: string,
  hours: number | null,
  ip?: string,
): Promise<number> {
  const assignee = await activeAssignee(db, assigneeId);
  return db.exclusive(async () => {
    const now = db.now();
    const [state] = await db.loadFresh(['Leads']);
    const leads = leadIds.map((id) => state.rows.find((l) => l.id === id));
    if (leads.some((l) => !l)) throw new HttpError(404, 'One of those leads no longer exists. Reload and try again.');
    await db.updateManyUnqueued('Leads', leadIds.map((id) => ({ id, patch: assignmentPatch(now, assigneeId, hours) })), actor.id);
    await notifyUnqueued(
      db,
      [{
        userId: assigneeId,
        type: 'leads_assigned',
        message: hours
          ? `${leadIds.length} new lead${leadIds.length === 1 ? '' : 's'} assigned to you. Contact them within ${hours} hours or they go back to the founders.`
          : `${leadIds.length} lead${leadIds.length === 1 ? '' : 's'} assigned to you.`,
      }],
      actor.id,
    );
    await auditUnqueued(db, [{
      actorId: actor.id,
      action: 'leads.assign',
      entity: 'Leads',
      after: { leadIds, assignedTo: assigneeId, assignee: assignee.name, hours },
      ip,
    }]);
    return leadIds.length;
  });
}

export async function unassignLeads(db: Db, actor: SessionUser, leadIds: string[], ip?: string): Promise<void> {
  await db.exclusive(async () => {
    await db.updateManyUnqueued(
      'Leads',
      leadIds.map((id) => ({ id, patch: { assignedTo: '', assignedAt: '', expiresAt: '', expiryApplies: 'FALSE', timerStoppedAt: '' } })),
      actor.id,
    );
    await auditUnqueued(db, [{ actorId: actor.id, action: 'leads.unassign', entity: 'Leads', after: { leadIds }, ip }]);
  });
}

/** Deactivation: every lead the user holds goes back to Unclaimed at once. */
export async function releaseLeadsOf(db: Db, userId: string, actorId: string): Promise<number> {
  return db.exclusive(async () => {
    const [state] = await db.loadFresh(['Leads']);
    const held = state.rows.filter((l) => l.assignedTo === userId);
    await db.updateManyUnqueued(
      'Leads',
      held.map((l) => ({ id: l.id, patch: { assignedTo: '', assignedAt: '', expiresAt: '', expiryApplies: 'FALSE', timerStoppedAt: '' } })),
      actorId,
    );
    if (held.length) {
      await auditUnqueued(db, [{
        actorId,
        action: 'leads.released_on_deactivation',
        entity: 'Users',
        entityId: userId,
        after: { leadIds: held.map((l) => l.id) },
      }]);
    }
    return held.length;
  });
}

// ─── Create / update / delete ───────────────────────────────────────────────

export async function createLead(db: Db, actor: SessionUser, input: z.infer<typeof createLeadSchema>): Promise<Row> {
  if (input.assignTo) await activeAssignee(db, input.assignTo);
  return db.exclusive(async () => {
    const now = db.now();
    const [state] = await db.loadFresh(['Leads']);
    const phone = cleanPhone(input.phone, state.rows);
    const { assignTo, deadlineHours, ...fields } = input;
    const row = await db.insertUnqueued(
      'Leads',
      {
        ...fields,
        phone,
        phoneSource: phone ? 'manual' : '',
        dateAdded: istDate(now),
        addedBy: actor.id,
        status: 'New',
        contacted: 'FALSE',
        ...(assignTo ? assignmentPatch(now, assignTo, deadlineHours ?? null) : {}),
      },
      actor.id,
    );
    if (assignTo) {
      await notifyUnqueued(db, [{ userId: assignTo, type: 'leads_assigned', message: `New lead assigned to you: ${leadLabel(row)}.`, refId: row.id }], actor.id);
    }
    return row;
  });
}

export async function updateLead(db: Db, actor: SessionUser, id: string, body: unknown): Promise<Row> {
  const founder = isFounder(actor);
  const parsed = (founder ? founderPatchSchema : employeePatchSchema).safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      !founder && issue?.code === 'unrecognized_keys' ? 'You can only update the call details on this lead.' : issue?.message ?? 'Invalid request.',
    );
  }
  const { expectedUpdatedAt, ...changes } = parsed.data as Record<string, unknown> & { expectedUpdatedAt?: string };

  return db.exclusive(async () => {
    const [state, exp] = await db.loadFresh(['Leads', 'Expirations']);
    const lead = state.rows.find((l) => l.id === id);
    assertLeadAccess(actor, lead, db.now(), exp.rows);

    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined) continue;
      patch[k] = typeof v === 'boolean' ? boolCell(v) : String(v);
    }
    // Contact fields on an unconfirmed Google lead are set only through
    // "Confirm contact" — never typed over a listing the user is looking at.
    if (lead.placeId && !lead.confirmedAt && (patch.businessName || patch.phone || patch.contactPerson)) {
      throw new HttpError(400, 'Use "Confirm contact" after reaching the business to save its name and number.');
    }
    if ('phone' in patch) {
      patch.phone = cleanPhone(patch.phone, state.rows, id);
      if (patch.phone !== lead.phone) patch.phoneSource = patch.phone ? 'manual' : '';
    }
    if (patch.callHappened === 'TRUE' && ['New', 'Contacted'].includes(patch.status ?? lead.status)) patch.status = 'Qualified';
    const { after } = await db.updateUnqueued('Leads', id, patch, actor.id, expectedUpdatedAt);
    return after;
  });
}

export async function deleteLead(db: Db, actor: SessionUser, id: string, ip?: string): Promise<void> {
  await db.exclusive(async () => {
    const removed = await db.removeUnqueued('Leads', id, actor.id);
    await auditUnqueued(db, [{
      actorId: actor.id,
      action: 'lead.delete',
      entity: 'Leads',
      entityId: id,
      before: { label: leadLabel(removed), status: removed.status, placeId: removed.placeId, assignedTo: removed.assignedTo },
      ip,
    }]);
  });
}

// ─── Call log ───────────────────────────────────────────────────────────────

/**
 * Log a call attempt. Decided inside the write queue at server time, so a
 * submission racing the expiry has exactly one outcome: either the attempt is
 * recorded before the deadline (and stops the timer for good) or the lead has
 * already lapsed and the attempt is refused with ASSIGNMENT_EXPIRED.
 */
export async function logCall(db: Db, actor: SessionUser, leadId: string, input: { outcome: string; note?: string } & Record<string, string | undefined>) {
  const settings = await getSettings(db);
  return db.exclusive(async () => {
    const now = db.now();
    const [state, exp] = await db.loadFresh(['Leads', 'Expirations']);
    const lead = state.rows.find((l) => l.id === leadId);
    assertLeadAccess(actor, lead, now, exp.rows);

    const call = await db.insertUnqueued(
      'CallLog',
      { leadId, at: now.toISOString(), userId: actor.id, outcome: input.outcome, note: input.note ?? '' },
      actor.id,
    );

    const patch: Record<string, string> = { contacted: 'TRUE', callOutcome: input.outcome };
    if (!lead.firstCallDate) patch.firstCallDate = istDate(now);
    if (!lead.status || lead.status === 'New') patch.status = 'Contacted';
    for (const k of ['rating', 'decisionMaker', 'need', 'nextStep', 'followUpDate', 'discoveryCallDate'] as const) {
      if (input[k] !== undefined) patch[k] = input[k]!;
    }
    const qualifies = settings.contactedRule === 'any_attempt' || isReachedOutcome(input.outcome);
    if (timerRunning(lead) && qualifies) patch.timerStoppedAt = now.toISOString();

    const { after } = await db.updateUnqueued('Leads', leadId, patch, actor.id);
    return { lead: after, call, timerStopped: Boolean(patch.timerStoppedAt) };
  });
}

// ─── Confirm contact ────────────────────────────────────────────────────────

/**
 * Save the contact a person verified by reaching the business. This is
 * first-party data typed by the user — never copied from a Places response —
 * and once saved the lead needs no more live lookups.
 */
export async function confirmContact(db: Db, actor: SessionUser, leadId: string, input: z.infer<typeof confirmSchema>) {
  return db.exclusive(async () => {
    const now = db.now();
    const [state, exp] = await db.loadFresh(['Leads', 'Expirations']);
    const lead = state.rows.find((l) => l.id === leadId);
    assertLeadAccess(actor, lead, now, exp.rows);
    const phone = cleanPhone(input.phone, state.rows, leadId);
    const { after } = await db.updateUnqueued(
      'Leads',
      leadId,
      {
        businessName: input.businessName,
        contactPerson: input.contactPerson ?? lead.contactPerson,
        phone,
        phoneSource: 'outreach_confirmed',
        confirmedAt: now.toISOString(),
        confirmedBy: actor.id,
      },
      actor.id,
    );
    return after;
  });
}

/**
 * Pre-save check for Confirm contact: the E.164 form, and the label of any
 * other lead that already has this number (all stored numbers are first-party).
 */
export async function checkPhone(db: Db, actor: SessionUser, leadId: string, raw: string) {
  const [leads, exp] = await Promise.all([readLeads(db), db.all('Expirations')]);
  assertLeadAccess(actor, leads.find((l) => l.id === leadId), db.now(), exp);
  const e164 = normalizePhone(raw);
  const dup = e164 ? phoneOwner(leads, e164, leadId) : undefined;
  return { e164, duplicateOf: dup ? leadLabel(dup) : null };
}

// ─── Commission ─────────────────────────────────────────────────────────────

/** Record the commission currently earned on a lead as paid (founders). */
export async function markCommissionPaid(db: Db, actor: SessionUser, leadId: string, ip?: string) {
  const ctx = await viewContext(db);
  return db.exclusive(async () => {
    const [state] = await db.loadFresh(['Leads']);
    const lead = state.rows.find((l) => l.id === leadId);
    if (!lead) throw new HttpError(404, 'Lead not found.');
    const earned = commissionFor(commissionInput(lead), ctx.rates);
    if (earned <= num(lead.commissionPaid)) throw new HttpError(400, 'Nothing is pending on this lead.');
    const { before, after } = await db.updateUnqueued(
      'Leads',
      leadId,
      { commissionPaid: String(earned), commissionPaidAt: db.now().toISOString() },
      actor.id,
    );
    if (lead.assignedTo) {
      await notifyUnqueued(db, [{ userId: lead.assignedTo, type: 'commission_paid', message: `Commission paid: ₹${(earned - num(before.commissionPaid)).toLocaleString('en-IN')} for ${leadLabel(lead)}.`, refId: leadId }], actor.id);
    }
    await auditUnqueued(db, [{
      actorId: actor.id,
      action: 'commission.paid',
      entity: 'Leads',
      entityId: leadId,
      before: { commissionPaid: num(before.commissionPaid) },
      after: { commissionPaid: earned, assignee: lead.assignedTo },
      ip,
    }]);
    return after;
  });
}
