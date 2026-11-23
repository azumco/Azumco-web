// Lead history: a team member sees only leads they logged a call on; another
// member's lead is 403; nothing from Google Places is shown or stored;
// returned leads show no contact details. Founders see every status.

import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, memberClient, startHarness, superAdmin, type Harness } from './harness.ts';
import type { PlacesClient } from '../places/client.ts';

const PLACES_NAME = 'Zqx Secret Places Gym Name';
const PLACES_PHONE = '+91 99999 88888';
const places: PlacesClient = {
  async searchText(_q, limit) {
    return Array.from({ length: limit }, (_, i) => ({ placeId: `ChIJ_fake_place_hist_${i}`, name: `${PLACES_NAME} ${i}`, address: 'Somewhere Rd', phone: PLACES_PHONE, website: 'https://example.invalid' }));
  },
  async placeDetails(id) {
    return { placeId: id, name: PLACES_NAME, address: 'Somewhere Rd', phone: PLACES_PHONE, website: '' };
  },
};

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

async function setup() {
  h = await startHarness(undefined, undefined, { placesClient: places });
  const owner = await superAdmin(h);
  const admin = await memberClient(h, owner, ADMIN_EMAIL);
  const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
  // A second team member, added in Settings.
  const added = await owner.req('POST', '/api/users', { name: 'Other Member', email: 'other.member@azumco.com', role: 'employee', jobTitle: 'Caller' });
  const other = await memberClient(h, owner, 'other.member@azumco.com');
  const search = await admin.client.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 3 });
  const ids = search.body.results.map((r: { placeId: string }) => r.placeId);
  await admin.client.req('POST', '/api/places/import', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', searchedAt: search.body.searchedAt, placeIds: ids.slice(0, 2), assignTo: staff.id, windowHours: 24 });
  await admin.client.req('POST', '/api/places/import', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', searchedAt: search.body.searchedAt, placeIds: ids.slice(2), assignTo: added.body.user.id, windowHours: 24 });
  const all = (await admin.client.req('GET', '/api/leads')).body.leads as { id: string; assignedTo: string }[];
  const mine = all.filter((l) => l.assignedTo === staff.id).map((l) => l.id);
  const theirs = all.find((l) => l.assignedTo === added.body.user.id)!.id;
  return { owner, admin: admin.client, staff: staff.client, other: other.client, mine, theirs };
}

describe('Team member lead history', () => {
  it('lists only leads they logged a call on, newest first, with no Places details', async () => {
    const { staff, other, mine, theirs } = await setup();
    await staff.req('POST', `/api/leads/${mine[0]}/calls`, { outcome: 'No answer', nextStep: 'Call again', followUpDate: '2026-11-25' });
    h!.clock.advance(60_000);
    await staff.req('POST', `/api/leads/${mine[1]}/calls`, { outcome: 'Interested' });
    await other.req('POST', `/api/leads/${theirs}/calls`, { outcome: 'No answer' });

    const list = (await staff.req('GET', '/api/leads/history')).body.leads as { id: string; label: string; lastCallOutcome: string; nextAction: string; contact: unknown; returned: boolean }[];
    expect(list.map((l) => l.id)).toEqual([mine[1], mine[0]]); // newest call first, nothing of theirs
    expect(list[1]).toMatchObject({ label: 'Gym · Bhopal', lastCallOutcome: 'No answer', nextAction: 'Follow up Wed 25 Nov', contact: null, returned: false });
    const text = JSON.stringify(list);
    expect(text).not.toContain(PLACES_NAME);
    expect(text).not.toContain('99999');
    // Nothing from Places was stored either.
    const sheet = JSON.stringify((await h!.db.loadFresh(['Leads']))[0].rows);
    expect(sheet).not.toContain(PLACES_NAME);
    expect(sheet).not.toContain('99999');
  });

  it('another member’s lead (or one they never called) is 403', async () => {
    const { staff, other, mine, theirs } = await setup();
    await other.req('POST', `/api/leads/${theirs}/calls`, { outcome: 'No answer' });
    expect((await staff.req('GET', `/api/leads/history/${theirs}`)).status).toBe(403);
    expect((await staff.req('GET', `/api/leads/history/${mine[0]}`)).status).toBe(403); // assigned but never called
    expect((await staff.req('GET', '/api/leads/history/does-not-exist')).status).toBe(403);
  });

  it('confirmed leads show the confirmed contact; returned leads show "Returned to founders" and no contact', async () => {
    const { admin, staff, other, mine } = await setup();
    await staff.req('POST', `/api/leads/${mine[0]}/calls`, { outcome: 'Interested' });
    await staff.req('POST', `/api/leads/${mine[0]}/confirm`, { businessName: 'Typed Gym', contactPerson: 'R. Kumar', phone: '98260 12345' });
    let d = (await staff.req('GET', `/api/leads/history/${mine[0]}`)).body;
    expect(d.lead).toMatchObject({ label: 'Typed Gym', contact: { businessName: 'Typed Gym', contactPerson: 'R. Kumar', phone: '+919826012345' }, returned: false });
    expect(d.calls).toHaveLength(1);

    // Founder takes it back and gives it to someone else, who calls it too.
    const otherId = ((await admin.req('GET', '/api/team')).body.users as { id: string; name: string }[]).find((u) => u.name === 'Other Member')!.id;
    await admin.req('POST', '/api/leads/assign', { leadIds: [mine[0]], assigneeId: otherId, hours: 24 });
    await other.req('POST', `/api/leads/${mine[0]}/calls`, { outcome: 'Call booked', note: 'their private note' });
    d = (await staff.req('GET', `/api/leads/history/${mine[0]}`)).body;
    expect(d.lead).toMatchObject({ returned: true, nextAction: 'Returned to founders', contact: null });
    expect(d.calls).toHaveLength(1); // only their own calls
    expect(JSON.stringify(d)).not.toContain('their private note');
    // The live lead page is still closed to them.
    expect((await staff.req('GET', `/api/leads/${mine[0]}`)).status).not.toBe(200);
  });
});

describe('Founders see every lead', () => {
  it('all statuses including expired/unclaimed, with the flags to filter on', async () => {
    const { admin, staff, mine } = await setup();
    await staff.req('POST', `/api/leads/${mine[0]}/calls`, { outcome: 'Interested' });
    h!.clock.advance(25 * 3_600_000); // mine[1] is never called: it expires
    for (const [name, status] of [['Q Co', 'Qualified'], ['P Co', 'Proposal Sent'], ['W Co', 'Won'], ['L Co', 'Lost']]) {
      const id = (await admin.req('POST', '/api/leads', { businessName: name, source: 'Referral' })).body.id;
      const lead = (await admin.req('GET', `/api/leads/${id}`)).body.lead;
      await admin.req('PATCH', `/api/leads/${id}`, { status, expectedUpdatedAt: lead.updatedAt });
    }
    const leads = (await admin.req('GET', '/api/leads')).body.leads as { id: string; status: string; expired: boolean; assignedTo: string }[];
    const statuses = new Set(leads.map((l) => l.status));
    for (const s of ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost']) expect(statuses.has(s)).toBe(true);
    expect(leads.find((l) => l.id === mine[1])).toMatchObject({ expired: true, assignedTo: '' });
    expect(leads.find((l) => l.id === mine[0])!.expired).toBe(false);
  });
});
