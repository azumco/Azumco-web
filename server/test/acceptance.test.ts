// Acceptance criteria, end to end over HTTP against the real app, with a fake
// clock, a mocked Google Places client and the in-memory store.
// All names, numbers and places below are fictitious test fixtures.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_EMAIL, Client, EMPLOYEE_EMAIL, FakeClock, memberClient, startHarness, superAdmin, type Harness,
} from './harness.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { Db } from '../sheets/db.ts';
import { bootstrap } from '../bootstrap.ts';
import { claimPlacesCall } from '../places/budget.ts';
import { PlacesHttpError, type PlaceResult, type PlacesClient } from '../places/client.ts';
import { sweepExpired, logCall } from '../leads/service.ts';
import { commissionFor, timeLeft } from '../../shared/rules.ts';
import { toSessionUser } from '../auth/sessions.ts';
import { testConfig } from './harness.ts';

const HOUR = 3_600_000;

/** Fictitious places. Distinctive strings so the "never stored" grep is meaningful. */
const FAKE: PlaceResult[] = Array.from({ length: 20 }, (_, i) => ({
  placeId: `ChIJ_fake_place_${i}`,
  name: `Zqx Fitness Hub ${i}`,
  address: `${i} Imaginary Lane, Testpur`,
  phone: `+91 99000 1${String(i).padStart(4, '0')}`,
  website: `https://zqx-fitness-${i}.example`,
}));

class MockPlaces implements PlacesClient {
  calls: string[] = [];
  delayMs = 0;
  failWith: number | null = null;
  async searchText(query: string, limit: number) {
    this.calls.push(`search:${query}`);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failWith) throw new PlacesHttpError(this.failWith, 'mock failure');
    return FAKE.slice(0, limit);
  }
  async placeDetails(placeId: string) {
    this.calls.push(`details:${placeId}`);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failWith) throw new PlacesHttpError(this.failWith, 'mock failure');
    return FAKE.find((p) => p.placeId === placeId) ?? FAKE[0];
  }
}

let h: Harness;
let places: MockPlaces;
let owner: Client;
let admin: Client;
let staff: Client;
let staffId: string;

async function setup(opts: { clock?: FakeClock } = {}) {
  places = new MockPlaces();
  h = await startHarness(new MemoryBackend(), testConfig(), { placesClient: places, clock: opts.clock });
  owner = await superAdmin(h);
  admin = (await memberClient(h, owner, ADMIN_EMAIL)).client;
  const m = await memberClient(h, owner, EMPLOYEE_EMAIL);
  staff = m.client;
  staffId = m.id;
}

/** Search + import N results, optionally assigned to the employee. */
async function importLeads(n: number, assign = true, hours = 24) {
  const search = await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: n });
  expect(search.status).toBe(200);
  const imp = await admin.req('POST', '/api/places/import', {
    category: 'Gym',
    city: 'Bhopal',
    searchedAt: search.body.searchedAt,
    placeIds: search.body.results.map((r: PlaceResult) => r.placeId),
    ...(assign ? { assignTo: staffId, windowHours: hours } : {}),
  });
  expect(imp.status).toBe(200);
  const leads = (await admin.req('GET', '/api/leads')).body.leads as { id: string; placeId?: string; label: string }[];
  return leads;
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(async () => {
  await h?.close();
});

// ─── 2. Employees are refused at the API ────────────────────────────────────

describe('AC2 — employees get 403 on expense, settings and Places routes', () => {
  it('refuses every such route by direct call', async () => {
    await setup();
    const routes: [string, string, unknown?][] = [
      ['GET', '/api/finance'],
      ['POST', '/api/finance/expenses', { date: '2026-11-20', item: 'x', amount: 1, paidBy: 'Company Fund' }],
      ['PUT', '/api/finance/expenses/any', {}],
      ['DELETE', '/api/finance/expenses/any'],
      ['POST', '/api/finance/projects', {}],
      ['PUT', '/api/finance/projects/any', {}],
      ['DELETE', '/api/finance/projects/any'],
      ['GET', '/api/settings'],
      ['PUT', '/api/settings', { placesMonthlyCap: 5 }],
      ['GET', '/api/audit'],
      ['GET', '/api/users'],
      ['GET', '/api/places/status'],
      ['POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 5 }],
      ['POST', '/api/places/import', {}],
      ['GET', '/api/leads/export.csv'],
      ['DELETE', '/api/leads/any'],
      ['POST', '/api/leads', { businessName: 'x' }],
      ['POST', '/api/leads/assign', { leadIds: ['x'], assigneeId: null }],
      ['GET', '/api/dashboard/founder'],
    ];
    for (const [method, path, body] of routes) {
      const res = await staff.req(method, path, body);
      expect([method, path, res.status]).toEqual([method, path, 403]);
    }
    expect(places.calls).toHaveLength(0);
  });

  it('admins (not super_admin) are refused settings and audit but can use finance and Places', async () => {
    await setup();
    expect((await admin.req('GET', '/api/settings')).status).toBe(403);
    expect((await admin.req('PUT', '/api/settings', { placesPaused: true })).status).toBe(403);
    expect((await admin.req('GET', '/api/audit')).status).toBe(403);
    expect((await admin.req('GET', '/api/finance')).status).toBe(200);
    expect((await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 })).status).toBe(200);
  });
});

// ─── 3. Employees see only their own leads and goals ────────────────────────

describe('AC3 — employees read/update only their own leads and goals', () => {
  it('scopes leads', async () => {
    await setup();
    const mine = await admin.req('POST', '/api/leads', { businessName: 'Assigned Co', phone: '9811100001', assignTo: staffId });
    const other = await admin.req('POST', '/api/leads', { businessName: 'Other Co', phone: '9811100002' });
    const list = (await staff.req('GET', '/api/leads')).body.leads;
    expect(list.map((l: { id: string }) => l.id)).toEqual([mine.body.id]);

    expect((await staff.req('GET', `/api/leads/${other.body.id}`)).status).toBe(404);
    expect((await staff.req('PATCH', `/api/leads/${other.body.id}`, { need: 'x' })).status).toBe(404);
    expect((await staff.req('POST', `/api/leads/${other.body.id}/calls`, { outcome: 'No answer' })).status).toBe(404);
    expect((await staff.req('PATCH', `/api/leads/${mine.body.id}`, { need: 'New website' })).status).toBe(200);
    // Employees cannot touch founder fields even on their own lead.
    expect((await staff.req('PATCH', `/api/leads/${mine.body.id}`, { status: 'Won' })).status).toBe(400);
    expect((await staff.req('DELETE', `/api/leads/${mine.body.id}`)).status).toBe(403);
  });

  it('scopes goals and lets her change only the status of her own', async () => {
    await setup();
    await owner.req('POST', '/api/goals', { goal: 'Sales', task: 'Call list A', owner: 'Staff One' });
    await owner.req('POST', '/api/goals', { goal: 'Sales', task: 'Support task', owner: 'Admin One', support: ['Staff'] });
    const founderView = (await owner.req('GET', '/api/goals')).body.goals;
    const staffView = (await staff.req('GET', '/api/goals')).body.goals;
    expect(founderView.length).toBe(9); // 7 seeded + 2
    expect(staffView.map((g: { task: string }) => g.task).sort()).toEqual(['Call list A', 'Support task']);

    const seeded = founderView.find((g: { task: string }) => g.task === 'Fix the Azumco website');
    expect((await staff.req('PATCH', `/api/goals/${seeded.id}`, { status: 'Done' })).status).toBe(404);
    const own = staffView.find((g: { task: string }) => g.task === 'Call list A');
    expect((await staff.req('PATCH', `/api/goals/${own.id}`, { status: 'In Progress' })).status).toBe(200);
    expect((await staff.req('PATCH', `/api/goals/${own.id}`, { task: 'renamed' })).status).toBe(400);
    expect((await staff.req('POST', '/api/goals', { goal: 'x', task: 'y', owner: 'Staff One' })).status).toBe(403);
  });
});

// ─── 4. The hard cap ────────────────────────────────────────────────────────

describe('AC4 — hard monthly cap', () => {
  it('cap 3: 10 parallel paid requests (searches + lookups) cause exactly 3 Google calls; survives restart', async () => {
    await setup();
    const leads = await importLeads(5, true);
    expect(places.calls).toHaveLength(1);
    await owner.req('PUT', '/api/settings', { placesMonthlyCap: 4 }); // 1 already used by the import search → 3 left
    places.calls = [];
    places.delayMs = 5;

    const requests = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0
        ? admin.req('POST', '/api/places/search', { category: 'Salon', state: 'Madhya Pradesh', city: 'Indore', limit: 3 })
        : staff.req('GET', `/api/leads/${leads[i % leads.length].id}/live-contact`),
    );
    const results = await Promise.all(requests);
    const ok = results.filter((r) => r.status === 200).length;
    expect(places.calls).toHaveLength(3);
    expect(ok).toBe(3);
    expect(results.filter((r) => r.status === 429).every((r) => r.body.code === 'PLACES_CAP_REACHED')).toBe(true);

    h = await h.restart();
    const usage = (await new Client(h.url).req('GET', '/api/health')).status;
    expect(usage).toBe(200);
    const o2 = new Client(h.url);
    o2.cookie = owner.cookie;
    o2.csrf = owner.csrf;
    const status = (await o2.req('GET', '/api/settings')).body.usage;
    expect(status).toMatchObject({ used: 4, cap: 4, remaining: 0, searches: expect.any(Number), lookups: expect.any(Number) });
    expect(status.searches + status.lookups).toBe(4);
  });

  it('cap holds across two server processes sharing one spreadsheet (write-then-read-back)', async () => {
    const backend = new MemoryBackend();
    const config = testConfig();
    const a = new Db(backend);
    await bootstrap(config, a);
    const b = new Db(backend); // a second process: its own cache and its own queue
    await a.exclusive(async () => {
      const [s] = await a.loadFresh(['Settings']);
      await a.updateUnqueued('Settings', s.rows.find((r) => r.key === 'placesMonthlyCap')!.id, { value: '3' }, 't');
    });
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) => claimPlacesCall(i % 2 ? a : b, 'text_search_enterprise', 'u')),
    );
    expect(claims.filter((c) => c.ok)).toHaveLength(3);
    const [ledger] = await backend.readTabs(['PlacesClaims']);
    const statusCol = ledger[0].indexOf('status');
    expect(ledger.slice(1).filter((r) => r[statusCol] === 'claimed')).toHaveLength(3);
  });

  it('an unbilled rejection releases the slot', async () => {
    await setup();
    places.failWith = 400;
    expect((await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 })).status).toBe(502);
    expect((await owner.req('GET', '/api/settings')).body.usage.used).toBe(0);
    places.failWith = 500; // may have been billed → kept
    await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 });
    expect((await owner.req('GET', '/api/settings')).body.usage.used).toBe(1);
  });
});

// ─── 5. Pause ───────────────────────────────────────────────────────────────

describe('AC5 — pause stops queued work before it reaches Google', () => {
  it('requests already waiting in the queue are refused once paused', async () => {
    await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Hold the write queue so the next requests queue up behind it.
    const holder = h.db.exclusive(async () => {
      await gate;
      const [s] = await h.db.loadFresh(['Settings']);
      await h.db.updateUnqueued('Settings', s.rows.find((r) => r.key === 'placesPaused')!.id, { value: 'TRUE' }, 'owner');
    });
    const queued = Array.from({ length: 5 }, () => admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 }));
    await new Promise((r) => setTimeout(r, 30)); // let them reach the queue
    release();
    await holder;
    const results = await Promise.all(queued);
    expect(results.map((r) => r.status)).toEqual([423, 423, 423, 423, 423]);
    expect(places.calls).toHaveLength(0);
  });

  it('the super admin pause switch blocks searches and lookups', async () => {
    await setup();
    const leads = await importLeads(2);
    places.calls = [];
    await owner.req('PUT', '/api/settings', { placesPaused: true });
    expect((await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 })).body.code).toBe('PLACES_PAUSED');
    expect((await staff.req('GET', `/api/leads/${leads[0].id}/live-contact`)).body.code).toBe('PLACES_PAUSED');
    expect(places.calls).toHaveLength(0);
  });

  it('disables itself without an API key', async () => {
    h = await startHarness(new MemoryBackend(), testConfig(), { placesClient: null });
    owner = await superAdmin(h);
    const res = await owner.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PLACES_DISABLED');
    expect((await owner.req('GET', '/api/places/status')).body.enabled).toBe(false);
  });
});

// ─── 6. No Places content is stored anywhere ────────────────────────────────

describe('AC6 — no Places name/address/phone/website in Sheets, logs or audit before confirmation', () => {
  it('greps every tab and all log output', async () => {
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void logged.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void logged.push(a.join(' ')));
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development'; // emit info logs too
    try {
      await setup();
      const leads = await importLeads(8);
      await staff.req('GET', `/api/leads/${leads[0].id}/live-contact`);
      await admin.req('GET', `/api/leads/${leads[1].id}/live-contact`);
      places.failWith = 404;
      await staff.req('GET', `/api/leads/${leads[2].id}/live-contact`);

      const tabs = ['Users', 'Sessions', 'Settings', 'Audit', 'Meta', 'Leads', 'CallLog', 'Expirations', 'PlacesClaims', 'Availability', 'Bookings', 'Notifications', 'Expenses', 'Projects', 'Goals'];
      const everything = JSON.stringify(await h.backend.readTabs(tabs)) + logged.join('\n');
      for (const p of FAKE.slice(0, 8)) {
        expect(everything).not.toContain(p.name);
        expect(everything).not.toContain(p.address);
        expect(everything).not.toContain(p.phone);
        expect(everything).not.toContain(p.phone.replace(/\s/g, ''));
        expect(everything).not.toContain(p.website);
      }
      // …while the place IDs (allowed) are stored.
      expect(everything).toContain(FAKE[0].placeId);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

// ─── 7. Confirming ──────────────────────────────────────────────────────────

describe('AC7 — confirm contact', () => {
  it('stores first-party data, marks outreach_confirmed and stops live lookups', async () => {
    await setup();
    const [lead] = await importLeads(1);
    places.calls = [];
    const res = await staff.req('POST', `/api/leads/${lead.id}/confirm`, { businessName: 'Typed By Staff Gym', contactPerson: 'R. Owner', phone: '98260 12345' });
    expect(res.status).toBe(200);
    expect(res.body.lead).toMatchObject({ businessName: 'Typed By Staff Gym', phone: '+919826012345', phoneSource: 'outreach_confirmed', needsLiveLookup: false, label: 'Typed By Staff Gym' });

    const again = await staff.req('GET', `/api/leads/${lead.id}/live-contact`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_CONFIRMED');
    expect(places.calls).toHaveLength(0);
  });

  it('dedupes confirmed phones and Google place IDs', async () => {
    await setup();
    const leads = await importLeads(2);
    await staff.req('POST', `/api/leads/${leads[0].id}/confirm`, { businessName: 'A', phone: '9826012345' });
    const dup = await staff.req('POST', `/api/leads/${leads[1].id}/confirm`, { businessName: 'B', phone: '+91 98260-12345' });
    expect(dup.status).toBe(409);
    // Re-importing the same place IDs adds nothing.
    const search = await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 });
    expect(search.body.results.every((r: { alreadyInLeads: boolean }) => r.alreadyInLeads)).toBe(true);
    const imp = await admin.req('POST', '/api/places/import', { category: 'Gym', city: 'Bhopal', searchedAt: search.body.searchedAt, placeIds: [FAKE[0].placeId, FAKE[1].placeId] });
    expect(imp.body).toEqual({ imported: 0, skipped: 2 });
  });

  it('requires a state, and the query includes city, state and India', async () => {
    await setup();
    await admin.req('POST', '/api/places/search', { category: 'Cafe', state: 'Tripura', city: 'Udaipur', limit: 2 });
    const missing = await admin.req('POST', '/api/places/search', { category: 'Cafe', city: 'Udaipur', limit: 2 });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('Choose a state.');
    expect(places.calls).toEqual(['search:Cafe in Udaipur, Tripura, India']);
  });

  it('unconfirmed Google leads show "Category · City · Google lead"', async () => {
    await setup();
    const [lead] = await importLeads(1);
    expect(lead.label).toBe('Gym · Bhopal · Google lead');
  });
});

// ─── 8–11. Assignment expiry ────────────────────────────────────────────────

describe('AC8 — assignment expiry', () => {
  it('counts down, then returns the lead to Unclaimed exactly once', async () => {
    await setup();
    const [lead] = await importLeads(1, true, 24);
    const first = (await staff.req('GET', '/api/leads')).body;
    expect(first.leads[0].msLeft).toBe(24 * HOUR);
    expect(Date.parse(first.serverNow)).toBe(h.clock.now().getTime());

    h.clock.advance(24 * HOUR - 60_000);
    const before = (await staff.req('GET', '/api/leads')).body.leads;
    expect(before).toHaveLength(1);
    expect(before[0].msLeft).toBe(60_000);

    h.clock.advance(60_000);
    expect((await staff.req('GET', '/api/leads')).body.leads).toHaveLength(0);
    const denied = await staff.req('GET', `/api/leads/${lead.id}`);
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('ASSIGNMENT_EXPIRED');
    expect((await staff.req('POST', `/api/leads/${lead.id}/calls`, { outcome: 'No answer' })).body.code).toBe('ASSIGNMENT_EXPIRED');

    const founderLead = (await admin.req('GET', '/api/leads')).body.leads.find((l: { id: string }) => l.id === lead.id);
    expect(founderLead.assignedTo).toBe('');

    // The maintenance sweep, twice: still exactly one record of each.
    for (let i = 0; i < 2; i++) {
      const run = await fetch(`${h.url}/api/maintenance/run`, { method: 'POST', headers: { Authorization: `Bearer ${h.config.CRON_TOKEN}` } });
      expect(run.status).toBe(200);
    }
    const notes = (await h.db.loadFresh(['Notifications']))[0].rows.filter((n) => n.type === 'assignment_expired' && n.refId === lead.id);
    expect(notes).toHaveLength(2); // one per founder (super admin + admin), nothing duplicated
    expect(new Set(notes.map((n) => n.userId)).size).toBe(notes.length);
    const audits = (await h.db.loadFresh(['Audit']))[0].rows.filter((a) => a.action === 'lead.assignment_expired' && a.entityId === lead.id);
    expect(audits).toHaveLength(1);
    expect((await admin.req('GET', '/api/dashboard/founder')).body.expiredByAssignee).toEqual({ 'Staff One': 1 });
  });

  it('maintenance endpoint rejects a wrong token', async () => {
    await setup();
    const res = await fetch(`${h.url}/api/maintenance/run`, { method: 'POST', headers: { Authorization: 'Bearer wrong' } });
    expect(res.status).toBe(401);
  });
});

describe('AC9 — an attempt before expiry stops the timer for good', () => {
  it('keeps the lead with her after the deadline', async () => {
    await setup();
    const [lead] = await importLeads(1, true, 12);
    h.clock.advance(11 * HOUR);
    const call = await staff.req('POST', `/api/leads/${lead.id}/calls`, { outcome: 'No answer', note: 'rang twice' });
    expect(call.status).toBe(201);
    expect(call.body.timerStopped).toBe(true);
    h.clock.advance(30 * HOUR);
    const list = (await staff.req('GET', '/api/leads')).body.leads;
    expect(list.map((l: { id: string }) => l.id)).toEqual([lead.id]);
    expect(list[0]).toMatchObject({ timerRunning: false, attempts: 1 });
  });

  it('with the "reached only" rule, an unanswered call does not stop the timer', async () => {
    await setup();
    await owner.req('PUT', '/api/settings', { contactedRule: 'reached_only' });
    const [lead] = await importLeads(1, true, 12);
    expect((await staff.req('POST', `/api/leads/${lead.id}/calls`, { outcome: 'No answer' })).body.timerStopped).toBe(false);
    expect((await staff.req('POST', `/api/leads/${lead.id}/calls`, { outcome: 'Interested' })).body.timerStopped).toBe(true);
  });
});

describe('AC10 — reassigning restarts the timer; deactivation releases leads', () => {
  it('reassign restarts', async () => {
    await setup();
    const [lead] = await importLeads(1, true, 24);
    h.clock.advance(25 * HOUR);
    await staff.req('GET', '/api/leads'); // lapses
    const r = await admin.req('POST', '/api/leads/assign', { leadIds: [lead.id], assigneeId: staffId, hours: 48 });
    expect(r.status).toBe(200);
    const mine = (await staff.req('GET', '/api/leads')).body.leads;
    expect(mine[0].msLeft).toBe(48 * HOUR);
  });

  it('deactivating a user returns her leads to Unclaimed immediately', async () => {
    await setup();
    await importLeads(3, true);
    await admin.req('POST', '/api/leads', { businessName: 'Manual Co', assignTo: staffId });
    await owner.req('PATCH', `/api/users/${staffId}`, { active: false });
    const leads = (await admin.req('GET', '/api/leads')).body.leads;
    expect(leads.every((l: { assignedTo: string }) => l.assignedTo === '')).toBe(true);
  });
});

describe('AC11 — a call log racing the expiry has exactly one winner', () => {
  async function race(offsetMs: number) {
    await setup();
    const [lead] = await importLeads(1, true, 24);
    h.clock.advance(24 * HOUR + offsetMs);
    const user = toSessionUser((await h.db.all('Users')).find((u) => u.id === staffId)!);
    const [call, swept] = await Promise.allSettled([logCall(h.db, user, lead.id, { outcome: 'No answer' }), sweepExpired(h.db)]);
    return { call, swept, lead };
  }

  it('one millisecond before the deadline: the call wins and nothing expires', async () => {
    const { call, swept } = await race(-1);
    expect(call.status).toBe('fulfilled');
    expect(swept).toEqual({ status: 'fulfilled', value: 0 });
  });

  it('at the deadline: the expiry wins and the caller gets a clear message', async () => {
    const { call, swept } = await race(0);
    expect(call.status).toBe('rejected');
    expect((call as PromiseRejectedResult).reason.code).toBe('ASSIGNMENT_EXPIRED');
    expect((call as PromiseRejectedResult).reason.message).toMatch(/expired at .* IST .*went back to the founders/);
    expect(swept).toEqual({ status: 'fulfilled', value: 1 });
  });

  it('the UI-facing message is returned over HTTP too', async () => {
    await setup();
    const [lead] = await importLeads(1, true, 12);
    h.clock.advance(12 * HOUR);
    const res = await staff.req('POST', `/api/leads/${lead.id}/calls`, { outcome: 'Interested' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Ask a founder/);
  });
});

// ─── 12. Bookings ───────────────────────────────────────────────────────────

describe('AC12 — two simultaneous bookings for one slot: exactly one succeeds', () => {
  async function prepare() {
    await setup();
    await admin.req('POST', '/api/availability', { date: '2026-11-23', start: '10:00', end: '11:00', slotMinutes: 30 });
    const l1 = await admin.req('POST', '/api/leads', { businessName: 'Lead One', assignTo: staffId });
    const l2 = await admin.req('POST', '/api/leads', { businessName: 'Lead Two', assignTo: staffId });
    const slots = (await staff.req('GET', '/api/slots?from=2026-11-23&days=1')).body.slots;
    expect(slots).toHaveLength(2);
    const body = (leadId: string) => ({ leadId, founderId: slots[0].founderId, date: '2026-11-23', start: '10:00', clientName: 'Client', mode: 'Zoho Cliq' });
    return { l1: l1.body.id, l2: l2.body.id, body };
  }

  it('over HTTP', async () => {
    const { l1, l2, body } = await prepare();
    const [a, b] = await Promise.all([staff.req('POST', '/api/bookings', body(l1)), staff.req('POST', '/api/bookings', body(l2))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('SLOT_TAKEN');
    const slots = (await staff.req('GET', '/api/slots?from=2026-11-23&days=1')).body.slots;
    expect(slots.find((s: { start: string }) => s.start === '10:00').booked).toBe(true);
  });

  it('across two server processes (write-then-read-back)', async () => {
    const { l1, l2, body } = await prepare();
    const { BookingService } = await import('../bookings/service.ts');
    const other = new Db(h.backend, { now: h.clock.now });
    const user = toSessionUser((await h.db.all('Users')).find((u) => u.id === staffId)!);
    const results = await Promise.allSettled([
      new BookingService(h.db).book(user, { ...body(l1), phone: '', link: '', notes: '' } as never),
      new BookingService(other).book(user, { ...body(l2), phone: '', link: '', notes: '' } as never),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [grid] = await h.backend.readTabs(['Bookings']);
    const status = grid[0].indexOf('status');
    expect(grid.slice(1).filter((r) => r[status] === 'booked')).toHaveLength(1);
  });

  it('"call happened: yes" qualifies the lead for commission', async () => {
    const { l1, body } = await prepare();
    const booking = (await staff.req('POST', '/api/bookings', body(l1))).body.booking;
    expect((await staff.req('POST', `/api/bookings/${booking.id}/call-happened`, { happened: true })).status).toBe(403);
    await admin.req('POST', `/api/bookings/${booking.id}/call-happened`, { happened: true });
    const lead = (await admin.req('GET', `/api/leads/${l1}`)).body.lead;
    expect(lead).toMatchObject({ callHappened: true, status: 'Qualified', commission: 200 });
  });
});

// ─── 13. Commission ─────────────────────────────────────────────────────────

describe('AC13 — commission', () => {
  const rates = { qualifiedFee: 200, oneTimePct: 10, monthlyPct: 10 };
  it.each([
    ['call happened only', { callHappened: true, status: 'Qualified', clientPaid: false, dealType: '', dealValue: 0 }, 200],
    ['won but not paid', { callHappened: true, status: 'Won', clientPaid: false, dealType: 'One-time', dealValue: 25000 }, 200],
    ['won and paid, one-time', { callHappened: true, status: 'Won', clientPaid: true, dealType: 'One-time', dealValue: 25000 }, 2700],
    ['won and paid, monthly', { callHappened: true, status: 'Won', clientPaid: true, dealType: 'Monthly', dealValue: 8000 }, 1000],
    ['paid but not won', { callHappened: false, status: 'Negotiating', clientPaid: true, dealType: 'One-time', dealValue: 25000 }, 0],
  ])('%s', (_name, input, expected) => {
    expect(commissionFor(input, rates)).toBe(expected);
  });

  it('uses the super admin rates and tracks earned / paid / pending', async () => {
    await setup();
    await owner.req('PUT', '/api/settings', { commissionMonthlyPct: 15 });
    const id = (await admin.req('POST', '/api/leads', { businessName: 'Deal Co', assignTo: staffId })).body.id;
    await admin.req('PATCH', `/api/leads/${id}`, { callHappened: true, status: 'Won', clientPaid: true, dealType: 'Monthly', dealValue: 10000 });
    expect((await staff.req('GET', '/api/dashboard/me')).body.earnings).toEqual({ earned: 1700, paid: 0, pending: 1700 });
    await admin.req('POST', `/api/leads/${id}/commission-paid`);
    expect((await staff.req('GET', '/api/dashboard/me')).body.earnings).toEqual({ earned: 1700, paid: 1700, pending: 0 });
    const audit = (await owner.req('GET', '/api/audit')).body.entries.map((e: { action: string }) => e.action);
    expect(audit).toContain('commission.paid');
  });
});

// ─── 14. Expenses ───────────────────────────────────────────────────────────

describe('AC14 — expense summary from the seed', () => {
  it('matches the expected figures', async () => {
    await setup();
    const { summary } = (await admin.req('GET', '/api/finance')).body;
    expect(summary).toMatchObject({
      received: 4000,
      spentByCompany: 1394,
      cashInCompany: 2606,
      stillToReceive: 4000,
      owedToMembers: 150,
      cashAfterPayingMembers: 2456,
    });
    expect(summary.members).toEqual([{ name: 'Ayan', spent: 150, repaid: 0, toPay: 150 }]);
    expect(summary.projects[0]).toMatchObject({ name: 'Zyvia', pending: 4000, expenses: 1394, profit: 2606 });
  });

  it('audits expense edits with before/after', async () => {
    await setup();
    const { expenses } = (await admin.req('GET', '/api/finance')).body;
    const sim = expenses.find((e: { item: string }) => e.item === 'Company SIM card');
    await admin.req('PUT', `/api/finance/expenses/${sim.id}`, { ...sim, repaid: true, expectedUpdatedAt: sim.updatedAt });
    const { summary } = (await admin.req('GET', '/api/finance')).body;
    expect(summary).toMatchObject({ spentByCompany: 1544, owedToMembers: 0 });
    const entry = (await owner.req('GET', '/api/audit')).body.entries.find((e: { action: string }) => e.action === 'expenses.update');
    expect(JSON.parse(entry.before).repaid).toBe('FALSE');
    expect(JSON.parse(entry.after).repaid).toBe('TRUE');
  });
});

// ─── 15. Goals time left ────────────────────────────────────────────────────

describe('AC15 — goals time left', () => {
  const today = '2026-11-21';
  it.each([
    ['future', '2026-11-30', 'In Progress', 'left', '9 days left'],
    ['tomorrow', '2026-11-22', 'Not Started', 'left', '1 day left'],
    ['today', '2026-11-21', 'In Progress', 'today', 'Due today'],
    ['overdue', '2026-11-18', 'In Progress', 'overdue', 'Overdue 3 days'],
    ['done (even if overdue)', '2026-11-01', 'Done', 'done', 'Done'],
    ['no deadline', '', 'On Hold', 'none', 'No deadline'],
  ])('%s', (_n, deadline, status, kind, label) => {
    expect(timeLeft(deadline, status, today)).toMatchObject({ kind, label });
  });

  it('uses the IST calendar day on the server', async () => {
    // 21 Nov 2026 19:00 UTC is already 22 Nov in IST.
    await setup({ clock: new FakeClock(new Date('2026-11-21T19:00:00Z')) });
    const goals = (await owner.req('GET', '/api/goals')).body;
    expect(goals.today).toBe('2026-11-22');
    expect(goals.goals.find((g: { task: string }) => g.task === 'Fix the Azumco website').timeLeft.label).toBe('8 days left');
    expect(goals.goals.find((g: { task: string }) => g.task === 'Build gym software after the deal is confirmed').timeLeft.label).toBe('No deadline');
  });
});

// ─── 17. Restart ────────────────────────────────────────────────────────────

describe('AC17 — a full restart rebuilds all state from storage', () => {
  it('returns identical data after restart', async () => {
    await setup();
    const leads = await importLeads(3);
    await staff.req('POST', `/api/leads/${leads[0].id}/calls`, { outcome: 'Interested', rating: 'Good', followUpDate: '2026-11-25' });
    await admin.req('POST', '/api/availability', { date: '2026-11-24', start: '15:00', end: '16:00', slotMinutes: 20, repeatWeekly: true });
    await admin.req('POST', '/api/finance/expenses', { date: '2026-11-20', item: 'Test item', amount: 500, paidBy: 'Company Fund', project: 'Zevia' });
    await owner.req('PUT', '/api/settings', { placesMonthlyCap: 750, assignmentWindowHours: 48 });

    const snapshot = async (o: Client, a: Client, s: Client) => ({
      leads: (await a.req('GET', '/api/leads')).body.leads,
      mine: (await s.req('GET', '/api/leads')).body.leads,
      finance: (await a.req('GET', '/api/finance')).body,
      goals: (await a.req('GET', '/api/goals')).body,
      settings: (await o.req('GET', '/api/settings')).body,
      dashboard: (await a.req('GET', '/api/dashboard/founder')).body,
      slots: (await s.req('GET', '/api/slots?from=2026-11-24&days=8')).body,
      notifications: (await s.req('GET', '/api/notifications')).body,
    });
    const before = await snapshot(owner, admin, staff);
    h = await h.restart();
    const reconnect = (c: Client) => Object.assign(new Client(h.url), { cookie: c.cookie, csrf: c.csrf });
    const after = await snapshot(reconnect(owner), reconnect(admin), reconnect(staff));
    expect(after).toEqual(before);
    expect(before.slots.slots.length).toBe(6); // 3 × 20-min slots, weekly → 2 weeks
  });
});
