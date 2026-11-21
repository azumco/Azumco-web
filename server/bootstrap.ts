// First-run setup: create tabs/headers, seed accounts and default settings.
// Safe to run on every start — each step checks before it writes.

import type { Config } from './config.ts';
import type { Db } from './sheets/db.ts';
import { boolCell } from './sheets/db.ts';
import { hashPassword } from './auth/passwords.ts';
import { log } from './lib/log.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { seed } from './seed.ts';
import { emailInDomain } from '../shared/email.ts';
import { profileDefaults, reconcileProfiles } from './users/profile.ts';

export async function bootstrap(config: Config, db: Db): Promise<void> {
  await db.ensureSchema();

  const users = await db.all('Users');
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  // ── super_admin ────────────────────────────────────────────────────────
  if (!users.some((u) => u.role === 'super_admin')) {
    const initial = config.SUPERADMIN_INITIAL_PASSWORD;
    await db.insert(
      'Users',
      {
        email: config.SUPERADMIN_EMAIL,
        name: config.SUPERADMIN_NAME,
        role: 'super_admin',
        active: boolCell(true),
        passwordHash: initial ? await hashPassword(initial) : '',
        mustChangePassword: boolCell(true),
        failedAttempts: '0',
        sessionVersion: '0',
        ...profileDefaults('super_admin', await db.all('Users')),
      },
      'system',
    );
    log.info('bootstrap: super_admin created', { hasInitialPassword: Boolean(initial) });
    if (!initial) log.warn('bootstrap: SUPERADMIN_INITIAL_PASSWORD not set; super_admin cannot sign in yet');
  } else if (config.SUPERADMIN_INITIAL_PASSWORD) {
    // Not an error, but worth removing: it has no effect once the account exists.
    log.warn('bootstrap: SUPERADMIN_INITIAL_PASSWORD is still set but no longer used; remove it from the environment');
  }

  // ── team members: created once, no usable password ─────────────────────
  for (const member of config.teamUsers) {
    if (byEmail.has(member.email)) continue;
    await db.insert(
      'Users',
      {
        email: member.email,
        name: member.name,
        role: member.role,
        active: boolCell(true),
        passwordHash: '',
        mustChangePassword: boolCell(true),
        failedAttempts: '0',
        sessionVersion: '0',
        ...profileDefaults(member.role, await db.all('Users')),
      },
      'system',
    );
    log.info('bootstrap: team member created', { role: member.role });
  }

  // Profile fields for rows created before they existed (idempotent).
  await reconcileProfiles(db);

  // ── settings defaults ──────────────────────────────────────────────────
  const settings = new Set((await db.all('Settings')).map((s) => s.key));
  const missing = Object.entries(DEFAULT_SETTINGS).filter(([key]) => !settings.has(key));
  if (missing.length) {
    await db.exclusive(() => db.insertManyUnqueued('Settings', missing.map(([key, value]) => ({ key, value })), 'system'));
  }

  // Any session belonging to an account outside the allowed domain is removed
  // (they are also refused on every request). Logged by count only.
  const outsiders = new Set((await db.all('Users')).filter((u) => !emailInDomain(u.email, config.ALLOWED_EMAIL_DOMAIN)).map((u) => u.id));
  if (outsiders.size) {
    const stale = (await db.all('Sessions')).filter((s) => outsiders.has(s.userId));
    for (const s of stale) await db.remove('Sessions', s.id, 'system').catch(() => undefined);
    log.warn('bootstrap: accounts outside the allowed domain cannot sign in', { accounts: outsiders.size, sessionsRemoved: stale.length });
  }

  await seed(db);
}
