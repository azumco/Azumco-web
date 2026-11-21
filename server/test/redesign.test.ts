// Goals ownership, the free-slot planner, real seed data and the demo guard.

import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, Client, EMPLOYEE_EMAIL, FakeClock, memberClient, startHarness, superAdmin, testConfig, type Harness } from './harness.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { planSlots, expandRules, type AvailRule } from '../../shared/slots.ts';
import { assertDemoAllowed } from '../dev/demo.ts';
import { columnsOf } from '../sheets/schema.ts';

let h: Harness;
afterEach(async () => {
  await h?.close();
});

// ─── B. Only the owner changes a goal's status ──────────────────────────────

describe('goals: only the owner can change status', () => {
  async function setup() {
    h = await startHarness();
    const owner = await superAdmin(h); // "Owner"
    const admin = (await memberClient(h, owner, ADMIN_EMAIL)).client; // "Admin One"
    const staff = (await memberClient(h, owner, EMPLOYEE_EMAIL)).client; // "Staff One"
    const created = await owner.req('POST', '/api/goals', { goal: 'Sales', task: 'Owned by admin', owner: 'Admin One', support: ['Staff One', 'Owner'] });
    const id = created.body.goal.id as string;
    return { owner, admin, staff, id };
  }

  it('the owner marks Done and undoes it; everyone else gets 403', async () => {
    const { owner, admin, staff, id } = await setup();
    // Super admin (also support), another founder role-wise, and the employee in support: all refused.
    for (const c of [owner, staff]) {
      const r = await c.req('PATCH', `/api/goals/${id}`, { status: 'Done' });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('Only Admin One can change the status of this goal.');
    }
    expect((await admin.req('PATCH', `/api/goals/${id}`, { status: 'Done' })).status).toBe(200);
    expect((await admin.req('PATCH', `/api/goals/${id}`, { status: 'Not Started' })).status).toBe(200);
    expect((await owner.req('PATCH', `/api/goals/${id}`, { status: 'Done' })).status).toBe(403);

    // The list tells the UI who may tick the box.
    const list = (await owner.req('GET', '/api/goals')).body.goals;
    expect(list.find((g: { id: string }) => g.id === id).canChangeStatus).toBe(false);
    const mine = (await admin.req('GET', '/api/goals')).body.goals.find((g: { id: string }) => g.id === id);
    expect(mine.canChangeStatus).toBe(true);

    const audit = (await owner.req('GET', '/api/audit')).body.entries.filter((e: { action: string }) => e.action === 'goal.status');
    expect(audit).toHaveLength(2);
    const transitions = audit.map((e: { before: string; after: string }) => `${JSON.parse(e.before).status}→${JSON.parse(e.after).status}`).sort();
    expect(transitions).toEqual(['Done→Not Started', 'Not Started→Done']);
  });

  it('a different founder who is not the owner is refused too', async () => {
    const { owner, id } = await setup();
    // Make the super admin the owner of a different goal, and check another founder can't tick it.
    const other = await owner.req('POST', '/api/goals', { goal: 'Ops', task: 'Owned by owner', owner: 'Owner' });
    const admin = new Client(h.url);
    await admin.login(ADMIN_EMAIL, 'member-Passw0rd-1');
    expect((await admin.req('PATCH', `/api/goals/${other.body.goal.id}`, { status: 'Done' })).status).toBe(403);
    expect((await owner.req('PATCH', `/api/goals/${other.body.goal.id}`, { status: 'Done' })).status).toBe(200);
    expect(id).toBeTruthy();
  });

  it('founders can still edit details; changing the owner keeps the status', async () => {
    const { owner, admin, id } = await setup();
    await admin.req('PATCH', `/api/goals/${id}`, { status: 'In Progress' });
    const r = await owner.req('PATCH', `/api/goals/${id}`, { task: 'Renamed', deadline: '2026-12-01', owner: 'Owner', support: [] });
    expect(r.status).toBe(200);
    expect(r.body.goal).toMatchObject({ task: 'Renamed', deadline: '2026-12-01', owner: 'Owner', status: 'In Progress' });
    // Sending the unchanged status alongside an edit is fine.
    expect((await admin.req('PATCH', `/api/goals/${id}`, { task: 'x', status: 'In Progress' })).status).toBe(200);
  });
});

// ─── Add-slots planner ──────────────────────────────────────────────────────

describe('free-slot planner', () => {
  const now = Date.parse('2026-11-23T04:30:00Z'); // Mon 23 Nov, 10:00 IST
  const rule = (date: string, start: string, end: string, slotMinutes = 30, repeatWeekly = false): AvailRule => ({ founderId: 'f', date, start, end, slotMinutes, repeatWeekly, repeatUntil: '' });

  it('counts the grid, drops the past and overlaps, and rejects bad ranges', () => {
    expect(planSlots({ founderId: 'f', existing: [], dates: ['2026-11-26', '2026-11-27'], start: '18:00', end: '20:00', slotMinutes: 30, nowMs: now }).total).toBe(8);
    expect(planSlots({ founderId: 'f', existing: [], dates: ['2026-11-26'], start: '20:00', end: '18:00', slotMinutes: 30, nowMs: now }).error).toBe('"To" must be after "From".');
    expect(planSlots({ founderId: 'f', existing: [], dates: ['2026-11-20'], start: '18:00', end: '20:00', slotMinutes: 30, nowMs: now }).error).toBe('Those times are already in the past.');
    // Today: 10:00 already started → only later slots count.
    expect(planSlots({ founderId: 'f', existing: [], dates: ['2026-11-23'], start: '09:00', end: '11:00', slotMinutes: 30, nowMs: now }).total).toBe(1);
    // Overlap with an existing 18–19 rule: only 19:00 and 19:30 are new.
    const existing = [rule('2026-11-26', '18:00', '19:00')];
    expect(planSlots({ founderId: 'f', existing, dates: ['2026-11-26'], start: '18:00', end: '20:00', slotMinutes: 30, nowMs: now }).total).toBe(2);
    expect(planSlots({ founderId: 'f', existing, dates: ['2026-11-26'], start: '18:00', end: '19:00', slotMinutes: 30, nowMs: now }).error).toBe('You already have free slots at those times.');
    // A weekly rule from last week covers this week too.
    expect(planSlots({ founderId: 'f', existing: [rule('2026-11-19', '18:00', '20:00', 30, true)], dates: ['2026-11-26'], start: '18:00', end: '20:00', slotMinutes: 30, nowMs: now }).total).toBe(0);
  });

  it('expansion merges overlapping rules instead of duplicating', () => {
    const slots = expandRules([rule('2026-11-26', '18:00', '20:00'), rule('2026-11-26', '18:20', '19:20', 20)], '2026-11-26', 1, now);
    expect(slots.map((s) => s.start)).toEqual(['18:00', '18:30', '19:00', '19:30']);
  });

  it('the API creates exactly what the preview promised', async () => {
    h = await startHarness(new MemoryBackend(), testConfig(), { clock: new FakeClock(new Date(now)) });
    const owner = await superAdmin(h);
    const count = async () => (await owner.req('GET', '/api/slots?from=2026-11-23&days=7')).body.slots.length;
    const mine = async () => (await owner.req('GET', '/api/availability')).body.availability.map((a: Record<string, string>) => ({ founderId: a.founderId, date: a.date, start: a.start, end: a.end, slotMinutes: Number(a.slotMinutes), repeatWeekly: a.repeatWeekly === 'TRUE', repeatUntil: a.repeatUntil }));
    const me = (await owner.req('GET', '/api/auth/me')).body.user.id;

    for (const req of [
      { dates: ['2026-11-26', '2026-11-27'], start: '18:00', end: '20:00', slotMinutes: 30 as const },
      { dates: ['2026-11-26', '2026-11-28'], start: '17:00', end: '19:00', slotMinutes: 20 as const }, // overlaps Thu
    ]) {
      const preview = planSlots({ founderId: me, existing: await mine(), ...req, nowMs: now });
      const before = await count();
      const r = await owner.req('POST', '/api/availability/batch', { ...req, repeatWeekly: false });
      expect(r.status).toBe(201);
      expect(r.body.created).toBe(preview.total);
      expect((await count()) - before).toBe(preview.total);
    }
    expect((await owner.req('POST', '/api/availability/batch', { dates: ['2026-11-26'], start: '18:00', end: '20:00', slotMinutes: 30 })).status).toBe(400);
    expect((await owner.req('POST', '/api/availability/batch', { dates: ['2026-11-20'], start: '18:00', end: '20:00', slotMinutes: 30 })).body.error).toBe('Those times are already in the past.');
    expect((await owner.req('POST', '/api/availability/batch', { dates: ['2026-11-26'], start: '20:00', end: '19:00', slotMinutes: 30 })).body.error).toBe('"To" must be after "From".');
  });
});

// ─── C. Real seed data ──────────────────────────────────────────────────────

const REAL = testConfig({
  SUPERADMIN_EMAIL: 'zeeshan.khan@azumco.com',
  SUPERADMIN_NAME: 'Zeeshan Khan',
  TEAM_USERS: JSON.stringify([
    { name: 'Yameen Shaikh', email: 'yameen.shaikh@azumco.com', role: 'admin' },
    { name: 'Ayan Khan', email: 'ayan.khan@azumco.com', role: 'admin' },
    { name: 'Suzanne Khan', email: 'suzanne.khan@azumco.com', role: 'employee' },
  ]),
});

describe('real seed data', () => {
  it('is exactly the real data, with empty operational tabs and no duplicates after restart', async () => {
    h = await startHarness(new MemoryBackend(), REAL);
    const snapshot = async () => {
      const db = h.db;
      db.invalidate();
      const pick = (rows: Record<string, string>[], keys: string[]) => rows.map((r) => keys.map((k) => r[k]));
      return {
        users: pick(await db.all('Users'), ['name', 'email', 'role']).sort(),
        expenses: pick(await db.all('Expenses'), ['date', 'item', 'amount', 'paidBy', 'project', 'repaid']),
        projects: pick(await db.all('Projects'), ['name', 'dealTotal', 'received']),
        goals: pick(await db.all('Goals'), ['goal', 'task', 'owner', 'support', 'start', 'deadline', 'status', 'note']),
        items: pick(await db.all('MilestoneItems'), ['label', 'amount', 'amountWithoutGst']).map((r) => [r[0].split(' (')[0], r[1], r[2]]),
        milestone: pick(await db.all('Milestones'), ['name', 'gstIncluded']),
        settings: Object.fromEntries((await db.all('Settings')).map((s) => [s.key, s.value])),
        empty: await Promise.all((['Leads', 'Bookings', 'Availability', 'Contributions', 'CallLog', 'Expirations', 'PlacesClaims'] as const).map(async (t) => (await db.all(t)).length)),
      };
    };
    const first = await snapshot();
    expect(first.users).toEqual([
      ['Ayan Khan', 'ayan.khan@azumco.com', 'admin'],
      ['Suzanne Khan', 'suzanne.khan@azumco.com', 'employee'],
      ['Yameen Shaikh', 'yameen.shaikh@azumco.com', 'admin'],
      ['Zeeshan Khan', 'zeeshan.khan@azumco.com', 'super_admin'],
    ]);
    expect(first.expenses).toEqual([
      ['2026-08-17', 'Company SIM card', '150', 'Ayan Khan', 'General', 'FALSE'],
      ['2026-11-14', 'Domain purchase', '1295', 'Company Fund', 'Zyvia', 'FALSE'],
      ['2026-11-14', 'SIM recharge', '99', 'Company Fund', 'Zyvia', 'FALSE'],
    ]);
    expect(first.projects).toEqual([['Zyvia', '8000', '4000']]);
    expect(first.goals).toEqual([
      ['Zyvia Website', 'Build the website', 'Ayan Khan', '', '2026-11-16', '2026-11-30', 'Not Started', ''],
      ['Zyvia Website', '100% testing + rework', 'Ayan Khan', 'Yameen Shaikh; Zeeshan Khan', '', '2026-12-05', 'Not Started', ''],
      ['Gym Client', 'Close the deal with the gym owner', 'Yameen Shaikh', '', '', '2026-11-30', 'Not Started', ''],
      ['Company Setup', 'Talk to CA/CS about registration steps and cost', 'Yameen Shaikh', '', '', '2026-11-30', 'Done', 'Quote received 18 Nov'],
      ['Azumco', 'Fix the Azumco website', 'Zeeshan Khan', '', '', '2026-11-30', 'Not Started', ''],
      ['Azumco', 'Create domain emails', 'Zeeshan Khan', '', '', '2026-11-30', 'Done', ''],
      ['Gym Software', 'Build gym software after the deal is confirmed', 'Zeeshan Khan', '', '', '', 'On Hold', 'Waiting for the gym deal'],
    ]);
    expect(first.items).toEqual([
      ['CS professional fee', '8500', '7000'],
      ['Government fee: name application', '1000', ''],
      ['Government fee: incorporation', '7693', ''],
      ['Digital signature certificates for directors', '0', ''],
    ]);
    expect(first.milestone).toEqual([['Register Azumco as a Private Limited Company', 'TRUE']]);
    expect(first.settings).toMatchObject({ placesMonthlyCap: '1000', assignmentWindowHours: '24', contactedRule: 'any_attempt', commissionQualifiedFee: '200', commissionOneTimePct: '10', commissionMonthlyPct: '10', placesPaused: 'FALSE' });
    expect(first.empty).toEqual([0, 0, 0, 0, 0, 0, 0]);

    h = await h.restart();
    expect(await snapshot()).toEqual(first);
    expect(JSON.stringify(await h.backend.readTabs(['Projects', 'Expenses', 'Goals', 'Milestones', 'MilestoneItems']))).not.toContain('Zevia');
  });

  it('renames existing "Zevia" data to "Zyvia" once', async () => {
    const backend = new MemoryBackend();
    // An older deployment: seeded data that still says Zevia, migration not yet run.
    await backend.addTabs(['Projects', 'Expenses', 'Meta']);
    await backend.writeRanges([
      { range: "'Projects'!A1", values: [columnsOf('Projects'), ['p1', 't', 't', 'system', 'Zevia', '8000', '4000', 'Active']] },
      { range: "'Expenses'!A1", values: [columnsOf('Expenses'), ['e1', 't', 't', 'system', '2026-11-14', 'Domain purchase', '1295', 'Company Fund', 'Zevia', 'FALSE']] },
      { range: "'Meta'!A1", values: [columnsOf('Meta'), ['m1', 't', 't', 'system', 'seed:finance:v1', 't']] },
    ]);
    h = await startHarness(backend, REAL);
    const text = JSON.stringify(await backend.readTabs(['Projects', 'Expenses']));
    expect(text).not.toContain('Zevia');
    expect(text.match(/Zyvia/g)).toHaveLength(2);
  });
});

describe('demo data guard', () => {
  it('refuses without the flag, with a spreadsheet id, or in production', () => {
    expect(() => assertDemoAllowed({})).toThrow(/DEMO_DATA=true/);
    expect(() => assertDemoAllowed({ DEMO_DATA: 'true', GOOGLE_SHEETS_SPREADSHEET_ID: 'abc' })).toThrow(/GOOGLE_SHEETS_SPREADSHEET_ID is configured/);
    expect(() => assertDemoAllowed({ DEMO_DATA: 'true', NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => assertDemoAllowed({ DEMO_DATA: 'true' })).not.toThrow();
  });
});
