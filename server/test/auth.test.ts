import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, Client, EMPLOYEE_EMAIL, SUPER, memberClient, startHarness, superAdmin, type Harness } from './harness.ts';
import { LOGIN_FAILED, MAX_FAILED_ATTEMPTS } from '../routes/auth.ts';

let h: Harness;
afterEach(async () => {
  await h?.close();
});

describe('bootstrap', () => {
  it('seeds the super_admin with a forced password change and team members with no password', async () => {
    h = await startHarness();
    const users = await h.db.all('Users');
    expect(users.map((u) => [u.email, u.role, Boolean(u.passwordHash), u.mustChangePassword]).sort()).toEqual(
      [
        [ADMIN_EMAIL, 'admin', false, 'TRUE'],
        [SUPER.email, 'super_admin', true, 'TRUE'],
        [EMPLOYEE_EMAIL, 'employee', false, 'TRUE'],
      ].sort(),
    );
  });

  it('is idempotent across restarts and never re-applies the initial password', async () => {
    h = await startHarness();
    await superAdmin(h, 'changed-Passw0rd!');
    h = await h.restart();
    expect((await h.db.all('Users')).length).toBe(3);
    expect((await h.db.all('Settings')).length).toBe(5);
    const c = new Client(h.url);
    expect((await c.login(SUPER.email, SUPER.password)).status).toBe(401);
    expect((await c.login(SUPER.email, 'changed-Passw0rd!')).status).toBe(200);
  });
});

describe('login', () => {
  it('sets an httpOnly, SameSite=Strict session cookie scoped to /api', async () => {
    h = await startHarness();
    const res = await new Client(h.url).login(SUPER.email, SUPER.password);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api/i);
    expect(res.body.user).toMatchObject({ role: 'super_admin', mustChangePassword: true });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('returns the identical message for unknown email, wrong password and passwordless accounts', async () => {
    h = await startHarness();
    const c = new Client(h.url);
    const unknown = await c.login('nobody@example.test', 'whatever-123');
    const wrong = await c.login(SUPER.email, 'wrong-password-1');
    const noPassword = await c.login(EMPLOYEE_EMAIL, '');
    for (const r of [unknown, wrong, noPassword]) {
      expect(r.status).toBe(401);
      expect(r.body.error).toBe(LOGIN_FAILED);
    }
  });

  it('locks the account after repeated failures, even for the right password, with the same message', async () => {
    h = await startHarness();
    const c = new Client(h.url);
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await c.login(SUPER.email, `wrong-${i}-password`);
    const res = await c.login(SUPER.email, SUPER.password);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe(LOGIN_FAILED);
    const row = (await h.db.all('Users')).find((u) => u.email === SUPER.email)!;
    expect(Date.parse(row.lockedUntil)).toBeGreaterThan(Date.now());
  });

  it('rate-limits sign-in attempts per IP', async () => {
    h = await startHarness();
    const c = new Client(h.url);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await c.login(`x${i}@example.test`, 'nope-nope-1')).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});

describe('request guards', () => {
  it('rejects a mutating request without the custom header (cross-site form post)', async () => {
    h = await startHarness();
    const res = await fetch(`${h.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SUPER.email, password: SUPER.password }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a foreign Origin', async () => {
    h = await startHarness();
    const res = await new Client(h.url).req('POST', '/api/auth/login', { email: SUPER.email, password: SUPER.password }, {
      Origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
  });

  it('requires the per-session CSRF token on state-changing requests', async () => {
    h = await startHarness();
    const c = await superAdmin(h);
    const users = (await c.req('GET', '/api/users')).body.users;
    const staff = users.find((u: { email: string }) => u.email === EMPLOYEE_EMAIL);
    c.csrf = 'forged';
    expect((await c.req('PATCH', `/api/users/${staff.id}`, { active: false })).status).toBe(403);
  });

  it('blocks everything except password change until the forced change is done', async () => {
    h = await startHarness();
    const c = new Client(h.url);
    await c.login(SUPER.email, SUPER.password);
    const blocked = await c.req('GET', '/api/users');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await c.req('GET', '/api/auth/me')).status).toBe(200);
  });

  it('answers 401 without a session and sends noindex on every API response', async () => {
    h = await startHarness();
    const res = await new Client(h.url).req('GET', '/api/users');
    expect(res.status).toBe(401);
    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/);
  });

  it('health answers without a session', async () => {
    h = await startHarness();
    const res = await fetch(`${h.url}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('user management', () => {
  it('issues a one-time temp password that must be changed at first sign-in', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const users = (await owner.req('GET', '/api/users')).body.users;
    const staff = users.find((u: { email: string }) => u.email === EMPLOYEE_EMAIL);
    expect(staff.hasPassword).toBe(false);

    const { body } = await owner.req('POST', `/api/users/${staff.id}/temp-password`);
    expect(body.tempPassword).toMatch(/^[A-Za-z2-9]{14}$/);
    // Never stored in plain text.
    expect(JSON.stringify(await h.db.all('Users'))).not.toContain(body.tempPassword);

    const c = new Client(h.url);
    const login = await c.login(EMPLOYEE_EMAIL, body.tempPassword);
    expect(login.body.user.mustChangePassword).toBe(true);
    const changed = await c.req('POST', '/api/auth/change-password', {
      currentPassword: body.tempPassword,
      newPassword: 'staff-Own-Passw0rd',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
  });

  it('enforces super_admin on every user route, at the API', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const { client: admin } = await memberClient(h, owner, ADMIN_EMAIL);
    const { client: staff, id: staffId } = await memberClient(h, owner, EMPLOYEE_EMAIL);
    for (const c of [admin, staff]) {
      expect((await c.req('GET', '/api/users')).status).toBe(403);
      expect((await c.req('POST', `/api/users/${staffId}/temp-password`)).status).toBe(403);
      expect((await c.req('PATCH', `/api/users/${staffId}`, { role: 'admin' })).status).toBe(403);
    }
  });

  it('deactivation signs the user out immediately and blocks sign-in', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const { client: staff, id } = await memberClient(h, owner, EMPLOYEE_EMAIL, 'staff-Passw0rd-xyz');
    expect((await staff.req('GET', '/api/auth/me')).status).toBe(200);

    await owner.req('PATCH', `/api/users/${id}`, { active: false });
    expect((await staff.req('GET', '/api/auth/me')).status).toBe(401);
    expect((await new Client(h.url).login(EMPLOYEE_EMAIL, 'staff-Passw0rd-xyz')).body.error).toBe(LOGIN_FAILED);
  });

  it('role changes apply on the next request and are audited with before/after', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const { client: staff, id } = await memberClient(h, owner, EMPLOYEE_EMAIL);
    await owner.req('PATCH', `/api/users/${id}`, { role: 'admin' });
    expect((await staff.req('GET', '/api/auth/me')).body.user.role).toBe('admin');

    const entry = (await h.db.all('Audit')).find((a) => a.action === 'users.update')!;
    expect(JSON.parse(entry.before)).toMatchObject({ role: 'employee' });
    expect(JSON.parse(entry.after)).toMatchObject({ role: 'admin' });
  });

  it('cannot change the super_admin account or promote anyone to super_admin', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const users = (await owner.req('GET', '/api/users')).body.users;
    const me = users.find((u: { role: string }) => u.role === 'super_admin');
    const staff = users.find((u: { email: string }) => u.email === EMPLOYEE_EMAIL);
    expect((await owner.req('PATCH', `/api/users/${me.id}`, { active: false })).status).toBe(400);
    expect((await owner.req('PATCH', `/api/users/${staff.id}`, { role: 'super_admin' })).status).toBe(400);
  });

  it('sessions survive a restart (they live in storage, not memory)', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const cookie = owner.cookie;
    h = await h.restart();
    const again = new Client(h.url);
    again.cookie = cookie;
    expect((await again.req('GET', '/api/auth/me')).status).toBe(200);
  });

  it('logs sign-ins without leaking secrets into the audit log', async () => {
    h = await startHarness();
    await superAdmin(h);
    const audit = JSON.stringify(await h.db.all('Audit'));
    expect(audit).toContain('auth.login');
    expect(audit).toContain('auth.password_changed');
    expect(audit).not.toContain(SUPER.password);
    expect(audit).not.toMatch(/\$2[aby]\$/); // no bcrypt hashes
  });
});
