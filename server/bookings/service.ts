// Founder availability and discovery-call bookings. IST throughout: dates are
// "YYYY-MM-DD" and times "HH:mm" as seen in India; instants are derived with
// fromIst() when comparing against the server clock.
//
// Double booking is prevented twice over:
//   1. check-and-write happen together inside the serialized write queue;
//   2. after writing, the Bookings tab is READ BACK. If another active booking
//      for the same founder overlaps and sits earlier in the sheet (another
//      process won a deploy-overlap race), this booking cancels itself.

import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import { boolCell } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { auditUnqueued } from '../audit.ts';
import { notifyUnqueued } from '../notifications.ts';
import { assertLeadAccess, isFounder } from '../leads/access.ts';
import { leadLabel, readLeads } from '../leads/service.ts';
import { normalizePhone } from '../../shared/phone.ts';
import { formatDate } from '../../shared/time.ts';
import { isConstraintViolation } from '../db/pg.ts';
import { DEFAULT_MEETING_MODE, MEET_LINK_ERROR, MEETING_MODES, normalizeMeetLink } from '../../shared/meet.ts';
import { expandRules, planSlots, type AvailRule } from '../../shared/slots.ts';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 14:30.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30.');

export const availabilitySchema = z
  .object({
    date: day,
    start: hhmm,
    end: hhmm,
    slotMinutes: z.union([z.literal(20), z.literal(30)]),
    repeatWeekly: z.boolean().default(false),
    repeatUntil: z.union([day, z.literal('')]).default(''),
  })
  .refine((a) => a.start < a.end, { message: 'The end time must be after the start time.' });

export { MEETING_MODES };

export const bookingSchema = z.object({
  leadId: z.string().min(1),
  founderId: z.string().min(1), // a user id, or "any"
  date: day,
  start: hhmm,
  clientName: z.string().trim().min(1, 'Enter the client name.').max(150),
  phone: z.string().trim().max(40).default(''),
  mode: z.enum(MEETING_MODES).default(DEFAULT_MEETING_MODE),
  /** Zoho Cliq: the room link. Google Meet: this booking's link (prefilled with the founder's saved one; the booker may paste their own). */
  link: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(1000).default(''),
});

export const rescheduleSchema = z.object({ date: day, start: hhmm });

const to12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export type Slot = {
  founderId: string;
  date: string;
  start: string;
  end: string;
  booked: boolean;
};

const isActive = (b: Row) => b.status === 'booked';
type Span = Record<string, unknown>;
/** Time overlap on the same IST day. */
const overlaps = (a: Span, b: Span) =>
  a.date === b.date && String(a.start) < String(b.end) && String(b.start) < String(a.end);

export const toRule = (a: Row): AvailRule => ({
  founderId: a.founderId,
  date: a.date,
  start: a.start,
  end: a.end,
  slotMinutes: Number(a.slotMinutes) || 30,
  repeatWeekly: a.repeatWeekly === 'TRUE',
  repeatUntil: a.repeatUntil,
});

/** Expand availability into bookable slots (shared rules: past and overlapping slots dropped). */
export function expandSlots(availability: Row[], bookings: Row[], from: string, days: number, now: Date, founderFilter?: string): Slot[] {
  return expandRules(availability.map(toRule), from, days, now.getTime(), founderFilter).map((slot) => ({
    ...slot,
    booked: bookings.some((b) => b.founderId === slot.founderId && isActive(b) && overlaps(b, { ...slot })),
  }));
}

export const slotBatchSchema = z.object({
  dates: z.array(day).min(1, 'Choose at least one day.').max(14),
  start: hhmm,
  end: hhmm,
  slotMinutes: z.union([z.literal(20), z.literal(30)]),
  repeatWeekly: z.boolean().default(false),
});

export class BookingService {
  constructor(private readonly db: Db) {}

  // ── Availability (each founder manages their own) ───────────────────────

  async listAvailability(founderId?: string) {
    const rows = await this.db.all('Availability');
    return founderId ? rows.filter((a) => a.founderId === founderId) : rows;
  }

  async addAvailability(actor: SessionUser, input: z.infer<typeof availabilitySchema>) {
    if (input.repeatUntil && input.repeatUntil < input.date) throw new HttpError(400, 'Repeat-until must be on or after the start date.');
    return this.db.insert('Availability', {
      founderId: actor.id,
      date: input.date,
      start: input.start,
      end: input.end,
      slotMinutes: String(input.slotMinutes),
      repeatWeekly: boolCell(input.repeatWeekly),
      repeatUntil: input.repeatUntil,
    }, actor.id);
  }

  /**
   * "Add my free slots": one rule per chosen day that gains at least one new
   * slot. Uses the same planner as the modal's preview, inside the write
   * queue, so the created count equals the preview.
   */
  async addSlots(actor: SessionUser, input: z.infer<typeof slotBatchSchema>) {
    return this.db.exclusive(async () => {
      const [state] = await this.db.loadFresh(['Availability']);
      const plan = planSlots({
        founderId: actor.id,
        existing: state.rows.filter((r) => r.founderId === actor.id).map(toRule),
        dates: input.dates,
        start: input.start,
        end: input.end,
        slotMinutes: input.slotMinutes,
        nowMs: this.db.now().getTime(),
      });
      if (plan.error) throw new HttpError(400, plan.error);
      await this.db.insertManyUnqueued(
        'Availability',
        plan.perDate.map((p) => ({
          founderId: actor.id,
          date: p.date,
          start: input.start,
          end: input.end,
          slotMinutes: String(input.slotMinutes),
          repeatWeekly: boolCell(input.repeatWeekly),
          repeatUntil: '',
        })),
        actor.id,
      );
      return { created: plan.total, days: plan.perDate.length };
    });
  }

  async setRepeat(actor: SessionUser, id: string, repeatWeekly: boolean) {
    const row = await this.db.find('Availability', id);
    if (!row || row.founderId !== actor.id) throw new HttpError(404, 'Not found.');
    await this.db.update('Availability', id, { repeatWeekly: boolCell(repeatWeekly) }, actor.id);
  }

  async removeAvailability(actor: SessionUser, id: string) {
    const row = await this.db.find('Availability', id);
    if (!row || (row.founderId !== actor.id && actor.role !== 'super_admin')) throw new HttpError(404, 'Not found.');
    await this.db.remove('Availability', id, actor.id);
  }

  async slots(from: string, days: number, founderId?: string) {
    const [availability, bookings] = await Promise.all([this.db.all('Availability'), this.db.all('Bookings')]);
    return expandSlots(availability, bookings, from, Math.min(days, 31), this.db.now(), founderId && founderId !== 'any' ? founderId : undefined);
  }

  // ── Bookings ────────────────────────────────────────────────────────────

  async list(actor: SessionUser) {
    const rows = await this.db.all('Bookings');
    return isFounder(actor) ? rows : rows.filter((b) => b.bookedBy === actor.id);
  }

  async book(actor: SessionUser, input: z.infer<typeof bookingSchema>) {
    const lead = (await readLeads(this.db)).find((l) => l.id === input.leadId);
    assertLeadAccess(actor, lead, this.db.now(), await this.db.all('Expirations'));
    const phone = input.phone ? normalizePhone(input.phone) : '';
    if (input.phone && !phone) throw new HttpError(400, 'That phone number does not look right.');
    const meet = input.mode === 'Google Meet';
    const override = meet ? normalizeMeetLink(input.link) : '';
    if (meet && override === null) throw new HttpError(400, MEET_LINK_ERROR, 'MEET_LINK_INVALID');

    return this.db.exclusive(async () => {
      const now = this.db.now();
      const [availability, bookings] = await this.db.loadFresh(['Availability', 'Bookings']);
      const open = expandSlots(availability.rows, bookings.rows, input.date, 1, now).filter(
        (s) => !s.booked && s.start === input.start && (input.founderId === 'any' || s.founderId === input.founderId),
      );
      if (!open.length) throw new HttpError(409, 'That slot is no longer available. Pick another time.', 'SLOT_TAKEN');
      const users = await this.db.all('Users');
      const meetOf = (id: string) => normalizeMeetLink(users.find((u) => u.id === id)?.meetLink) || '';
      // "Any founder" with Google Meet: prefer a founder who has a Meet link saved.
      const slot = meet ? (open.find((s) => meetOf(s.founderId)) ?? open[0]) : open[0];
      // The link typed on the booking wins; otherwise the founder's saved link.
      const link = meet ? override || meetOf(slot.founderId) || '' : input.link;
      if (meet && !link) {
        const name = (users.find((u) => u.id === slot.founderId)?.name ?? 'This founder').split(' ')[0];
        throw new HttpError(400, `${name} hasn't added a Meet link yet. Paste a Meet link for this booking.`, 'MEET_LINK_MISSING');
      }

      // Postgres also enforces this with an exclusion constraint (no overlapping active bookings per founder).
      const mine = await this.db.insertUnqueued('Bookings', {
        leadId: input.leadId,
        founderId: slot.founderId,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        status: 'booked',
        clientName: input.clientName,
        phone: phone || '',
        mode: input.mode,
        link,
        notes: input.notes,
        bookedBy: actor.id,
        callHappened: '',
      }, actor.id).catch((e) => {
        if (isConstraintViolation(e)) throw new HttpError(409, 'That slot was just taken. Pick another time.', 'SLOT_TAKEN');
        throw e;
      });

      // Read back: the earliest overlapping active booking in sheet order wins.
      const [after] = await this.db.loadFresh(['Bookings']);
      const winner = after.rows.find((b) => isActive(b) && b.founderId === slot.founderId && overlaps(b, slot));
      if (winner && winner.id !== mine.id) {
        await this.db.updateUnqueued('Bookings', mine.id, { status: 'cancelled' }, actor.id);
        throw new HttpError(409, 'That slot was just taken. Pick another time.', 'SLOT_TAKEN');
      }

      // Booking a discovery call clears any pending follow-up and next step.
      await this.db.updateUnqueued('Leads', input.leadId, { discoveryCallDate: slot.date, followUpDate: '', nextStep: '' }, actor.id);
      const first = (id: string) => (users.find((u) => u.id === id)?.name ?? '').split(' ')[0];
      const time = to12(slot.start);
      await notifyUnqueued(this.db, [
        {
          userId: slot.founderId,
          type: 'booking_created',
          message: `Discovery call booked: ${leadLabel(lead)} on ${formatDate(slot.date)} at ${time} (${input.mode}) by ${first(actor.id)}.${meet ? ` Google Meet: ${link}` : ''}`,
          refId: mine.id,
        },
        ...(actor.id !== slot.founderId
          ? [{ userId: actor.id, type: 'booking_confirmed', message: `Booked: ${leadLabel(lead).replace(/ · Google lead$/, '')} · ${formatDate(slot.date).slice(0, 6)}, ${time} with ${first(slot.founderId)}.`, refId: mine.id }]
          : []),
      ], actor.id);
      return mine;
    });
  }

  private async ownBooking(actor: SessionUser, id: string): Promise<Row> {
    if (!isFounder(actor)) throw new HttpError(403, 'Only founders can change bookings.');
    const b = await this.db.find('Bookings', id);
    if (!b) throw new HttpError(404, 'Booking not found.');
    return b;
  }

  /** Founders change the meeting link on an existing Google Meet booking. */
  async setLink(actor: SessionUser, id: string, raw: string) {
    const b = await this.ownBooking(actor, id);
    if (b.mode !== 'Google Meet') throw new HttpError(400, 'Only Google Meet bookings have a Meet link.');
    const link = normalizeMeetLink(raw);
    if (!link) throw new HttpError(400, MEET_LINK_ERROR, 'MEET_LINK_INVALID');
    return this.db.exclusive(async () => {
      const { after } = await this.db.updateUnqueued('Bookings', id, { link }, actor.id);
      await auditUnqueued(this.db, [{ actorId: actor.id, action: 'booking.link', entity: 'Bookings', entityId: id, before: { link: b.link }, after: { link } }]);
      return after;
    });
  }

  async cancel(actor: SessionUser, id: string) {
    const b = await this.ownBooking(actor, id);
    await this.db.exclusive(async () => {
      await this.db.updateUnqueued('Bookings', id, { status: 'cancelled' }, actor.id);
      await notifyUnqueued(this.db, [{
        userId: b.bookedBy,
        type: 'booking_cancelled',
        message: `The discovery call with ${b.clientName} on ${formatDate(b.date)} at ${b.start} IST was cancelled.`,
        refId: id,
      }], actor.id);
    });
  }

  async reschedule(actor: SessionUser, id: string, input: z.infer<typeof rescheduleSchema>) {
    const b = await this.ownBooking(actor, id);
    return this.db.exclusive(async () => {
      const now = this.db.now();
      const [availability, bookings] = await this.db.loadFresh(['Availability', 'Bookings']);
      const others = bookings.rows.filter((x) => x.id !== id);
      const slot = expandSlots(availability.rows, others, input.date, 1, now, b.founderId).find((s) => !s.booked && s.start === input.start);
      if (!slot) throw new HttpError(409, 'That slot is not available.', 'SLOT_TAKEN');

      const { before } = await this.db.updateUnqueued('Bookings', id, { date: slot.date, start: slot.start, end: slot.end, status: 'booked' }, actor.id).catch((e) => {
        if (isConstraintViolation(e)) throw new HttpError(409, 'That slot was just taken.', 'SLOT_TAKEN');
        throw e;
      });
      const [after] = await this.db.loadFresh(['Bookings']);
      const winner = after.rows.find((x) => isActive(x) && x.founderId === b.founderId && overlaps(x, slot));
      if (winner && winner.id !== id) {
        await this.db.updateUnqueued('Bookings', id, { date: before.date, start: before.start, end: before.end }, actor.id);
        throw new HttpError(409, 'That slot was just taken.', 'SLOT_TAKEN');
      }
      await this.db.updateUnqueued('Leads', b.leadId, { discoveryCallDate: slot.date }, actor.id).catch(() => undefined);
      await notifyUnqueued(this.db, [{
        userId: b.bookedBy,
        type: 'booking_rescheduled',
        message: `The discovery call with ${b.clientName} moved to ${formatDate(slot.date)} at ${slot.start} IST.`,
        refId: id,
      }], actor.id);
      return { ...b, ...slot };
    });
  }

  /** "Call happened: yes" qualifies the lead for the per-qualified-lead commission. */
  async markCallHappened(actor: SessionUser, id: string, happened: boolean, ip?: string) {
    const b = await this.ownBooking(actor, id);
    return this.db.exclusive(async () => {
      await this.db.updateUnqueued('Bookings', id, { callHappened: boolCell(happened), status: happened ? 'completed' : 'no_show' }, actor.id);
      const [leads] = await this.db.loadFresh(['Leads']);
      const lead = leads.rows.find((l) => l.id === b.leadId);
      if (lead) {
        const patch: Record<string, string> = { callHappened: boolCell(happened) };
        if (happened && ['', 'New', 'Contacted'].includes(lead.status)) patch.status = 'Qualified';
        await this.db.updateUnqueued('Leads', lead.id, patch, actor.id);
      }
      await auditUnqueued(this.db, [{ actorId: actor.id, action: 'booking.call_happened', entity: 'Bookings', entityId: id, after: { happened, leadId: b.leadId }, ip }]);
    });
  }
}
