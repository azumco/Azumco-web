// Local CLI password reset (server/auth/local-reset.ts), on the in-memory store.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Client, SUPER, ADMIN_EMAIL, startHarness, superAdmin, type Harness } from './harness.ts';
import { resetPasswordLocal, ResetRefused } from '../auth/local-reset.ts';
import { verifyPassword } from '../auth/passwords.ts';

const NEW_TEMP = 'cli-Temp-Passw0rd-123';
let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

describe('local password reset', () => {
  it('hashes, forces a change, clears lockout, ends every session and audits without password data', async () => {
    h = await startHarness();
    const owner = await superAdmin(h); // signed-in session #1
    const second = new Client(h.url);
    await second.login(SUPER.email, 'owner-New-Passw0rd!'); // session #2
    expect((await second.req('GET', '/api/auth/me')).status).toBe(200);

    // Lock the account with wrong passwords.
    const intruder = new Client(h.url);
    for (let i = 0; i < 8; i++) await intruder.login(SUPER.email, 'wrong-password-xx');
    const [locked] = await h.db.loadFresh(['Users']);
    const before = locked.rows.find((u) => u.email === SUPER.email)!;
    expect(Number(before.failedAttempts) > 0 || before.lockedUntil !== '').toBe(true);

    const result = await resetPasswordLocal(h.db, SUPER.email.toUpperCase(), NEW_TEMP, 'azumco.com');
    expect(result.sessionsEnded).toBeGreaterThanOrEqual(2);

    const [users, sessions, audit] = await h.db.loadFresh(['Users', 'Sessions', 'Audit']);
    const u = users.rows.find((r) => r.email === SUPER.email)!;
    // Hashing: bcrypt, not the plain value, and it verifies.
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(u.passwordHash).not.toContain(NEW_TEMP);
    expect(await verifyPassword(NEW_TEMP, u.passwordHash)).toBe(true);
    expect(u.mustChangePassword).toBe('TRUE');
    // Lockout cleared.
    expect(u.failedAttempts).toBe('0');
    expect(u.lockedUntil).toBe('');
    // Sessions: rows gone and the old cookies no longer work.
    expect(sessions.rows.filter((s) => s.userId === u.id)).toHaveLength(0);
    expect((await owner.req('GET', '/api/auth/me')).status).toBe(401);
    expect((await second.req('GET', '/api/auth/me')).status).toBe(401);
    // Audit: one entry, no password data anywhere in it.
    const entries = audit.rows.filter((a) => a.action === 'password reset via local CLI');
    expect(entries).toHaveLength(1);
    expect(entries[0].entityId).toBe(u.id);
    const text = JSON.stringify(entries[0]);
    expect(text).not.toContain(NEW_TEMP);
    expect(text).not.toContain(u.passwordHash);
    expect(text).not.toMatch(/\$2[aby]\$/);

    // The temporary password signs in and must be changed. (Restart first: the
    // per-IP sign-in limit is in the server's memory, separate from the account lockout.)
    h = await h.restart();
    const fresh = new Client(h.url);
    const login = await fresh.login(SUPER.email, NEW_TEMP);
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
  });

  it('refuses other domains, unknown emails, inactive accounts and short passwords, changing nothing', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const admin = (await owner.req('GET', '/api/users')).body.users.find((x: { email: string }) => x.email === ADMIN_EMAIL);
    await owner.req('PATCH', `/api/users/${admin.id}`, { active: false, expectedUpdatedAt: admin.updatedAt });
    const auditBefore = (await h.db.loadFresh(['Audit']))[0].rows.length;

    await expect(resetPasswordLocal(h.db, 'someone@gmail.com', NEW_TEMP, 'azumco.com')).rejects.toBeInstanceOf(ResetRefused);
    await expect(resetPasswordLocal(h.db, 'test.owner@azumco.com.evil.com', NEW_TEMP, 'azumco.com')).rejects.toBeInstanceOf(ResetRefused);
    await expect(resetPasswordLocal(h.db, 'nobody@azumco.com', NEW_TEMP, 'azumco.com')).rejects.toThrow('No account');
    await expect(resetPasswordLocal(h.db, ADMIN_EMAIL, NEW_TEMP, 'azumco.com')).rejects.toThrow('inactive');
    await expect(resetPasswordLocal(h.db, SUPER.email, 'short-11chr', 'azumco.com')).rejects.toThrow('12 characters');

    const audits = (await h.db.loadFresh(['Audit']))[0].rows;
    expect(audits.length).toBe(auditBefore);
  });

  it('is not reachable over HTTP: nothing in the app imports it', () => {
    const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const files = ['app.ts', 'index.ts', ...readdirSync(path.join(server, 'routes')).map((f) => path.join('routes', f))];
    for (const f of files) expect(readFileSync(path.join(server, f), 'utf8')).not.toContain('local-reset');
  });
});
