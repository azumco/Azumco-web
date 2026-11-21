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
import { formatDate, fromIst, istDate } from '../../shared/time.ts';

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

export const MEETING_MODES = ['Zoho Cliq', 'Phone call', 'In person'] as const;

export const bookingSchema = z.object({
  leadId: z.string().min(1),
  founderId: z.string().min(1), // a user id, or "any"
  date: day,
  start: hhmm,
  clientName: z.string().trim().min(1, 'Enter the client name.').max(150),
  phone: z.string().trim().max(40).default(''),
  mode: z.enum(MEETING_MODES),
  link: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(1000).default(''),
});

export const rescheduleSchema = z.object({ date: day, start: hhmm });

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDays = (d: string, n: number) => istDate(new Date(fromIst(d).getTime() + n * 86_400_000));
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export type Slot = {
  founderId: string;
  date: string;
  start: string;
  end: string;
  booked: boolean;
};

const isActive = (b: Row) => b.status === 'booked';
type Span = Record<string, unknown>;
/** Same founder-agnostic time overlap on the same IST day. */
const overlaps = (a: Span, b: Span) =>
  a.date === b.date && String(a.start) < String(b.end) && String(b.start) < String(a.end);

/** Does availability row `a` cover IST day `d`? */
function coversDay(a: Row, d: string): boolean {
  if (a.date === d) return true;
  if (a.repeatWeekly !== 'TRUE' || d < a.date) return false;
  if (a.repeatUntil && d > a.repeatUntil) return false;
  return weekday(d) === weekday(a.date);
}

/** Expand availability into bookable slots for [from, from+days), dropping past ones. */
export function expandSlots(availability: Row[], bookings: Row[], from: string, days: number, now: Date, founderFilter?: string): Slot[] {
  const out: Slot[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    for (const a of availability) {
      if (founderFilter && a.founderId !== founderFilter) continue;
      if (!coversDay(a, d)) continue;
      const len = Number(a.slotMinutes) || 30;
      for (let m = toMin(a.start); m + len <= toMin(a.end); m += len) {
        const slot = { founderId: a.founderId, date: d, start: toTime(m), end: toTime(m + len) };
        const key = `${slot.founderId}|${d}|${slot.start}`;
        if (seen.has(key) || fromIst(d, slot.start) <= now) continue;
        seen.add(key);
        const booked = bookings.some((b) => b.founderId === slot.founderId && isActive(b) && overlaps(b, slot));
        out.push({ ...slot, booked });
      }
    }
  }
  return out.sort((x, y) => (x.date + x.start + x.founderId).localeCompare(y.date + y.start + y.founderId));
}

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

    return this.db.exclusive(async () => {
      const now = this.db.now();
      const [availability, bookings] = await this.db.loadFresh(['Availability', 'Bookings']);
      const open = expandSlots(availability.rows, bookings.rows, input.date, 1, now).filter(
        (s) => !s.booked && s.start === input.start && (input.founderId === 'any' || s.founderId === input.founderId),
      );
      if (!open.length) throw new HttpError(409, 'That slot is no longer available. Pick another time.', 'SLOT_TAKEN');
      const slot = open[0];

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
        link: input.link,
        notes: input.notes,
        bookedBy: actor.id,
        callHappened: '',
      }, actor.id);

      // Read back: the earliest overlapping active booking in sheet order wins.
      const [after] = await this.db.loadFresh(['Bookings']);
      const winner = after.rows.find((b) => isActive(b) && b.founderId === slot.founderId && overlaps(b, slot));
      if (winner && winner.id !== mine.id) {
        await this.db.updateUnqueued('Bookings', mine.id, { status: 'cancelled' }, actor.id);
        throw new HttpError(409, 'That slot was just taken. Pick another time.', 'SLOT_TAKEN');
      }

      await this.db.updateUnqueued('Leads', input.leadId, { discoveryCallDate: slot.date }, actor.id);
      await notifyUnqueued(this.db, [{
        userId: slot.founderId,
        type: 'booking_created',
        message: `Discovery call booked: ${leadLabel(lead)} on ${formatDate(slot.date)} at ${slot.start} IST (${input.mode}).`,
        refId: mine.id,
      }], actor.id);
      return mine;
    });
  }

  private async ownBooking(actor: SessionUser, id: string): Promise<Row> {
    if (!isFounder(actor)) throw new HttpError(403, 'Only founders can change bookings.');
    const b = await this.db.find('Bookings', id);
    if (!b) throw new HttpError(404, 'Booking not found.');
    return b;
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

      const { before } = await this.db.updateUnqueued('Bookings', id, { date: slot.date, start: slot.start, end: slot.end, status: 'booked' }, actor.id);
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
