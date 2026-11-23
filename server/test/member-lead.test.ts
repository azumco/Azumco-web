// A team member adds a lead they found themselves: it is theirs, has no
// expiry timer, cannot be given to anyone else, and the founders are told.

import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, memberClient, startHarness, superAdmin, type Harness } from './harness.ts';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

describe('Team member adds a lead', () => {
  it('is assigned to them with no timer, founders are notified, and it is audited', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const admin = await memberClient(h, owner, ADMIN_EMAIL);
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);

    // Trying to hand it to someone else, set a deadline or call it a Google lead is ignored.
    const r = await staff.client.req('POST', '/api/leads', { businessName: 'Found Online Cafe', city: 'Indore', phone: '98260 55555', source: 'Google Places', assignTo: admin.id, deadlineHours: 12 });
    expect(r.status).toBe(201);
    const lead = (await staff.client.req('GET', `/api/leads/${r.body.id}`)).body.lead;
    expect(lead).toMatchObject({ businessName: 'Found Online Cafe', assignedTo: staff.id, timerRunning: false, expiresAt: null, status: 'New', addedBy: staff.id, source: '', phone: '+919826055555' });
    // It shows in their own list.
    expect(((await staff.client.req('GET', '/api/leads')).body.leads as { id: string }[]).some((l) => l.id === r.body.id)).toBe(true);

    // Founders get a notification; the member does not get "assigned to you".
    const founderNotes = (await admin.client.req('GET', '/api/notifications')).body.notifications as { type: string; message: string }[];
    expect(founderNotes.find((n) => n.type === 'lead_added')?.message).toMatch(/added a lead: Found Online Cafe \(Indore\)/);
    const staffNotes = (await staff.client.req('GET', '/api/notifications')).body.notifications as { type: string }[];
    expect(staffNotes.some((n) => n.type === 'leads_assigned')).toBe(false);
    const audit = (await owner.req('GET', '/api/audit')).body.entries as { action: string; entityId: string }[];
    expect(audit.some((e) => e.action === 'lead.create' && e.entityId === r.body.id)).toBe(true);
  });

  it('duplicate numbers are refused without naming the other lead; a business name is required', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const admin = await memberClient(h, owner, ADMIN_EMAIL);
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
    await admin.client.req('POST', '/api/leads', { businessName: 'Secret Founder Lead', phone: '98260 66666' });
    const dup = await staff.client.req('POST', '/api/leads', { businessName: 'Mine', phone: '+91 98260-66666' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).not.toContain('Secret Founder Lead');
    expect((await staff.client.req('POST', '/api/leads', { businessName: '' })).status).toBe(400);
    // Founders still see the exact match.
    expect((await admin.client.req('POST', '/api/leads', { businessName: 'Again', phone: '9826066666' })).body.error).toContain('Secret Founder Lead');
  });

  it('can correct the details of leads they added, but not of leads a founder assigned', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const admin = await memberClient(h, owner, ADMIN_EMAIL);
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
    const own = (await staff.client.req('POST', '/api/leads', { businessName: 'Typo Cafe', phone: '98260 77777', city: 'Indor' })).body.id;
    const assigned = (await admin.client.req('POST', '/api/leads', { businessName: 'Founder Gym', assignTo: staff.id })).body.id;
    const get = async (id: string) => (await staff.client.req('GET', `/api/leads/${id}`)).body.lead;

    // Own lead: fix the name, city and phone.
    let l = await get(own);
    const fixed = await staff.client.req('PATCH', `/api/leads/${own}`, { businessName: 'Tipo Cafe', city: 'Indore', phone: '98260 77778', expectedUpdatedAt: l.updatedAt });
    expect(fixed.status).toBe(200);
    l = await get(own);
    expect(l).toMatchObject({ businessName: 'Tipo Cafe', city: 'Indore', phone: '+919826077778' });
    const audit = (await owner.req('GET', '/api/audit')).body.entries as { action: string; entityId: string }[];
    expect(audit.some((e) => e.action === 'lead.update' && e.entityId === own)).toBe(true);
    // Still can't use the Google source or blank the name.
    expect((await staff.client.req('PATCH', `/api/leads/${own}`, { source: 'Google Places' })).status).toBe(400);
    expect((await staff.client.req('PATCH', `/api/leads/${own}`, { businessName: '' })).status).toBe(400);

    // Assigned lead: details refused, call details still fine.
    const a = await get(assigned);
    const refused = await staff.client.req('PATCH', `/api/leads/${assigned}`, { businessName: 'Renamed', expectedUpdatedAt: a.updatedAt });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatch(/leads you added yourself/);
    expect((await staff.client.req('PATCH', `/api/leads/${assigned}`, { need: 'Website', expectedUpdatedAt: a.updatedAt })).status).toBe(200);
    expect((await get(assigned)).businessName).toBe('Founder Gym');
    // Deal fields stay founder-only, on any lead.
    expect((await staff.client.req('PATCH', `/api/leads/${own}`, { status: 'Won' })).status).toBe(400);
  });
});
