// "Get ready" checklist: founders only, every item derived from live data.

import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, memberClient, startHarness, superAdmin, type Harness } from './harness.ts';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

describe('Setup checklist', () => {
  it('starts with everything to do, and ticks items off as they happen', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const get = async () => (await owner.req('GET', '/api/setup-checklist')).body;

    let c = await get();
    expect(c.me).toEqual({ meetLink: false, freeSlots: false });
    expect(c.team).toMatchObject({ membersHavePassword: false, membersSignedIn: false, leadsAssigned: false, memberCanReceiveLeads: true });
    expect(c.founders.map((f: { meetLink: boolean }) => f.meetLink)).toEqual([false, false]);

    // Own items.
    await owner.req('PATCH', '/api/me/meet-link', { meetLink: 'https://meet.google.com/abc-defg-hij' });
    await owner.req('POST', '/api/availability', { date: '2026-11-23', start: '10:00', end: '11:00', slotMinutes: 30 });
    c = await get();
    expect(c.me).toEqual({ meetLink: true, freeSlots: true });

    // Team items: the other founder and the team member.
    const admin = await memberClient(h, owner, ADMIN_EMAIL);
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL); // password created + signed in
    await admin.client.req('PATCH', '/api/me/meet-link', { meetLink: 'https://meet.google.com/xyz-wxyz-uvw' });
    await admin.client.req('POST', '/api/availability', { date: '2026-11-24', start: '10:00', end: '11:00', slotMinutes: 30 });
    await owner.req('POST', '/api/leads', { businessName: 'First Lead', assignTo: staff.id });
    c = await get();
    expect(c.founders.every((f: { meetLink: boolean; freeSlots: boolean }) => f.meetLink && f.freeSlots)).toBe(true);
    expect(c.team).toMatchObject({ membersHavePassword: true, membersSignedIn: true, leadsAssigned: true, memberCanReceiveLeads: true });

    expect((await staff.client.req('GET', '/api/setup-checklist')).status).toBe(403); // team members cannot see it
  });
});
