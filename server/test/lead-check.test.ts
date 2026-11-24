// "Check against Google", end to end over HTTP with a mocked Places client.
// Runs on the in-memory store and, with `npm run test:pg`, on Postgres.
// Every business, number, address and site below is a fictitious fixture with
// distinctive strings, so the "never stored" grep is meaningful.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, SUPER, memberClient, startHarness, superAdmin, type Client, type Harness } from './harness.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { testConfig } from './harness.ts';
import type { CheckPlace, PlaceResult, PlacesClient } from '../places/client.ts';
import { PlacesHttpError } from '../places/client.ts';

const place = (o: Partial<CheckPlace> & { placeId: string; name: string }): CheckPlace => ({
  address: '', phone: '', website: '', area: '', city: '', types: [], primaryType: '', rating: null, ratingCount: null, ...o,
});

/** Google's side of each scenario, keyed by the business name the search starts with. */
const LISTINGS: Record<string, CheckPlace[]> = {
  'Qvx Iron Gym': [place({ placeId: 'ChIJ_qvx_iron', name: 'Qvx Iron Gym', phone: '+91 99111 00001', area: 'Qvx Market', city: 'Bhopal', website: 'https://www.qvx-iron.example/', primaryType: 'gym', address: 'Qvx Market, Bhopal, Madhya Pradesh 462001', rating: 4.71, ratingCount: 9311 })],
  'Qvx Glow Salon': [place({ placeId: 'ChIJ_qvx_glow', name: 'Qvx Glow Salon & Spa', phone: '+91 99111 00002', area: 'Qvx Nagar', city: 'Bhopal', website: 'https://qvx-glow.example', primaryType: 'beauty_salon', address: '7 Qvx Nagar Lane, Bhopal 462011', rating: 4.12, ratingCount: 8877 })],
  'Qvx Brew Cafe': [
    place({ placeId: 'ChIJ_qvx_brew_1', name: 'Qvx Brew Cafe', city: 'Indore', address: 'Scheme 54, Qvx Vijay, Indore', rating: 4.4, ratingCount: 3121 }),
    place({ placeId: 'ChIJ_qvx_brew_2', name: 'Qvx Brew Cafe Kitchen', city: 'Indore', address: 'Qvx Palasia, Indore', rating: 3.97, ratingCount: 4141 }),
    place({ placeId: 'ChIJ_qvx_brew_3', name: 'Qvx Brew Cafe Express', city: 'Indore', address: 'Qvx Rau, Indore', rating: 3.33, ratingCount: 5151 }),
  ],
};
const ALL = Object.values(LISTINGS).flat();

class MockCheckPlaces implements PlacesClient {
  calls: string[] = [];
  failWith: number | null = null;
  async searchText(): Promise<PlaceResult[]> {
    this.calls.push('search');
    return [];
  }
  async placeDetails(id: string): Promise<PlaceResult> {
    this.calls.push(`details:${id}`);
    return ALL.find((p) => p.placeId === id)!;
  }
  async checkSearch(query: string, limit: number): Promise<CheckPlace[]> {
    this.calls.push(`checkSearch:${query}`);
    if (this.failWith) throw new PlacesHttpError(this.failWith, 'mock');
    const key = Object.keys(LISTINGS).find((k) => query.startsWith(k));
    return (key ? LISTINGS[key] : []).slice(0, limit);
  }
  async checkDetails(id: string): Promise<CheckPlace> {
    this.calls.push(`checkDetails:${id}`);
    const p = ALL.find((x) => x.placeId === id);
    if (!p) throw new PlacesHttpError(404, 'mock');
    return p;
  }
}

let h: Harness | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await h?.close();
  h = undefined;
});

async function setup() {
  const places = new MockCheckPlaces();
  h = await startHarness(new MemoryBackend(), testConfig(), { placesClient: places });
  const owner = await superAdmin(h);
  const admin = await memberClient(h, owner, ADMIN_EMAIL);
  const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
  const add = async (c: Client, body: Record<string, string>) => {
    const r = await c.req('POST', '/api/leads', body);
    expect(r.status).toBe(201);
    return r.body.id as string;
  };
  const used = async () => (await owner.req('GET', '/api/places/status')).body.usage.used as number;
  const lead = async (id: string, c: Client = admin.client) => (await c.req('GET', `/api/leads/${id}`)).body.lead;
  return { places, owner, admin: admin.client, staff: staff.client, add, used, lead, h: h! };
}

/** Sessions expire when the fake clock jumps days ahead: sign everyone back in. */
async function relogin(t: Awaited<ReturnType<typeof setup>>) {
  await t.owner.login(SUPER.email, 'owner-New-Passw0rd!');
  await t.admin.login(ADMIN_EMAIL, 'member-Passw0rd-1');
  await t.staff.login(EMPLOYEE_EMAIL, 'member-Passw0rd-1');
}

describe('Who and what can be checked', () => {
  it("team members get 403 on leads they didn't add (even ones assigned to them)", async () => {
    const t = await setup();
    const staffId = ((await t.owner.req('GET', '/api/users')).body.users as { id: string; email: string }[]).find((u) => u.email === EMPLOYEE_EMAIL)!.id;
    const assigned = await t.add(t.admin, { businessName: 'Qvx Iron Gym', city: 'Bhopal', assignTo: staffId });
    for (const path of ['', '/pick', '/view', '/apply', '/not-on-google']) {
      const r = await t.staff.req('POST', `/api/leads/${assigned}/google-check${path}`, path === '/pick' || path === '/apply' ? { token: 'x'.repeat(20) } : {});
      expect(r.status, path).toBe(403);
    }
    expect(t.places.calls).toHaveLength(0);
    // A founder checks it; the member then sees the result (codes only).
    expect((await t.admin.req('POST', `/api/leads/${assigned}/google-check`, {})).status).toBe(200);
    const seen = await t.lead(assigned, t.staff);
    expect(seen.origin).toBe('team');
    expect(seen.googleCheck.status).toBe('needs_review');
  });

  it('team members check leads they added: once a week per lead, within their monthly allowance', async () => {
    const t = await setup();
    const staffId = ((await t.owner.req('GET', '/api/users')).body.users as { id: string; email: string }[]).find((u) => u.email === EMPLOYEE_EMAIL)!.id;
    const iron = await t.add(t.staff, { businessName: 'Qvx Iron Gym', city: 'Bhopal' });
    const glow = await t.add(t.staff, { businessName: 'Qvx Glow Salon', city: 'Bhopal' });
    const brew = await t.add(t.staff, { businessName: 'Qvx Brew Cafe', city: 'Indore' });

    let a = (await t.staff.req('GET', '/api/google-check/allowance')).body;
    expect(a).toMatchObject({ unlimited: false, mine: { used: 0, limit: 100, remaining: 100 }, cooldownDays: 7 });
    expect((await t.admin.req('GET', '/api/google-check/allowance')).body).toMatchObject({ unlimited: true, mine: null });

    const first = await t.staff.req('POST', `/api/leads/${iron}/google-check`, {});
    expect(first.status).toBe(200);
    expect(first.body.calls).toBe(1);
    // The same lead again within 7 days: refused before any call (also "Show Google's details").
    const again = await t.staff.req('POST', `/api/leads/${iron}/google-check`, {});
    expect(again.status).toBe(429);
    expect(again.body.code).toBe('CHECKED_RECENTLY');
    expect((await t.staff.req('POST', `/api/leads/${iron}/google-check/view`, {})).body.code).toBe('CHECKED_RECENTLY');
    expect(t.places.calls).toHaveLength(1);
    // Saving needs no call and no allowance; confirmation is still required for Google's values.
    expect((await t.staff.req('POST', `/api/leads/${iron}/google-check/apply`, { token: first.body.google.token, confirmed: false, choices: { phone: 'google' } })).body.code).toBe('CONFIRMATION_REQUIRED');
    expect((await t.staff.req('POST', `/api/leads/${iron}/google-check/apply`, { token: first.body.google.token, confirmed: true, choices: { phone: 'google' } })).status).toBe(200);

    // After a week it can be checked again.
    t.h.clock.advance(7 * 86_400_000 + 60_000);
    await relogin(t);
    expect((await t.staff.req('POST', `/api/leads/${iron}/google-check`, {})).status).toBe(200);
    a = (await t.staff.req('GET', '/api/google-check/allowance')).body;
    expect(a.mine.used).toBe(2);

    // A personal limit of 3 (set by the super admin) overrides the default of 100.
    const users = (await t.owner.req('GET', '/api/users')).body.users as { id: string; updatedAt: string }[];
    const me = users.find((u) => u.id === staffId)!;
    expect((await t.owner.req('PATCH', `/api/users/${staffId}`, { leadCheckLimit: 3, expectedUpdatedAt: me.updatedAt })).status).toBe(200);
    expect((await t.staff.req('POST', `/api/leads/${glow}/google-check`, {})).status).toBe(200);
    const over = await t.staff.req('POST', `/api/leads/${brew}/google-check`, {});
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('MEMBER_CHECK_LIMIT');
    expect(t.places.calls).toHaveLength(3);
    // Founders are not limited by a member's allowance.
    expect((await t.admin.req('POST', `/api/leads/${brew}/google-check`, {})).status).toBe(200);

    // The Settings default applies again when the personal limit is cleared; 0 stops a member entirely.
    const me2 = ((await t.owner.req('GET', '/api/users')).body.users as { id: string; updatedAt: string }[]).find((u) => u.id === staffId)!;
    await t.owner.req('PATCH', `/api/users/${staffId}`, { leadCheckLimit: null, expectedUpdatedAt: me2.updatedAt });
    await t.owner.req('PUT', '/api/settings', { memberLeadChecksPerMonth: 0 });
    expect((await t.staff.req('GET', '/api/google-check/allowance')).body.mine).toMatchObject({ limit: 0, remaining: 0 });
    t.h.clock.advance(8 * 86_400_000);
    await relogin(t);
    expect((await t.staff.req('POST', `/api/leads/${glow}/google-check`, {})).body.code).toBe('MEMBER_CHECK_LIMIT');
    expect(t.places.calls).toHaveLength(4);
  });

  it('a lead imported from Find clients is rejected, and makes no call', async () => {
    const t = await setup();
    // Simulate a Find clients import (no search needed for this check).
    await t.h.db.insert('Leads', { placeId: 'ChIJ_imported_1', category: 'Gym', city: 'Bhopal', source: 'Google Places', origin: 'find_clients', status: 'New' }, 'test');
    const imported = (await t.admin.req('GET', '/api/leads')).body.leads.find((l: { origin: string }) => l.origin === 'find_clients');
    expect(imported).toBeTruthy();
    expect(imported.googleCheck.status).toBe('');
    for (const path of ['', '/view', '/not-on-google']) {
      const r = await t.admin.req('POST', `/api/leads/${imported.id}/google-check${path}`, {});
      expect(r.status, path).toBe(409);
      expect(r.body.code).toBe('FIND_CLIENTS_LEAD');
    }
    expect(t.places.calls).toHaveLength(0);
    expect(await t.used()).toBe(0);
  });

  it('an older imported row with a blank origin is still treated as imported', async () => {
    const t = await setup();
    await t.h.db.insert('Leads', { placeId: 'ChIJ_old_import', category: 'Gym', city: 'Bhopal', source: 'Google Places', status: 'New' }, 'test');
    const old = (await t.admin.req('GET', '/api/leads')).body.leads[0];
    expect(old.origin).toBe('find_clients');
    expect((await t.admin.req('POST', `/api/leads/${old.id}/google-check`, {})).status).toBe(409);
  });
});

describe('Checks: outcomes, calls and storage', () => {
  it('one confident match: exactly ONE billable call, codes stored, status matches', async () => {
    const t = await setup();
    const id = await t.add(t.admin, { businessName: 'Qvx Iron Gym', area: 'Qvx Market', city: 'Bhopal', phone: '99111 00001', websiteOrInstagram: 'qvx-iron.example', category: 'Gym / Fitness' });
    const r = await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.body).toMatchObject({ status: 'matches', calls: 1, fields: { businessName: 'same', phone: 'same', area: 'same', city: 'same', website: 'same', category: 'same' } });
    expect(r.body.google.place.placeId).toBe('ChIJ_qvx_iron');
    expect(t.places.calls).toEqual(['checkSearch:Qvx Iron Gym, Qvx Market, Bhopal']);
    expect(await t.used()).toBe(1);
    expect(r.body.usage.used).toBe(1);
    const l = await t.lead(id);
    expect(l.googleCheck).toMatchObject({ status: 'matches', linked: true, checkedByName: 'Admin One' });
  });

  it('needs review → confirmation enforced → saved values become ours; zero extra calls; audited', async () => {
    const t = await setup();
    const id = await t.add(t.admin, { businessName: 'Qvx Glow Salon', city: 'Bhopal', phone: '98260 12030', category: 'Salon' });
    const r = await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
    expect(r.body.status).toBe('needs_review');
    expect(r.body.fields).toEqual({ businessName: 'different', phone: 'different', area: 'google_only', city: 'same', website: 'google_only', category: 'same' });
    const token = r.body.google.token as string;
    t.places.calls = [];

    // Using Google's value without the tick is refused, and nothing changes.
    const refused = await t.admin.req('POST', `/api/leads/${id}/google-check/apply`, { token, confirmed: false, choices: { phone: 'google' } });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('CONFIRMATION_REQUIRED');
    expect((await t.lead(id)).phone).toBe('+919826012030');

    // "Keep mine" never needs it.
    const kept = await t.admin.req('POST', `/api/leads/${id}/google-check/apply`, { token, confirmed: false, choices: { businessName: 'mine', phone: 'mine' } });
    expect(kept.status).toBe(200);
    expect(kept.body.status).toBe('reviewed');
    expect(kept.body.changed).toEqual([]);

    // Confirmed: Google's phone, website and area are saved into the lead.
    const saved = await t.admin.req('POST', `/api/leads/${id}/google-check/apply`, { token, confirmed: true, choices: { businessName: 'mine', phone: 'google', website: 'google', area: 'google' } });
    expect(saved.status).toBe(200);
    expect(saved.body.status).toBe('reviewed'); // the name still differs, kept on purpose
    const l = await t.lead(id);
    expect(l).toMatchObject({ businessName: 'Qvx Glow Salon', phone: '+919911100002', phoneSource: 'outreach_confirmed', websiteOrInstagram: 'https://qvx-glow.example', area: 'Qvx Nagar' });
    expect(l.googleCheck.fields).toMatchObject({ phone: 'same', website: 'same', area: 'same', businessName: 'different' });

    // Using the name too makes it match.
    const all = await t.admin.req('POST', `/api/leads/${id}/google-check/apply`, { token, confirmed: true, choices: { businessName: 'google' } });
    expect(all.body.status).toBe('matches');
    expect(t.places.calls).toHaveLength(0);
    expect(await t.used()).toBe(1);

    const audit = (await t.owner.req('GET', '/api/audit')).body.entries as { action: string; entityId: string; actorId: string; before: string; after: string; at: string }[];
    const applied = audit.filter((e) => e.action === 'lead.google_apply' && e.entityId === id);
    expect(applied).toHaveLength(3);
    const withPhone = applied.find((e) => JSON.stringify(e.after).includes('+919911100002'))!;
    expect(withPhone).toBeTruthy();
    expect(JSON.stringify(withPhone.before)).toContain('+919826012030');
    const after = typeof withPhone.after === 'string' ? JSON.parse(withPhone.after) : withPhone.after;
    expect(after).toMatchObject({ phone: '+919911100002', confirmed: true, usedGoogle: ['phone', 'website', 'area'], kept: ['businessName'] });
    expect(withPhone.at).toBeTruthy();
    expect((withPhone as unknown as { actor: string }).actor).toBe('Admin One');
    expect(audit.some((e) => e.action === 'lead.google_check' && e.entityId === id)).toBe(true);
  });

  it('a saved phone already on another lead is refused as a duplicate', async () => {
    const t = await setup();
    await t.add(t.admin, { businessName: 'Someone Else', phone: '99111 00002' });
    const id = await t.add(t.admin, { businessName: 'Qvx Glow Salon', city: 'Bhopal' });
    const r = await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
    const dup = await t.admin.req('POST', `/api/leads/${id}/google-check/apply`, { token: r.body.google.token, confirmed: true, choices: { phone: 'google' } });
    expect(dup.status).toBe(409);
  });

  it('several plausible → pick (≤5); choosing costs ZERO calls; tokens are checked', async () => {
    const t = await setup();
    const id = await t.add(t.admin, { businessName: 'Qvx Brew Cafe', city: 'Indore' });
    const other = await t.add(t.admin, { businessName: 'Other Lead', city: 'Indore' });
    const r = await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
    expect(r.body.status).toBe('pick');
    expect(r.body.candidates.length).toBe(3);
    expect(r.body.candidates[0].place).toMatchObject({ businessName: expect.any(String), address: expect.any(String), rating: expect.any(Number) });
    expect((await t.lead(id)).googleCheck).toMatchObject({ status: 'pick', candidates: 3, linked: false });
    expect(await t.used()).toBe(1);
    t.places.calls = [];

    const chosen = r.body.candidates.find((c: { place: { placeId: string } }) => c.place.placeId === 'ChIJ_qvx_brew_2');
    // Tampered, or for another lead: refused.
    const [body, mac] = (chosen.token as string).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), p: { ...chosen.place, phone: '+91 90000 00000' } })).toString('base64url');
    expect((await t.admin.req('POST', `/api/leads/${id}/google-check/pick`, { token: `${forged}.${mac}` })).status).toBe(400);
    expect((await t.admin.req('POST', `/api/leads/${other}/google-check/pick`, { token: chosen.token })).status).toBe(400);

    const picked = await t.admin.req('POST', `/api/leads/${id}/google-check/pick`, { token: chosen.token });
    expect(picked.status).toBe(200);
    expect(picked.body.calls).toBe(0);
    expect(['matches', 'needs_review']).toContain(picked.body.status);
    expect((await t.lead(id)).googleCheck).toMatchObject({ linked: true, candidates: 0 });
    expect(t.places.calls).toHaveLength(0);
    expect(await t.used()).toBe(1);

    // After 30 minutes a fetched listing can no longer be used.
    t.h.clock.advance(31 * 60_000);
    const late = await t.admin.req('POST', `/api/leads/${id}/google-check/pick`, { token: chosen.token });
    expect(late.status).toBe(410);
    expect(late.body.code).toBe('CHECK_EXPIRED');
  });

  it('none → not found; edited search is one call; "Mark as not on Google" is free', async () => {
    const t = await setup();
    const id = await t.add(t.admin, { businessName: 'Qvx Nowhere Dental', city: 'Bhopal' });
    const r = await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
    expect(r.body).toMatchObject({ status: 'not_found', calls: 1, query: 'Qvx Nowhere Dental, Bhopal' });
    const again = await t.admin.req('POST', `/api/leads/${id}/google-check`, { query: 'Qvx Nowhere Dental Clinic Bhopal' });
    expect(again.body.status).toBe('not_found');
    expect(t.places.calls).toEqual(['checkSearch:Qvx Nowhere Dental, Bhopal', 'checkSearch:Qvx Nowhere Dental Clinic Bhopal']);
    const marked = await t.admin.req('POST', `/api/leads/${id}/google-check/not-on-google`, {});
    expect(marked.body.status).toBe('not_on_google');
    expect(t.places.calls).toHaveLength(2);
    expect(await t.used()).toBe(2);
  });

  it('"View" a past check is one live call (after the 7-day rule); editing a compared field resets the status', async () => {
    const t = await setup();
    const id = await t.add(t.admin, { businessName: 'Qvx Iron Gym', area: 'Qvx Market', city: 'Bhopal', phone: '99111 00001', websiteOrInstagram: 'qvx-iron.example', category: 'Gym' });
    await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
    t.places.calls = [];
    // The 7-day rule applies to founders too.
    const early = await t.admin.req('POST', `/api/leads/${id}/google-check/view`, {});
    expect(early.status).toBe(429);
    expect(early.body.code).toBe('CHECKED_RECENTLY');
    expect(t.places.calls).toHaveLength(0);
    t.h.clock.advance(7 * 86_400_000 + 60_000);
    await relogin(t);
    const v = await t.admin.req('POST', `/api/leads/${id}/google-check/view`, {});
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ status: 'matches', calls: 1 });
    expect(v.body.google.place.businessName).toBe('Qvx Iron Gym');
    expect(t.places.calls).toEqual(['checkDetails:ChIJ_qvx_iron']);
    expect(await t.used()).toBe(2);

    const l = await t.lead(id);
    await t.admin.req('PATCH', `/api/leads/${id}`, { phone: '98260 11111', expectedUpdatedAt: l.updatedAt });
    expect((await t.lead(id)).googleCheck.status).toBe('');
  });

  it('cap and pause are respected; a bulk run stops cleanly with partial results', async () => {
    const t = await setup();
    const ids = [
      await t.add(t.admin, { businessName: 'Qvx Iron Gym', city: 'Bhopal' }),
      await t.add(t.admin, { businessName: 'Qvx Glow Salon', city: 'Bhopal' }),
      await t.add(t.admin, { businessName: 'Qvx Brew Cafe', city: 'Indore' }),
    ];
    expect((await t.owner.req('PUT', '/api/settings', { placesMonthlyCap: 2 })).status).toBe(200);

    // What the bulk bar does: one at a time, stop at the first cap/pause refusal.
    const done: string[] = [];
    let stopped = '';
    for (const id of ids) {
      const r = await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
      if (r.status === 429 || r.status === 423) {
        stopped = r.body.code;
        break;
      }
      expect(r.status).toBe(200);
      done.push(id);
    }
    expect(done).toEqual(ids.slice(0, 2));
    expect(stopped).toBe('PLACES_CAP_REACHED');
    expect(t.places.calls).toHaveLength(2);
    expect(await t.used()).toBe(2);
    expect((await t.lead(ids[2])).googleCheck.status).toBe('');

    // Paused: refused before any call.
    await t.owner.req('PUT', '/api/settings', { placesMonthlyCap: 100, placesPaused: true });
    const p = await t.admin.req('POST', `/api/leads/${ids[2]}/google-check`, {});
    expect(p.status).toBe(423);
    expect(p.body.code).toBe('PLACES_PAUSED');
    expect(t.places.calls).toHaveLength(2);
    expect(await t.used()).toBe(2);
  });

  it('an unbilled Google rejection gives the call back', async () => {
    const t = await setup();
    const id = await t.add(t.admin, { businessName: 'Qvx Iron Gym', city: 'Bhopal' });
    t.places.failWith = 400;
    expect((await t.admin.req('POST', `/api/leads/${id}/google-check`, {})).status).toBe(502);
    expect(await t.used()).toBe(0);
    expect((await t.lead(id)).googleCheck.status).toBe('');
  });
});

describe('No Google values are stored, except confirmed and saved ones', () => {
  it('greps every tab and all log output after a full run', async () => {
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void logged.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void logged.push(a.join(' ')));
    vi.spyOn(console, 'warn').mockImplementation((...a) => void logged.push(a.join(' ')));
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const t = await setup();
      const iron = await t.add(t.admin, { businessName: 'Qvx Iron Gym', city: 'Bhopal' });
      const glow = await t.add(t.admin, { businessName: 'Qvx Glow Salon', city: 'Bhopal', category: 'Salon' });
      const brew = await t.add(t.admin, { businessName: 'Qvx Brew Cafe', city: 'Indore' });
      await t.admin.req('POST', `/api/leads/${iron}/google-check`, {});
      t.h.clock.advance(7 * 86_400_000 + 60_000);
      await relogin(t);
      expect((await t.admin.req('POST', `/api/leads/${iron}/google-check/view`, {})).status).toBe(200);
      const g = await t.admin.req('POST', `/api/leads/${glow}/google-check`, {});
      // Only Glow's phone is confirmed and saved.
      await t.admin.req('POST', `/api/leads/${glow}/google-check/apply`, { token: g.body.google.token, confirmed: true, choices: { phone: 'google', businessName: 'mine' } });
      const b = await t.admin.req('POST', `/api/leads/${brew}/google-check`, {});
      await t.admin.req('POST', `/api/leads/${brew}/google-check/pick`, { token: b.body.candidates[1].token });

      const tabs = ['Users', 'Sessions', 'Settings', 'Audit', 'Meta', 'Leads', 'CallLog', 'Expirations', 'PlacesClaims', 'Availability', 'Bookings', 'Notifications', 'Expenses', 'Projects', 'Goals', 'Milestones', 'MilestoneItems', 'Contributions'];
      const everything = JSON.stringify(await t.h.snapshot(tabs)) + logged.join('\n');
      const saved = '+919911100002';
      for (const p of ALL) {
        if (p.name !== 'Qvx Iron Gym' && p.name !== 'Qvx Brew Cafe') expect(everything, p.name).not.toContain(p.name);
        expect(everything).not.toContain(p.address);
        if (p.area) expect(everything).not.toContain(p.area);
        if (p.website) expect(everything).not.toContain(p.website);
        if (p.phone && p.phone.replace(/\s/g, '') !== saved) {
          expect(everything).not.toContain(p.phone);
          expect(everything).not.toContain(p.phone.replace(/\s/g, ''));
        }
        if (p.ratingCount) expect(everything).not.toContain(String(p.ratingCount));
        if (p.rating) expect(everything).not.toContain(String(p.rating));
      }
      // The confirmed, saved value is ours now; the place IDs are allowed.
      expect(everything).toContain(saved);
      expect(everything).toContain('ChIJ_qvx_iron');
      expect(everything).toContain('ChIJ_qvx_brew_2');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});


// ─── Team member side: rules enforced on the server ─────────────────────────

describe('Team members: who, the 7-day rule and the monthly allowance', () => {
  const ids = async (t: Awaited<ReturnType<typeof setup>>) => {
    const users = (await t.owner.req('GET', '/api/users')).body.users as { id: string; email: string; updatedAt: string }[];
    return { staffId: users.find((u) => u.email === EMPLOYEE_EMAIL)!.id, users };
  };
  const allowance = async (c: Client) => (await c.req('GET', '/api/google-check/allowance')).body;

  it('permissions: not their lead → 403, Find clients → refused, founder-given → read-only, allowances → founders only', async () => {
    const t = await setup();
    const { staffId } = await ids(t);
    const given = await t.add(t.admin, { businessName: 'Qvx Iron Gym', city: 'Bhopal', assignTo: staffId });
    await t.admin.req('POST', `/api/leads/${given}/google-check`, {});
    // Read-only: the member sees the founder's result, every action is refused.
    const seen = await t.lead(given, t.staff);
    expect(seen.googleCheck).toMatchObject({ status: 'needs_review', checkedByName: 'Admin One' });
    expect(seen.addedBy).not.toBe(staffId);
    for (const path of ['', '/view', '/not-on-google', '/apply', '/pick']) {
      const r = await t.staff.req('POST', `/api/leads/${given}/google-check${path}`, path === '/apply' || path === '/pick' ? { token: 'x'.repeat(20) } : {});
      expect(r.status, path).toBe(403);
    }
    // Find clients leads are never checked.
    await t.h.db.insert('Leads', { placeId: 'ChIJ_fc_1', category: 'Gym', city: 'Bhopal', source: 'Google Places', origin: 'find_clients', addedBy: staffId, assignedTo: staffId, status: 'New' }, 'test');
    const fc = ((await t.staff.req('GET', '/api/leads')).body.leads as { id: string; origin: string }[]).find((l) => l.origin === 'find_clients')!;
    expect((await t.staff.req('POST', `/api/leads/${fc.id}/google-check`, {})).body.code).toBe('FIND_CLIENTS_LEAD');
    // Members cannot change allowances, by either route.
    expect((await t.staff.req('PUT', `/api/team/${staffId}/lead-check-limit`, { limit: 500 })).status).toBe(403);
    expect((await t.staff.req('PATCH', `/api/users/${staffId}`, { leadCheckLimit: 500 })).status).toBe(403);
    expect((await allowance(t.staff)).mine.limit).toBe(100);
    expect(t.places.calls).toHaveLength(1);
  });

  it('7-day rule across people: a founder checks, the member who added it is blocked with the right date', async () => {
    const t = await setup();
    const mine = await t.add(t.staff, { businessName: 'Qvx Iron Gym', city: 'Bhopal' });
    expect((await t.admin.req('POST', `/api/leads/${mine}/google-check`, {})).status).toBe(200); // 21 Nov 10:00 IST
    const r = await t.staff.req('POST', `/api/leads/${mine}/google-check`, {});
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('CHECKED_RECENTLY');
    expect(r.body.error).toContain('21 Nov 2026');
    expect(r.body.error).toContain('28 Nov 2026');
    expect((await t.lead(mine, t.staff)).googleCheck.nextCheckAt).toBe('2026-11-28T04:30:00.000Z');
    expect((await allowance(t.staff)).mine.used).toBe(0);
    expect(t.places.calls).toHaveLength(1);
    // A day before: still blocked. After 7 days: allowed.
    t.h.clock.advance(6 * 86_400_000);
    await relogin(t);
    expect((await t.staff.req('POST', `/api/leads/${mine}/google-check`, {})).status).toBe(429);
    t.h.clock.advance(86_400_000 + 1000);
    await relogin(t);
    expect((await t.staff.req('POST', `/api/leads/${mine}/google-check`, {})).status).toBe(200);
  });

  it('allowance: exactly 1 per check or fresh lookup, 0 for pick/save/keep/mark, failures free, blocked at 0, IST monthly reset, founder override audited, pause stops everyone', async () => {
    const t = await setup();
    const { staffId } = await ids(t);
    const iron = await t.add(t.staff, { businessName: 'Qvx Iron Gym', city: 'Bhopal' });
    const glow = await t.add(t.staff, { businessName: 'Qvx Glow Salon', city: 'Bhopal' });
    const brew = await t.add(t.staff, { businessName: 'Qvx Brew Cafe', city: 'Indore' });
    const none = await t.add(t.staff, { businessName: 'Qvx Nowhere Dental', city: 'Bhopal' });
    const left = async () => (await allowance(t.staff)).mine.remaining as number;
    expect(await left()).toBe(100);

    // A check: exactly 1.
    const g = await t.staff.req('POST', `/api/leads/${glow}/google-check`, {});
    expect(g.body.status).toBe('needs_review');
    expect(await left()).toBe(99);
    // Keep mine and saving (confirmed): 0.
    await t.staff.req('POST', `/api/leads/${glow}/google-check/apply`, { token: g.body.google.token, confirmed: false, choices: { businessName: 'mine' } });
    await t.staff.req('POST', `/api/leads/${glow}/google-check/apply`, { token: g.body.google.token, confirmed: true, choices: { phone: 'google' } });
    expect(await left()).toBe(99);
    // Pick among shown results: 0.
    const b = await t.staff.req('POST', `/api/leads/${brew}/google-check`, {});
    expect(b.body.status).toBe('pick');
    expect(await left()).toBe(98);
    expect((await t.staff.req('POST', `/api/leads/${brew}/google-check/pick`, { token: b.body.candidates[0].token })).body.calls).toBe(0);
    expect(await left()).toBe(98);
    // Not found, an edited search right away (allowed, costs 1), then "Mark as not on Google": 0.
    expect((await t.staff.req('POST', `/api/leads/${none}/google-check`, {})).body.status).toBe('not_found');
    expect((await t.staff.req('POST', `/api/leads/${none}/google-check`, { query: 'Qvx Nowhere Dental Clinic, Bhopal' })).status).toBe(200);
    expect(await left()).toBe(96);
    await t.staff.req('POST', `/api/leads/${none}/google-check/not-on-google`, {});
    expect(await left()).toBe(96);

    // Failed Google calls cost the member nothing (unbilled 4xx, and a 5xx).
    for (const code of [400, 500]) {
      t.places.failWith = code;
      expect((await t.staff.req('POST', `/api/leads/${iron}/google-check`, {})).status).toBe(502);
    }
    t.places.failWith = null;
    expect(await left()).toBe(96);
    expect((await t.lead(iron, t.staff)).googleCheck.status).toBe('');

    // A fresh lookup on a checked lead: exactly 1 (after the 7-day rule).
    t.h.clock.advance(7 * 86_400_000 + 60_000); // 28 Nov
    await relogin(t);
    expect((await t.staff.req('POST', `/api/leads/${glow}/google-check/view`, {})).body.calls).toBe(1);
    expect(await left()).toBe(95);

    // Founder override (audited), blocked at 0 with no outbound call.
    const before = t.places.calls.length;
    expect((await t.admin.req('PUT', `/api/team/${staffId}/lead-check-limit`, { limit: 5 })).body).toMatchObject({ leadCheckLimit: 5, effective: 5 });
    expect(await left()).toBe(0);
    const blocked = await t.staff.req('POST', `/api/leads/${iron}/google-check`, {});
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('MEMBER_CHECK_LIMIT');
    expect(blocked.body.error).toContain('1 Dec 2026');
    expect(t.places.calls.length).toBe(before);
    const audit = (await t.owner.req('GET', '/api/audit')).body.entries as { action: string; entityId: string; actor: string }[];
    expect(audit.find((e) => e.action === 'users.lead_check_limit' && e.entityId === staffId)?.actor).toBe('Admin One');

    // Monthly reset at midnight IST on the 1st: 30 Nov 18:30 UTC = 1 Dec 00:00 IST.
    t.h.clock.set('2026-11-30T18:29:00.000Z');
    await relogin(t);
    expect(await left()).toBe(0);
    t.h.clock.set('2026-11-30T18:31:00.000Z');
    await relogin(t);
    expect((await allowance(t.staff)).mine).toMatchObject({ used: 0, limit: 5, remaining: 5 });
    expect((await t.staff.req('POST', `/api/leads/${iron}/google-check`, {})).status).toBe(200);
    expect(await left()).toBe(4);

    // Pause: everyone refused, zero outbound calls, nothing used.
    await t.owner.req('PUT', '/api/settings', { placesPaused: true });
    const calls = t.places.calls.length;
    const used = await t.used();
    expect((await t.staff.req('POST', `/api/leads/${brew}/google-check`, {})).body.code).toBe('PLACES_PAUSED');
    const founderLead = await t.add(t.admin, { businessName: 'Qvx Iron Gym Two', city: 'Bhopal' });
    expect((await t.admin.req('POST', `/api/leads/${founderLead}/google-check`, {})).body.code).toBe('PLACES_PAUSED');
    expect(t.places.calls.length).toBe(calls);
    expect(await t.used()).toBe(used);
    expect(await left()).toBe(4);
    expect((await allowance(t.staff)).google.paused).toBe(true);
  });
});
