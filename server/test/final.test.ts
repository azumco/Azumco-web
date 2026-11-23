// Final pass: profile fields, data-driven team, notifications, phone check and
// the staging-only timer override.

import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, Client, EMPLOYEE_EMAIL, FakeClock, memberClient, startHarness, superAdmin, testConfig, type Harness } from './harness.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { loadConfig } from '../config.ts';
import type { PlacesClient } from '../places/client.ts';
import { setAssignmentMinutesOverride } from '../leads/service.ts';

let h: Harness;
afterEach(async () => {
  setAssignmentMinutesOverride(null);
  await h?.close();
});

const places: PlacesClient = {
  async searchText(_q, limit) {
    return Array.from({ length: limit }, (_, i) => ({ placeId: `p${i}`, name: `Fake ${i}`, address: `${i} Fake Rd`, phone: `+91 90000 1000${i}`, website: '' }));
  },
  async placeDetails(id) {
    return { placeId: id, name: 'Fake', address: 'Fake Rd', phone: '+91 90000 10000', website: '' };
  },
};

async function setup(clock?: FakeClock) {
  h = await startHarness(new MemoryBackend(), testConfig(), { placesClient: places, clock });
  const owner = await superAdmin(h);
  const adminM = await memberClient(h, owner, ADMIN_EMAIL);
  const staffM = await memberClient(h, owner, EMPLOYEE_EMAIL);
  return { owner, admin: adminM.client, adminId: adminM.id, staff: staffM.client, staffId: staffM.id };
}

describe('profile fields and a data-driven team', () => {
  it('defaults: team members can receive leads, founders cannot; founders get stable distinct colours', async () => {
    const { owner } = await setup();
    type U = { email: string; role: string; canReceiveLeads: boolean; calendarColor: string; jobTitle: string };
    const users = (await owner.req('GET', '/api/users')).body.users as U[];
    const by = (e: string) => users.find((u) => u.email === e)!;
    expect(by(EMPLOYEE_EMAIL)).toMatchObject({ canReceiveLeads: true, calendarColor: 'neutral' });
    expect(by(ADMIN_EMAIL).canReceiveLeads).toBe(false);
    const colours = users.filter((u) => u.role !== 'employee').map((u) => u.calendarColor);
    expect(new Set(colours).size).toBe(colours.length);
    expect(colours.every((c) => c !== 'neutral')).toBe(true);

    // Colours persist across restarts and when someone new joins.
    h = await h.restart();
    const o2 = Object.assign(new Client(h.url), { cookie: owner.cookie, csrf: owner.csrf });
    await o2.req('POST', '/api/users', { name: 'Dev Person', email: 'dev.person@azumco.com', role: 'admin', jobTitle: 'Developer' });
    const after = (await o2.req('GET', '/api/users')).body.users as U[];
    for (const u of users.filter((x) => x.role !== 'employee')) expect(after.find((x) => x.email === u.email)!.calendarColor).toBe(u.calendarColor);
    const dev = after.find((x) => x.email === 'dev.person@azumco.com')!;
    expect(dev).toMatchObject({ jobTitle: 'Developer', canReceiveLeads: false });
    expect(colours).not.toContain(dev.calendarColor);
  });

  it('a newly added teammate shows up in the team list and slot founders', async () => {
    const { owner } = await setup();
    await owner.req('POST', '/api/users', { name: 'Dev Person', email: 'dev.person@azumco.com', role: 'admin', jobTitle: 'Developer' });
    const team = (await owner.req('GET', '/api/team')).body.users.map((u: { name: string }) => u.name);
    expect(team).toContain('Dev Person');
    const founders = (await owner.req('GET', '/api/slots?days=1')).body.founders.map((f: { name: string }) => f.name);
    expect(founders).toContain('Dev Person');
  });

  it('only users who can receive leads can be assigned; commission only for them; changes audited', async () => {
    const { owner, admin, adminId, staffId } = await setup();
    const lead = (await admin.req('POST', '/api/leads', { businessName: 'Assign Co' })).body.id;
    const refused = await admin.req('POST', '/api/leads/assign', { leadIds: [lead], assigneeId: adminId, hours: 24 });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/not set up to receive leads/);
    expect((await admin.req('POST', '/api/leads/assign', { leadIds: [lead], assigneeId: staffId, hours: 24 })).status).toBe(200);

    expect((await owner.req('PATCH', `/api/users/${adminId}`, { canReceiveLeads: true, jobTitle: 'Founder & caller' })).status).toBe(200);
    expect((await admin.req('POST', '/api/leads/assign', { leadIds: [lead], assigneeId: adminId, hours: 24 })).status).toBe(200);
    const commission = (await owner.req('GET', '/api/dashboard/founder')).body.commission.map((c: { userId: string }) => c.userId);
    expect(commission).toContain(adminId);
    const entry = (await owner.req('GET', '/api/audit')).body.entries.find((e: { action: string }) => e.action === 'users.update');
    expect(JSON.parse(entry.after)).toMatchObject({ jobTitle: 'Founder & caller', canReceiveLeads: 'TRUE' });
  });

  it('import refuses an assignee who cannot receive leads, and stores only id, type, state, city, time and importer', async () => {
    const { admin, adminId, staffId } = await setup();
    const s = await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 });
    const base = { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', searchedAt: s.body.searchedAt, placeIds: ['p0'] };
    expect((await admin.req('POST', '/api/places/import', { ...base, assignTo: adminId, windowHours: 24 })).status).toBe(400);
    expect((await admin.req('POST', '/api/places/import', { ...base, assignTo: staffId, windowHours: 24 })).status).toBe(200);
    const row = (await h.db.all('Leads')).find((l) => l.placeId === 'p0')!;
    expect(row).toMatchObject({ placeId: 'p0', category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', addedBy: adminId });
    for (const k of ['businessName', 'phone', 'websiteOrInstagram', 'contactPerson']) expect(row[k] ?? '').toBe('');
    expect(row.searchedAt).toBe(s.body.searchedAt);
  });
});

describe('notifications', () => {
  it('assigned, expiring, booking confirmed, expired and commission paid — with links, unread count and mark-read', async () => {
    const clock = new FakeClock(new Date('2026-11-23T04:30:00Z'));
    const { owner, admin, staff, staffId } = await setup(clock);
    const s = await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 });
    await admin.req('POST', '/api/places/import', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', searchedAt: s.body.searchedAt, placeIds: ['p0', 'p1'], assignTo: staffId, windowHours: 12 });
    const leads = (await staff.req('GET', '/api/leads')).body.leads as { id: string }[];

    clock.advance(10 * 3_600_000); // 2h left → expiring notices
    await staff.req('GET', '/api/leads');
    await staff.req('GET', '/api/leads'); // idempotent
    let list = (await staff.req('GET', '/api/notifications')).body;
    expect(list.notifications.filter((n: { type: string }) => n.type === 'lead_expiring')).toHaveLength(2);

    await staff.req('POST', `/api/leads/${leads[0].id}/calls`, { outcome: 'Interested' });
    await admin.req('POST', '/api/availability/batch', { dates: ['2026-11-25'], start: '10:00', end: '11:00', slotMinutes: 30 });
    const slot = (await staff.req('GET', '/api/slots?from=2026-11-25&days=1')).body.slots[0];
    await staff.req('POST', '/api/bookings', { leadId: leads[0].id, founderId: slot.founderId, date: slot.date, start: slot.start, clientName: 'Client', mode: 'Phone call' });

    clock.advance(3 * 3_600_000); // the other one expires
    await staff.req('GET', '/api/leads');

    const booking = (await admin.req('GET', '/api/bookings')).body.bookings[0];
    await admin.req('POST', `/api/bookings/${booking.id}/call-happened`, { happened: true });
    await owner.req('POST', `/api/leads/${leads[0].id}/commission-paid`);

    list = (await staff.req('GET', '/api/notifications')).body;
    const types = list.notifications.map((n: { type: string }) => n.type);
    for (const t of ['leads_assigned', 'lead_expiring', 'booking_confirmed', 'lead_expired', 'commission_paid']) expect(types).toContain(t);
    expect(list.unread).toBe(list.notifications.length);
    const booked = list.notifications.find((n: { type: string }) => n.type === 'booking_confirmed');
    expect(booked.link).toBe(`/team/leads/${leads[0].id}`);
    expect(list.notifications.find((n: { type: string }) => n.type === 'commission_paid').link).toBe(`/team/leads/${leads[0].id}`);

    expect((await staff.req('POST', `/api/notifications/${booked.id}/read`)).status).toBe(200);
    expect((await staff.req('GET', '/api/notifications')).body.unread).toBe(list.unread - 1);
    const founderNote = (await admin.req('GET', '/api/notifications')).body.notifications[0];
    expect((await staff.req('POST', `/api/notifications/${founderNote.id}/read`)).status).toBe(404);
    await staff.req('POST', '/api/notifications/read-all');
    expect((await staff.req('GET', '/api/notifications')).body.unread).toBe(0);
  });
});

describe('confirm contact pre-check', () => {
  it('normalises to E.164 and names the existing lead for a duplicate', async () => {
    const { admin, staff, staffId } = await setup();
    await admin.req('POST', '/api/leads', { businessName: 'Existing Co', phone: '9826012345' });
    const id = (await admin.req('POST', '/api/leads', { businessName: 'Mine', assignTo: staffId })).body.id;
    expect((await staff.req('POST', `/api/leads/${id}/phone-check`, { phone: '098260 12345' })).body).toEqual({ e164: '+919826012345', duplicateOf: 'Existing Co' });
    expect((await staff.req('POST', `/api/leads/${id}/phone-check`, { phone: '91 9826 099999' })).body).toEqual({ e164: '+919826099999', duplicateOf: null });
    expect((await staff.req('POST', `/api/leads/${id}/confirm`, { businessName: 'X', phone: '9826012345' })).status).toBe(409);
  });
});

describe('staging-only assignment timer', () => {
  const base = { NODE_ENV: 'production', SHEETS_BACKEND: 'google', GOOGLE_SHEETS_SPREADSHEET_ID: 'prod-sheet', GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: 'eA==', SESSION_SECRET: 'x'.repeat(40), SUPERADMIN_EMAIL: 'boss@azumco.com' };

  it('cannot be enabled in production', () => {
    expect(() => loadConfig({ ...base, STAGING_ASSIGNMENT_MINUTES: '5' })).toThrow(/STAGING_ASSIGNMENT_MINUTES: only allowed with STAGING_MODE=true/);
    expect(() => loadConfig({ ...base, STAGING_MODE: 'true', STAGING_SPREADSHEET_ID: 'stage', STAGING_ASSIGNMENT_MINUTES: '5', RENDER: 'true' })).toThrow(/staging mode cannot be used on Render/);
    expect(() => loadConfig({ ...base, STAGING_MODE: 'true', STAGING_SPREADSHEET_ID: 'prod-sheet', STAGING_ASSIGNMENT_MINUTES: '5' })).toThrow(/must differ from GOOGLE_SHEETS_SPREADSHEET_ID/);
    expect(() => loadConfig({ ...base, STAGING_MODE: 'true', STAGING_ASSIGNMENT_MINUTES: '5' })).toThrow(/STAGING_SPREADSHEET_ID: required/);
    expect(loadConfig(base)).toMatchObject({ activeSpreadsheetId: 'prod-sheet', assignmentOverrideMinutes: null });
    expect(loadConfig({ ...base, STAGING_MODE: 'true', STAGING_SPREADSHEET_ID: 'stage', STAGING_ASSIGNMENT_MINUTES: '5' })).toMatchObject({ activeSpreadsheetId: 'stage', assignmentOverrideMinutes: 5 });
  });

  it('when enabled for staging, timers run in minutes', async () => {
    const clock = new FakeClock(new Date('2026-11-23T04:30:00Z'));
    h = await startHarness(new MemoryBackend(), { ...testConfig(), assignmentOverrideMinutes: 3 }, { placesClient: places, clock });
    const owner = await superAdmin(h);
    const staffM = await memberClient(h, owner, EMPLOYEE_EMAIL);
    const id = (await owner.req('POST', '/api/leads', { businessName: 'Quick', assignTo: staffM.id, deadlineHours: 24 })).body.id;
    expect((await staffM.client.req('GET', `/api/leads/${id}`)).body.lead.msLeft).toBe(3 * 60_000);
  });
});

describe('Greeting uses the time of day in India', () => {
  it('switches at 12:00 and 17:00 IST regardless of the machine time zone', async () => {
    const { istGreeting } = await import('../../src/team/types.ts');
    expect(istGreeting(new Date('2026-11-21T06:29:00Z'))).toBe('Good morning'); // 11:59 IST
    expect(istGreeting(new Date('2026-11-21T18:49:00Z'))).toBe('Good evening'); // 00:19 IST, after midnight
    expect(istGreeting(new Date('2026-11-20T23:29:00Z'))).toBe('Good evening'); // 04:59 IST
    expect(istGreeting(new Date('2026-11-20T23:30:00Z'))).toBe('Good morning'); // 05:00 IST
    expect(istGreeting(new Date('2026-11-21T06:30:00Z'))).toBe('Good afternoon'); // 12:00 IST
    expect(istGreeting(new Date('2026-11-21T11:30:00Z'))).toBe('Good evening'); // 17:00 IST
  });
});
