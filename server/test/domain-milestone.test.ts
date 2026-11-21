// Domain-restricted accounts and the registration milestone.
// Fixture passwords below are fictitious test values.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_EMAIL, Client, EMPLOYEE_EMAIL, SUPER, memberClient, startHarness, superAdmin, testConfig, type Harness } from './harness.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { loadConfig } from '../config.ts';
import { LOGIN_FAILED } from '../routes/auth.ts';
import { emailInDomain } from '../../shared/email.ts';

let h: Harness;
afterEach(async () => {
  vi.restoreAllMocks();
  await h?.close();
});

// ─── A. Domain rules ─────────────────────────────────────────────────────────

describe('emailInDomain', () => {
  it.each([
    ['someone@azumco.com', true],
    ['  Someone@AZUMCO.com  ', true],
    ['someone@gmail.com', false],
    ['someone@azumco.com.evil.com', false],
    ['someone@azumco.co', false],
    ['someone@mail.azumco.com', false],
    ['someone@evil-azumco.com', false],
    ['azumco.com@evil.com', false],
    ['someone@evil.com@azumco.com', true], // last "@" decides; such an address cannot exist in TEAM_USERS (validated as an email)
    ['@azumco.com', false],
    ['someone@', false],
    ['', false],
  ])('%s → %s', (email, ok) => {
    expect(emailInDomain(email, 'azumco.com')).toBe(ok);
  });
});

describe('startup validation', () => {
  const base = {
    NODE_ENV: 'test', SHEETS_BACKEND: 'memory', SESSION_SECRET: 'x'.repeat(40), SUPERADMIN_EMAIL: 'boss@azumco.com',
  };
  it('rejects a SUPERADMIN_EMAIL outside the domain, naming the variable but not the value', () => {
    let msg = '';
    try {
      loadConfig({ ...base, SUPERADMIN_EMAIL: 'boss.secret@gmail.com' });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('SUPERADMIN_EMAIL');
    expect(msg).not.toContain('boss.secret');
  });
  it('rejects TEAM_USERS entries outside the domain, by position only', () => {
    let msg = '';
    try {
      loadConfig({ ...base, TEAM_USERS: JSON.stringify([{ name: 'A', email: 'a@azumco.com', role: 'admin' }, { name: 'B', email: 'hidden.person@azumco.com.evil.com', role: 'admin' }]) });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/TEAM_USERS: entry 2 must use an address on azumco\.com/);
    expect(msg).not.toContain('hidden.person');
  });
  it('honours a configured domain', () => {
    expect(() => loadConfig({ ...base, ALLOWED_EMAIL_DOMAIN: 'example.org' })).toThrow(/SUPERADMIN_EMAIL/);
    expect(loadConfig({ ...base, ALLOWED_EMAIL_DOMAIN: 'AZUMCO.com' }).ALLOWED_EMAIL_DOMAIN).toBe('azumco.com');
  });
});

describe('AC1 — sign-in is limited to the domain', () => {
  it('rejects gmail and a look-alike exactly like a wrong password; accepts case/whitespace variants', async () => {
    h = await startHarness();
    const owner = await superAdmin(h, 'owner-New-Passw0rd!');

    // Put an out-of-domain account with a real password into storage, to prove
    // the domain check — not a missing account — is what refuses it.
    const hash = (await h.db.all('Users')).find((u) => u.email === SUPER.email)!.passwordHash;
    for (const email of ['outsider@gmail.com', 'outsider@azumco.com.evil.com']) {
      await h.db.insert('Users', { email, name: 'Outsider', role: 'admin', active: 'TRUE', passwordHash: hash, mustChangePassword: 'FALSE', failedAttempts: '0', sessionVersion: '0' }, 't');
    }

    const c = new Client(h.url);
    const wrong = await c.login(SUPER.email, 'definitely-wrong-1');
    const gmail = await c.login('outsider@gmail.com', 'owner-New-Passw0rd!');
    const lookalike = await c.login('outsider@azumco.com.evil.com', 'owner-New-Passw0rd!');
    for (const r of [gmail, lookalike]) {
      expect(r.status).toBe(wrong.status);
      expect(r.body).toEqual(wrong.body);
      expect(r.body.error).toBe(LOGIN_FAILED);
      expect(r.headers.get('set-cookie')).toBeNull();
    }

    const variant = await new Client(h.url).login(`  ${SUPER.email.toUpperCase()}  `, 'owner-New-Passw0rd!');
    expect(variant.status).toBe(200);
    expect(owner.cookie).toBeTruthy();
  });

  it('refuses existing sessions of an account whose email is outside the domain, and bootstrap removes them', async () => {
    h = await startHarness();
    const { client: staff, id } = await memberClient(h, await superAdmin(h), EMPLOYEE_EMAIL);
    expect((await staff.req('GET', '/api/auth/me')).status).toBe(200);
    await h.db.update('Users', id, { email: 'moved@gmail.com' }, 't');
    expect((await staff.req('GET', '/api/auth/me')).status).toBe(401);
    h = await h.restart();
    expect((await h.db.all('Sessions')).filter((s) => s.userId === id)).toHaveLength(0);
  });
});

describe('AC2/AC3 — no self-registration; no off-domain account changes', () => {
  it('has no registration route; only the super admin creates users, on the domain only', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const admin = (await memberClient(h, owner, ADMIN_EMAIL)).client;
    const anon = new Client(h.url);
    for (const path of ['/api/auth/register', '/api/auth/signup', '/api/register', '/api/signup']) {
      expect((await anon.req('POST', path, { email: 'new@azumco.com', password: 'whatever-123' })).status).toBeGreaterThanOrEqual(401);
      expect((await owner.req('POST', path, { email: 'new@azumco.com', name: 'X', role: 'admin' })).status).toBe(404);
    }
    const body = { name: 'New Person', email: 'new.person@azumco.com', role: 'employee' };
    expect((await anon.req('POST', '/api/users', body)).status).toBe(401);
    expect((await admin.req('POST', '/api/users', body)).status).toBe(403);
    const before = JSON.stringify(await h.backend.readTabs(['Users']));
    for (const email of ['new@gmail.com', 'new@azumco.com.evil.com', 'new@mail.azumco.com']) {
      expect((await owner.req('POST', '/api/users', { ...body, email })).status).toBe(400);
    }
    expect(JSON.stringify(await h.backend.readTabs(['Users']))).toBe(before);
    expect((await owner.req('POST', '/api/users', body)).status).toBe(201);
    expect((await owner.req('POST', '/api/users', body)).status).toBe(409);
  });

  it('rejects an email edit (any domain) and writes nothing', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const staff = (await owner.req('GET', '/api/users')).body.users.find((u: { email: string }) => u.email === EMPLOYEE_EMAIL);
    const before = JSON.stringify(await h.backend.readTabs(['Users']));
    for (const email of ['someone@gmail.com', 'someone@azumco.com']) {
      const r = await owner.req('PATCH', `/api/users/${staff.id}`, { email });
      expect(r.status).toBe(400);
      const r2 = await owner.req('PATCH', `/api/users/${staff.id}`, { email, role: 'admin' });
      expect(r2.status).toBe(400);
    }
    expect(JSON.stringify(await h.backend.readTabs(['Users']))).toBe(before);
  });

  it('refuses role changes and passwords for an account outside the domain', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const row = await h.db.insert('Users', { email: 'x@gmail.com', name: 'X', role: 'employee', active: 'TRUE', passwordHash: '', sessionVersion: '0' }, 't');
    const before = JSON.stringify(await h.backend.readTabs(['Users']));
    expect((await owner.req('PATCH', `/api/users/${row.id}`, { role: 'admin' })).status).toBe(400);
    expect((await owner.req('POST', `/api/users/${row.id}/temp-password`)).status).toBe(400);
    expect(JSON.stringify(await h.backend.readTabs(['Users']))).toBe(before);
  });

  it('lets the super admin type a temporary password or generate one', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const staff = (await owner.req('GET', '/api/users')).body.users.find((u: { email: string }) => u.email === EMPLOYEE_EMAIL);
    expect((await owner.req('POST', `/api/users/${staff.id}/temp-password`, { tempPassword: 'short' })).status).toBe(400);
    const typed = await owner.req('POST', `/api/users/${staff.id}/temp-password`, { tempPassword: 'typed-Temp-1234' });
    expect(typed.body.tempPassword).toBe('typed-Temp-1234');
    const login = await new Client(h.url).login(EMPLOYEE_EMAIL, 'typed-Temp-1234');
    expect(login.body.user.mustChangePassword).toBe(true);
    const generated = await owner.req('POST', `/api/users/${staff.id}/temp-password`, {});
    expect(generated.body.tempPassword).toMatch(/^[A-Za-z2-9]{14}$/);
  });
});

describe('AC4 — the real team accounts', () => {
  it('creates the three accounts with the right roles; seed names match; no password stored or logged', async () => {
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void logged.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void logged.push(a.join(' ')));
    const config = testConfig({
      SUPERADMIN_EMAIL: 'zeeshan.khan@azumco.com',
      SUPERADMIN_NAME: 'Zeeshan Khan',
      TEAM_USERS: JSON.stringify([
        { name: 'Yameen Shaikh', email: 'yameen.shaikh@azumco.com', role: 'admin' },
        { name: 'Ayan Khan', email: 'ayan.khan@azumco.com', role: 'admin' },
        { name: 'Suzanne Khan', email: 'suzanne.khan@azumco.com', role: 'employee' },
      ]),
    });
    h = await startHarness(new MemoryBackend(), config);
    const users = await h.db.all('Users');
    expect(users.map((u) => [u.email, u.name, u.role]).sort()).toEqual([
      ['ayan.khan@azumco.com', 'Ayan Khan', 'admin'],
      ['suzanne.khan@azumco.com', 'Suzanne Khan', 'employee'],
      ['yameen.shaikh@azumco.com', 'Yameen Shaikh', 'admin'],
      ['zeeshan.khan@azumco.com', 'Zeeshan Khan', 'super_admin'],
    ]);
    // Only the super admin has a password at bootstrap (from the env).
    expect(users.filter((u) => u.passwordHash).map((u) => u.email)).toEqual(['zeeshan.khan@azumco.com']);

    // Seeds resolve first names to these people.
    const goals = await h.db.all('Goals');
    expect(new Set(goals.map((g) => g.owner))).toEqual(new Set(['Ayan Khan', 'Yameen Shaikh', 'Zeeshan Khan']));
    expect((await h.db.all('Expenses')).find((e) => e.item === 'Company SIM card')!.paidBy).toBe('Ayan Khan');

    // Run the full password lifecycle and make sure no plaintext lands anywhere.
    const owner = new Client(h.url);
    await owner.login('zeeshan.khan@azumco.com', SUPER.password);
    await owner.req('POST', '/api/auth/change-password', { currentPassword: SUPER.password, newPassword: 'owner-Real-Passw0rd' });
    const suzanne = users.find((u) => u.email === 'suzanne.khan@azumco.com')!;
    const temp = (await owner.req('POST', `/api/users/${suzanne.id}/temp-password`)).body.tempPassword as string;
    const s = new Client(h.url);
    await s.login('suzanne.khan@azumco.com', temp);
    await s.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: 'suzanne-Own-Passw0rd' });

    const tabs = ['Users', 'Sessions', 'Settings', 'Audit', 'Meta', 'Leads', 'CallLog', 'Notifications', 'Expenses', 'Goals', 'Milestones', 'MilestoneItems', 'Contributions'] as const;
    const everything = JSON.stringify(await h.backend.readTabs([...tabs])) + logged.join('\n');
    for (const pw of [SUPER.password, 'owner-Real-Passw0rd', temp, 'suzanne-Own-Passw0rd']) expect(everything).not.toContain(pw);
  });
});

// ─── B. Milestone ────────────────────────────────────────────────────────────

async function milestoneSetup() {
  h = await startHarness();
  const owner = await superAdmin(h);
  const admin = (await memberClient(h, owner, ADMIN_EMAIL)).client;
  const staff = (await memberClient(h, owner, EMPLOYEE_EMAIL)).client;
  const get = async () => (await admin.req('GET', '/api/milestones')).body;
  const m = (await get()).milestones[0];
  return { owner, admin, staff, get, m };
}

const finance = async (c: Client) => (await c.req('GET', '/api/finance')).body.summary;

describe('AC5 — employees cannot reach the milestone', () => {
  it('returns 403 on every milestone and contribution route', async () => {
    const { staff, m } = await milestoneSetup();
    const item = m.items[0].id;
    const routes: [string, string, unknown?][] = [
      ['GET', '/api/milestones'],
      ['PATCH', `/api/milestones/${m.id}`, { gstIncluded: false }],
      ['POST', `/api/milestones/${m.id}/items`, { label: 'x', amount: 1 }],
      ['PATCH', `/api/milestone-items/${item}`, { amount: 1 }],
      ['DELETE', `/api/milestone-items/${item}`],
      ['POST', `/api/milestone-items/${item}/pay`, { paidBy: 'Company Fund' }],
      ['POST', `/api/milestone-items/${item}/unpay`],
      ['GET', '/api/contributions'],
      ['POST', '/api/contributions', { date: '2026-11-21', founder: 'Owner', amount: 1 }],
      ['DELETE', '/api/contributions/any'],
    ];
    for (const [method, path, body] of routes) expect([path, (await staff.req(method, path, body)).status]).toEqual([path, 403]);
    // …and their own routes still work (the guard is per route, not router-wide).
    expect((await staff.req('GET', '/api/goals')).status).toBe(200);
    expect((await staff.req('GET', '/api/dashboard/me')).status).toBe(200);
  });
});

describe('AC6 — seed numbers', () => {
  it('matches the expected figures', async () => {
    const { m, admin } = await milestoneSetup();
    expect(m.name).toBe('Register Azumco as a Private Limited Company');
    expect(m.items.map((i: { effectiveAmount: number }) => i.effectiveAmount)).toEqual([8500, 1000, 7693, 0]);
    expect(m.numbers).toMatchObject({
      target: 17193,
      fundsAvailable: 2456,
      stillNeeded: 14737,
      expectedAfterPending: 10737,
      sharePerFounder: 4913,
      sharePerFounderAfterPending: 3579,
      fullyFunded: false,
    });
    expect((await admin.req('GET', '/api/dashboard/founder')).body.milestone).toMatchObject({ target: 17193, stillNeeded: 14737 });
  });
});

describe('AC7 — GST toggle', () => {
  it('only the super admin can toggle; off gives ₹15,693', async () => {
    const { owner, admin, get, m } = await milestoneSetup();
    expect((await admin.req('PATCH', `/api/milestones/${m.id}`, { gstIncluded: false })).status).toBe(403);
    expect((await owner.req('PATCH', `/api/milestones/${m.id}`, { gstIncluded: false, expectedUpdatedAt: m.updatedAt })).status).toBe(200);
    const after = (await get()).milestones[0];
    expect(after.numbers.target).toBe(15693);
    expect(after.items[0].effectiveAmount).toBe(7000);
    const entry = (await owner.req('GET', '/api/audit')).body.entries.find((e: { action: string }) => e.action === 'milestone.update');
    expect(JSON.parse(entry.before).gstIncluded).toBe('TRUE');
    expect(JSON.parse(entry.after).gstIncluded).toBe('FALSE');
  });
});

describe('AC8 — marking items paid keeps finance consistent', () => {
  it('Company Fund, then a founder, then reversal restores everything', async () => {
    const { admin, owner, get, m } = await milestoneSetup();
    const base = await finance(admin);
    const baseNeeded = m.numbers.stillNeeded;
    const [cs, nameFee, incorporation, dsc] = m.items.map((i: { id: string }) => i.id);

    // Company Fund pays the name application.
    expect((await admin.req('POST', `/api/milestone-items/${nameFee}/pay`, { paidBy: 'Company Fund' })).status).toBe(200);
    let f = await finance(admin);
    expect(f).toMatchObject({ spentByCompany: base.spentByCompany + 1000, cashInCompany: base.cashInCompany - 1000, cashAfterPayingMembers: base.cashAfterPayingMembers - 1000, owedToMembers: base.owedToMembers });
    let n = (await get()).milestones[0].numbers;
    expect(n).toMatchObject({ paid: 1000, stillNeeded: baseNeeded, fundsAvailable: 1456 });

    // A founder pays incorporation from their own pocket.
    expect((await admin.req('POST', `/api/milestone-items/${incorporation}/pay`, { paidBy: 'Admin One' })).status).toBe(200);
    f = await finance(admin);
    expect(f).toMatchObject({ spentByCompany: base.spentByCompany + 1000, owedToMembers: base.owedToMembers + 7693, cashAfterPayingMembers: base.cashAfterPayingMembers - 1000 - 7693 });
    n = (await get()).milestones[0].numbers;
    expect(n.stillNeeded).toBe(baseNeeded); // no double counting
    expect(n.paid).toBe(8693);

    const regExpenses = (await admin.req('GET', '/api/finance')).body.expenses.filter((e: { project: string }) => e.project === 'Company registration');
    expect(regExpenses.map((e: { amount: number; paidBy: string }) => [e.amount, e.paidBy]).sort()).toEqual([[1000, 'Company Fund'], [7693, 'Admin One']]);

    // Guards.
    expect((await admin.req('POST', `/api/milestone-items/${nameFee}/pay`, { paidBy: 'Company Fund' })).status).toBe(409);
    expect((await admin.req('POST', `/api/milestone-items/${dsc}/pay`, { paidBy: 'Company Fund' })).status).toBe(400); // ₹0 placeholder
    expect((await admin.req('POST', `/api/milestone-items/${cs}/pay`, { paidBy: 'Not A Founder' })).status).toBe(400);
    expect((await admin.req('PATCH', `/api/milestone-items/${cs}`, { amount: 9000 })).status).toBe(403);

    // Reverse both.
    await admin.req('POST', `/api/milestone-items/${nameFee}/unpay`);
    await admin.req('POST', `/api/milestone-items/${incorporation}/unpay`);
    expect(await finance(admin)).toEqual(base);
    expect((await get()).milestones[0].numbers).toEqual(m.numbers);
    const actions = (await owner.req('GET', '/api/audit')).body.entries.map((e: { action: string }) => e.action);
    expect(actions.filter((a: string) => a === 'milestone.item_paid')).toHaveLength(2);
    expect(actions.filter((a: string) => a === 'milestone.item_unpaid')).toHaveLength(2);
  });
});

describe('AC9 — founder contributions', () => {
  it('increase funds; with none, the summary is unchanged', async () => {
    const { admin, owner, get } = await milestoneSetup();
    expect(await finance(admin)).toMatchObject({ received: 4000, contributions: 0, spentByCompany: 1394, cashInCompany: 2606, owedToMembers: 150, cashAfterPayingMembers: 2456 });

    expect((await admin.req('POST', '/api/contributions', { date: '2026-11-21', founder: 'Admin One', amount: 5000, note: 'Registration' })).status).toBe(200);
    expect(await finance(admin)).toMatchObject({ contributions: 5000, cashInCompany: 7606, cashAfterPayingMembers: 7456 });
    const n = (await get()).milestones[0].numbers;
    expect(n).toMatchObject({ fundsAvailable: 7456, stillNeeded: 9737, sharePerFounder: 3246 });

    // Enough money → fully funded.
    await admin.req('POST', '/api/contributions', { date: '2026-11-21', founder: 'Owner', amount: 20000 });
    expect((await get()).milestones[0].numbers).toMatchObject({ stillNeeded: 0, fullyFunded: true, percent: 100 });

    const entry = (await owner.req('GET', '/api/audit')).body.entries.find((e: { action: string }) => e.action === 'contribution.add');
    expect(JSON.parse(entry.after)).toMatchObject({ founder: expect.any(String), amount: expect.any(String) });
  });
});
