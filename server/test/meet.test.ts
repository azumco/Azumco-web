// Google Meet for booked calls: link validation, share links, default mode,
// missing-link handling, per-booking override, permissions, and old bookings.

import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, memberClient, startHarness, superAdmin, type Harness } from './harness.ts';
import { DEFAULT_MEETING_MODE, googleCalendarLink, istWhen, normalizeMeetLink, whatsappLink, whatsappText } from '../../shared/meet.ts';

const LINK_A = 'https://meet.google.com/abc-defg-hij';
const LINK_B = 'https://meet.google.com/xyz-wxyz-uvw';
let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

describe('Meet link validation', () => {
  it('accepts the Meet format (trimmed, lowercased) and rejects everything else', () => {
    expect(normalizeMeetLink(`  ${LINK_A}  `)).toBe(LINK_A);
    expect(normalizeMeetLink('HTTPS://MEET.GOOGLE.COM/ABC-DEFG-HIJ')).toBe(LINK_A);
    expect(normalizeMeetLink('meet.google.com/abc-defg-hij')).toBe(LINK_A);
    expect(normalizeMeetLink('')).toBe('');
    for (const bad of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com/abcdefghij', 'https://meet.google.com/abc-defg-hij?x=1', 'https://meet.google.com.evil.com/abc-defg-hij', 'https://zoom.us/j/123', 'https://meet.google.com/abc-defg-hi1']) {
      expect(normalizeMeetLink(bad)).toBeNull();
    }
  });
});

describe('Share links', () => {
  const booking = { date: '2026-11-24', start: '16:30', end: '17:00', clientName: 'Rakesh Kumar', founderName: 'Ayesha Rao', link: LINK_A };

  it('formats the date and time in IST', () => {
    expect(istWhen('2026-11-24', '16:30')).toBe('Tue 24 Nov, 4:30 PM IST');
    expect(istWhen('2026-11-30', '00:05')).toBe('Mon 30 Nov, 12:05 AM IST');
    expect(istWhen('2026-12-01', '12:00')).toBe('Tue 1 Dec, 12:00 PM IST');
  });

  it('WhatsApp: greeting, IST time, founder first name, Azumco and the link, correctly encoded', () => {
    const text = whatsappText(booking);
    expect(text).toBe(`Hi Rakesh, your call with Ayesha from Azumco is on Tue 24 Nov, 4:30 PM IST. Join on Google Meet: ${LINK_A}`);
    const url = whatsappLink('+919826012345', text);
    expect(url.startsWith('https://wa.me/919826012345?text=')).toBe(true);
    const encoded = url.split('?text=')[1];
    expect(encoded).not.toMatch(/[ ,:/]/); // spaces, commas, colons and slashes are encoded
    expect(decodeURIComponent(encoded)).toBe(text);
    // Characters that would break a query string are encoded too.
    const tricky = whatsappLink('+919826012345', 'A & B #1 ? 100%');
    expect(decodeURIComponent(tricky.split('?text=')[1])).toBe('A & B #1 ? 100%');
    expect(tricky).not.toContain(' & ');
  });

  it('Google Calendar: title, UTC start/end for the IST slot, link in the details', () => {
    const u = new URL(googleCalendarLink({ ...booking, leadLabel: 'Iron Gym' }));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe('Azumco discovery call · Iron Gym');
    expect(u.searchParams.get('dates')).toBe('20261124T110000Z/20261124T113000Z'); // 4:30–5:00 PM IST
    expect(u.searchParams.get('details')).toContain(LINK_A);
    expect(u.searchParams.get('location')).toBe(LINK_A);
  });
});

async function setup() {
  h = await startHarness();
  const owner = await superAdmin(h);
  const admin = await memberClient(h, owner, ADMIN_EMAIL);
  const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
  const users = (await owner.req('GET', '/api/users')).body.users as { id: string; email: string; role: string; updatedAt: string }[];
  const ownerId = users.find((u) => u.role === 'super_admin')!.id;
  return { owner, admin: admin.client, adminId: admin.id, staff: staff.client, staffId: staff.id, ownerId, users };
}

describe('Editing Meet links (permissions)', () => {
  it('a founder sets their own; the super admin sets anyone’s; team members cannot', async () => {
    const { owner, admin, staff, adminId, staffId } = await setup();
    // Founder (admin): own link via /me/meet-link, validated and normalised.
    expect((await admin.req('PATCH', '/api/me/meet-link', { meetLink: 'not a link' })).status).toBe(400);
    const mine = await admin.req('PATCH', '/api/me/meet-link', { meetLink: ` ${LINK_A.toUpperCase()} ` });
    expect(mine.status).toBe(200);
    expect(mine.body.meetLink).toBe(LINK_A);
    // …but not someone else's (the users API is super admin only).
    expect((await admin.req('PATCH', `/api/users/${staffId}`, { meetLink: LINK_B })).status).toBe(403);
    // Team member: no route for them.
    expect((await staff.req('PATCH', '/api/me/meet-link', { meetLink: LINK_B })).status).toBe(403);
    expect((await staff.req('PATCH', `/api/users/${staffId}`, { meetLink: LINK_B })).status).toBe(403);

    // Super admin: any founder, and their own; not a team member's.
    const list = (await owner.req('GET', '/api/users')).body.users as { id: string; updatedAt: string; meetLink: string }[];
    const adminRow = list.find((u) => u.id === adminId)!;
    expect(adminRow.meetLink).toBe(LINK_A);
    expect((await owner.req('PATCH', `/api/users/${adminId}`, { meetLink: LINK_B, expectedUpdatedAt: adminRow.updatedAt })).status).toBe(200);
    expect((await owner.req('PATCH', '/api/me/meet-link', { meetLink: LINK_A })).status).toBe(200);
    const staffRow = list.find((u) => u.id === staffId)!;
    const refused = await owner.req('PATCH', `/api/users/${staffId}`, { meetLink: LINK_A, expectedUpdatedAt: staffRow.updatedAt });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/Only founders/);
    // Cleared with ''.
    expect((await admin.req('PATCH', '/api/me/meet-link', { meetLink: '' })).body.meetLink).toBe('');
    // Every change is audited.
    const audit = (await owner.req('GET', '/api/audit')).body.entries.map((e: { action: string }) => e.action);
    expect(audit).toContain('users.meet_link');
  });
});

describe('Booking with Google Meet', () => {
  async function bookable() {
    const s = await setup();
    await s.admin.req('POST', '/api/availability', { date: '2026-11-23', start: '10:00', end: '11:00', slotMinutes: 30 });
    const lead = (await s.admin.req('POST', '/api/leads', { businessName: 'Meet Co', assignTo: s.staffId })).body.id as string;
    return { ...s, lead };
  }
  const body = (leadId: string, founderId: string, start: string, extra: Record<string, unknown> = {}) => ({ leadId, founderId, date: '2026-11-23', start, clientName: 'Rakesh', phone: '98260 12345', ...extra });

  it('Google Meet is the default mode and uses the founder’s saved link; the founder is notified with it', async () => {
    const { admin, staff, lead, adminId } = await bookable();
    expect(DEFAULT_MEETING_MODE).toBe('Google Meet');
    await admin.req('PATCH', '/api/me/meet-link', { meetLink: LINK_A });
    const r = await staff.req('POST', '/api/bookings', body(lead, adminId, '10:00')); // no mode sent
    expect(r.status).toBe(201);
    expect(r.body.booking).toMatchObject({ mode: 'Google Meet', link: LINK_A, phone: '+919826012345' });
    const notes = (await admin.req('GET', '/api/notifications')).body.notifications as { type: string; message: string }[];
    expect(notes.find((n) => n.type === 'booking_created')!.message).toContain(LINK_A);
  });

  it('missing link: blocked unless a valid per-booking link is given; the founder’s saved link wins when present', async () => {
    const { admin, staff, lead, adminId } = await bookable();
    const missing = await staff.req('POST', '/api/bookings', body(lead, adminId, '10:00', { mode: 'Google Meet' }));
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('MEET_LINK_MISSING');
    expect(missing.body.error).toMatch(/hasn't added a Meet link yet/);
    expect((await staff.req('POST', '/api/bookings', body(lead, adminId, '10:00', { mode: 'Google Meet', link: 'https://zoom.us/j/1' }))).body.code).toBe('MEET_LINK_INVALID');
    const ok = await staff.req('POST', '/api/bookings', body(lead, adminId, '10:00', { mode: 'Google Meet', link: LINK_B }));
    expect(ok.status).toBe(201);
    expect(ok.body.booking.link).toBe(LINK_B);
    // Once the founder saves a link, it is used even if a per-booking one is sent.
    await admin.req('PATCH', '/api/me/meet-link', { meetLink: LINK_A });
    const next = await staff.req('POST', '/api/bookings', body(lead, adminId, '10:30', { mode: 'Google Meet', link: LINK_B }));
    expect(next.body.booking.link).toBe(LINK_A);
  });

  it('"Any founder" uses the link of the founder the slot belongs to', async () => {
    const { owner, admin, staff, lead, ownerId } = await bookable();
    // Both founders free at 10:00; only the super admin has a link.
    await owner.req('POST', '/api/availability', { date: '2026-11-23', start: '10:00', end: '11:00', slotMinutes: 30 });
    await owner.req('PATCH', '/api/me/meet-link', { meetLink: LINK_B });
    const r = await staff.req('POST', '/api/bookings', body(lead, 'any', '10:00'));
    expect(r.status).toBe(201);
    expect(r.body.booking).toMatchObject({ founderId: ownerId, link: LINK_B });
    void admin;
  });

  it('other modes are unchanged and existing bookings without a link still list', async () => {
    const { admin, staff, lead, adminId } = await bookable();
    const phone = await staff.req('POST', '/api/bookings', body(lead, adminId, '10:00', { mode: 'Phone call' }));
    expect(phone.status).toBe(201);
    expect(phone.body.booking).toMatchObject({ mode: 'Phone call', link: '' });
    const cliq = await staff.req('POST', '/api/bookings', body(lead, adminId, '10:30', { mode: 'Zoho Cliq', link: 'https://cliq.zoho.in/room/x' }));
    expect(cliq.body.booking.link).toBe('https://cliq.zoho.in/room/x');
    // A booking stored before this change (old mode, no link) still displays.
    await h!.db.exclusive(() => h!.db.insertManyUnqueued('Bookings', [{ leadId: lead, founderId: adminId, date: '2026-11-24', start: '09:00', end: '09:30', status: 'booked', clientName: 'Old', phone: '', mode: 'Zoho Cliq', link: '', notes: '', bookedBy: adminId, callHappened: '' }], 'test'));
    const list = (await admin.req('GET', '/api/bookings')).body.bookings as { clientName: string; mode: string; link: string }[];
    expect(list.find((b) => b.clientName === 'Old')).toMatchObject({ mode: 'Zoho Cliq', link: '' });
  });

  it('Meet links are not exposed without a session', async () => {
    await bookable();
    const res = await fetch(`${h!.url}/api/slots`, { headers: { 'X-Requested-With': 'azumco' } });
    expect(res.status).toBe(401);
  });
});
