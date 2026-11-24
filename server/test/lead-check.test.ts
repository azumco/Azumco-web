// "Check against Google", end to end over HTTP with a mocked Places client.
// Runs on the in-memory store and, with `npm run test:pg`, on Postgres.
// Every business, number, address and site below is a fictitious fixture with
// distinctive strings, so the "never stored" grep is meaningful.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, memberClient, startHarness, superAdmin, type Client, type Harness } from './harness.ts';
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

describe('Who and what can be checked', () => {
  it('team members get 403 on every check action, but can see the status', async () => {
    const t = await setup();
    const id = await t.add(t.staff, { businessName: 'Qvx Iron Gym', city: 'Bhopal', phone: '99111 00001' });
    for (const path of ['', '/pick', '/view', '/apply', '/not-on-google']) {
      const r = await t.staff.req('POST', `/api/leads/${id}/google-check${path}`, path === '/pick' || path === '/apply' ? { token: 'x'.repeat(20) } : {});
      expect(r.status, path).toBe(403);
    }
    expect(t.places.calls).toHaveLength(0);
    // A founder checks it; the member then sees the result (codes only).
    expect((await t.admin.req('POST', `/api/leads/${id}/google-check`, {})).status).toBe(200);
    const seen = await t.lead(id, t.staff);
    expect(seen.origin).toBe('team');
    expect(seen.googleCheck.status).toBe('needs_review');
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

  it('"View" a past check is one live call; editing a compared field resets the status', async () => {
    const t = await setup();
    const id = await t.add(t.admin, { businessName: 'Qvx Iron Gym', area: 'Qvx Market', city: 'Bhopal', phone: '99111 00001', websiteOrInstagram: 'qvx-iron.example', category: 'Gym' });
    await t.admin.req('POST', `/api/leads/${id}/google-check`, {});
    t.places.calls = [];
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
      await t.admin.req('POST', `/api/leads/${iron}/google-check/view`, {});
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
