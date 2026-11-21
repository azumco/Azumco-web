// Password reset for the local CLI only (server/scripts/reset-password.ts).
// Nothing in the HTTP app imports this module; it is not reachable over HTTP.

import type { Db } from '../sheets/db.ts';
import { hashPassword } from './passwords.ts';
import { auditUnqueued } from '../audit.ts';
import { emailInDomain, normalizeEmail } from '../../shared/email.ts';

/** Stricter than the in-app minimum: this is a recovery path. */
export const CLI_MIN_PASSWORD_LENGTH = 12;

export class ResetRefused extends Error {}

const num = (v: string | undefined) => Number(v) || 0;

/** Find the account to reset. Throws ResetRefused with a plain reason. */
export async function findResettableUser(db: Db, email: string, allowedDomain: string) {
  if (!emailInDomain(email, allowedDomain)) throw new ResetRefused(`Only @${allowedDomain} addresses can be reset.`);
  const [users] = await db.loadFresh(['Users']);
  const user = users.rows.find((u) => normalizeEmail(u.email) === normalizeEmail(email));
  if (!user) throw new ResetRefused('No account with that email.');
  if (user.active !== 'TRUE') throw new ResetRefused('That account is inactive. Reactivate it first.');
  return user;
}

/**
 * Set a temporary password (hashed as usual), force a change at next sign-in,
 * clear failed attempts and lockout, and end every existing session: the
 * session-version bump makes old sessions invalid at once, and their rows are
 * deleted too. One audit entry, with no password data in it.
 */
export async function resetPasswordLocal(db: Db, email: string, tempPassword: string, allowedDomain: string) {
  if (tempPassword.length < CLI_MIN_PASSWORD_LENGTH) throw new ResetRefused(`The password needs at least ${CLI_MIN_PASSWORD_LENGTH} characters.`);
  const passwordHash = await hashPassword(tempPassword);
  return db.exclusive(async () => {
    const user = await findResettableUser(db, email, allowedDomain);
    const before = { failedAttempts: user.failedAttempts, lockedUntil: user.lockedUntil, sessionVersion: user.sessionVersion };
    const sessionVersion = String(num(user.sessionVersion) + 1);
    await db.updateUnqueued(
      'Users',
      user.id,
      { passwordHash, mustChangePassword: 'TRUE', failedAttempts: '0', lockedUntil: '', sessionVersion },
      'local-cli',
    );
    const [sessions] = await db.loadFresh(['Sessions']);
    const mine = sessions.rows.filter((s) => s.userId === user.id);
    for (const s of mine) await db.removeUnqueued('Sessions', s.id, 'local-cli');
    await auditUnqueued(db, [
      {
        actorId: 'local-cli',
        action: 'password reset via local CLI',
        entity: 'Users',
        entityId: user.id,
        before,
        after: { mustChangePassword: true, failedAttempts: '0', lockedUntil: '', sessionVersion, sessionsEnded: mine.length },
      },
    ]);
    return { userId: user.id, name: user.name, role: user.role, sessionsEnded: mine.length };
  });
}
