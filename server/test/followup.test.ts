// Follow-ups: a call replaces them, a booking clears them, "Overdue" only when
// it really is, IST everywhere, and existing rows are corrected at read time.

import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, FakeClock, memberClient, startHarness, superAdmin, type Harness, type Client } from './harness.ts';
import { addDays } from '../../shared/slots.ts';
import { istDate } from '../../shared/time.ts';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

interface View { followUp: string; followUpDate: string; nextStep: string; nextAction: string; booking: { date: string; start: string } | null }

async function setup(clockIso = '2026-11-20T05:00:00Z') {
  h = await startHarness(undefined, undefined, { clock: new FakeClock(new Date(clockIso)) });
  const owner = await superAdmin(h);
  const admin = await memberClient(h, owner, ADMIN_EMAIL);
  const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
  const newLead = async (name: string) => (await admin.client.req('POST', '/api/leads', { businessName: name, assignTo: staff.id })).body.id as string;
  return { owner, admin: admin.client, staff: staff.client, staffId: staff.id, newLead };
}
const view = async (c: Client, id: string) => (await c.req('GET', `/api/leads/${id}`)).body.lead as View;
const call = (c: Client, id: string, body: Record<string, string>) => c.req('POST', `/api/leads/${id}/calls`, { outcome: 'Busy · call later', ...body });

describe('Follow-ups', () => {
  it('a new call replaces the old follow-up (the user’s case: 21 Nov must not survive a call on 22 Nov)', async () => {
    const { staff, newLead } = await setup();
    const id = await newLead('Replace Co');
    await call(staff, id, { nextStep: 'Call again', followUpDate: '2026-11-21' });
    h!.clock.set('2026-11-22T06:00:00Z'); // 22 Nov, 11:30 AM IST
    expect((await view(staff, id)).followUp).toBe('overdue');
    await call(staff, id, { nextStep: 'Send WhatsApp', followUpDate: '2026-11-25' });
    const v = await view(staff, id);
    expect(v).toMatchObject({ followUp: 'upcoming', followUpDate: '2026-11-25', nextStep: 'Send WhatsApp', nextAction: 'Follow up Wed 25 Nov' });
  });

  it('a call with no follow-up clears it', async () => {
    const { staff, newLead } = await setup();
    const id = await newLead('Clear Co');
    await call(staff, id, { nextStep: 'Call again', followUpDate: '2026-11-21' });
    await call(staff, id, {}); // nothing chosen
    const v = await view(staff, id);
    expect(v).toMatchObject({ followUp: 'none', followUpDate: '', nextStep: '', nextAction: 'No next step' });
    const row = (await h!.db.loadFresh(['Leads']))[0].rows.find((l) => l.id === id)!;
    expect(row.followUpDate).toBe('');
  });

  it('booking clears the follow-up and shows the booking; cancelling does not bring it back', async () => {
    const { admin, staff, newLead } = await setup();
    const id = await newLead('Booked Co');
    await call(staff, id, { nextStep: 'Book discovery call', followUpDate: '2026-11-21' });
    await admin.req('POST', '/api/availability', { date: '2026-11-23', start: '10:00', end: '11:00', slotMinutes: 30 });
    const founderId = (await staff.req('GET', '/api/slots?from=2026-11-23&days=1')).body.slots[0].founderId;
    const b = await staff.req('POST', '/api/bookings', { leadId: id, founderId, date: '2026-11-23', start: '10:00', clientName: 'Client', mode: 'Phone call' });
    expect(b.status).toBe(201);
    h!.clock.set('2026-11-22T06:00:00Z'); // the old follow-up date has passed
    let v = await view(staff, id);
    expect(v).toMatchObject({ followUp: 'none', followUpDate: '', booking: { date: '2026-11-23', start: '10:00' }, nextAction: 'Call booked · Mon 23 Nov, 10:00 AM' });
    // Leads list and the founder's view say the same.
    const listed = ((await admin.req('GET', '/api/leads')).body.leads as (View & { id: string })[]).find((l) => l.id === id)!;
    expect(listed.nextAction).toBe('Call booked · Mon 23 Nov, 10:00 AM');

    await admin.req('POST', `/api/bookings/${b.body.booking.id}/cancel`);
    v = await view(staff, id);
    expect(v).toMatchObject({ followUp: 'none', booking: null, nextStep: '', nextAction: 'No next step' });
  });

  it('“Overdue” only when: date before today (IST), no call since, no upcoming booking — derived for existing rows', async () => {
    const { admin, staff, staffId, newLead } = await setup('2026-11-22T06:00:00Z');
    const [a, b, c] = [await newLead('Old A'), await newLead('Old B'), await newLead('Old C')];
    // Rows as older code left them: an old follow-up date stored directly.
    await h!.db.exclusive(() => h!.db.updateManyUnqueued('Leads', [a, b, c].map((id) => ({ id, patch: { followUpDate: '2026-11-21', nextStep: 'Call again', contacted: 'TRUE' } })), 'test'));
    const calls = (iso: string, leadId: string) => ({ leadId, at: iso, userId: staffId, outcome: 'No answer', note: '' });
    await h!.db.exclusive(() =>
      h!.db.insertManyUnqueued('CallLog', [calls('2026-11-20T06:00:00Z', a), calls('2026-11-22T05:00:00Z', b), calls('2026-11-20T06:00:00Z', c)], 'test'),
    );
    await admin.req('POST', '/api/availability', { date: '2026-11-24', start: '10:00', end: '11:00', slotMinutes: 30 });
    const founderId = (await h!.db.all('Users')).find((u) => u.role === 'admin')!.id;
    await h!.db.exclusive(() =>
      h!.db.insertManyUnqueued('Bookings', [{ leadId: c, founderId, date: '2026-11-24', start: '10:00', end: '10:30', status: 'booked', clientName: 'C', phone: '', mode: 'Phone call', link: '', notes: '', bookedBy: staffId, callHappened: '' }], 'test'),
    );
    expect((await view(staff, a)).followUp).toBe('overdue'); // no call since, no booking
    expect((await view(staff, a)).nextAction).toBe('Overdue · 21 Nov');
    expect((await view(staff, b)).followUp).toBe('none'); // a call was logged after it was due
    expect((await view(staff, c)).nextAction).toBe('Call booked · Tue 24 Nov, 10:00 AM'); // upcoming booking
    // No sheet edits were needed: the stored rows are unchanged.
    const rows = (await h!.db.loadFresh(['Leads']))[0].rows.filter((l) => [a, b, c].includes(l.id));
    expect(rows.every((r) => r.followUpDate === '2026-11-21')).toBe(true);
  });

  it('a follow-up set at 11:30 PM IST lands on the correct day', async () => {
    const { staff, newLead } = await setup('2026-11-22T18:00:00Z'); // 22 Nov, 11:30 PM IST (still 22 Nov in UTC too, 18:00)
    expect(istDate(h!.clock.now())).toBe('2026-11-22');
    expect(addDays(istDate(h!.clock.now()), 1)).toBe('2026-11-23'); // "Tomorrow"
    expect(addDays(istDate(h!.clock.now()), 3)).toBe('2026-11-25'); // "In 3 days"
    const id = await newLead('Late Co');
    await call(staff, id, { followUpDate: istDate(h!.clock.now()) }); // "Today"
    expect((await view(staff, id)).followUp).toBe('today');
    h!.clock.set('2026-11-22T18:29:00Z'); // 11:59 PM IST — still today
    expect((await view(staff, id)).followUp).toBe('today');
    h!.clock.set('2026-11-22T18:30:00Z'); // midnight IST (still 22 Nov in UTC)
    expect((await view(staff, id)).followUp).toBe('overdue');
    // And at 1 AM IST on 23 Nov (19:30 UTC on 22 Nov), "today" is 23 Nov.
    h!.clock.set('2026-11-22T19:30:00Z');
    expect(istDate(h!.clock.now())).toBe('2026-11-23');
  });

  it('the Follow-ups counts (Today / This week / Overdue) match the server counts', async () => {
    const { staff, newLead } = await setup('2026-11-20T05:00:00Z');
    const plan = [['T1', '2026-11-22'], ['T2', '2026-11-22'], ['W1', '2026-11-24'], ['O1', '2026-11-21'], ['O2', '2026-11-21'], ['O3', '2026-11-21']] as const;
    const ids: Record<string, string> = {};
    for (const [n, d] of plan) {
      ids[n] = await newLead(n);
      await call(staff, ids[n], { followUpDate: d });
    }
    h!.clock.set('2026-11-22T06:00:00Z');
    // One overdue lead got a new call today with no follow-up: it leaves Overdue.
    await call(staff, ids.O3, {});
    const leads = (await staff.req('GET', '/api/leads')).body.leads as View[];
    const today = '2026-11-22';
    const weekEnd = addDays(today, 7);
    const page = {
      today: leads.filter((l) => l.followUpDate === today).length,
      week: leads.filter((l) => l.followUpDate > today && l.followUpDate < weekEnd).length,
      overdue: leads.filter((l) => l.followUpDate && l.followUpDate < today).length,
    };
    expect(page).toEqual({ today: 2, week: 1, overdue: 2 });
    const me = (await staff.req('GET', '/api/dashboard/me')).body.followUps;
    expect(me).toEqual({ overdue: page.overdue, dueToday: page.today });
  });
});
