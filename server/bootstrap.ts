// First-run setup: create tabs/headers, seed accounts and default settings.
// Safe to run on every start — each step checks before it writes.

import type { Config } from './config.ts';
import type { Db } from './sheets/db.ts';
import { boolCell } from './sheets/db.ts';
import { hashPassword } from './auth/passwords.ts';
import { log } from './lib/log.ts';

/** Defaults written once if the key is absent. Later phases read these. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  placesMonthlyCap: '1000',
  placesPaused: 'FALSE',
  commissionQualifiedFee: '200',
  commissionOneTimePct: '10',
  commissionMonthlyPct: '10',
};

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
      },
      'system',
    );
    log.info('bootstrap: team member created', { role: member.role });
  }

  // ── settings defaults ──────────────────────────────────────────────────
  const settings = new Set((await db.all('Settings')).map((s) => s.key));
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!settings.has(key)) await db.insert('Settings', { key, value }, 'system');
  }
}
