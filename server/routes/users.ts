// User management. super_admin only — enforced here on the router, not just
// hidden in the UI.

import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import { bool, boolCell, num } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import { audit } from '../audit.ts';
import { generateTempPassword, hashPassword } from '../auth/passwords.ts';
import { HttpError, authOf, requireRole } from '../auth/middleware.ts';
import { releaseLeadsOf } from '../leads/service.ts';

export const publicUser = (u: Row) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: bool(u.active),
  hasPassword: Boolean(u.passwordHash),
  mustChangePassword: bool(u.mustChangePassword),
  lockedUntil: u.lockedUntil || null,
  lastLoginAt: u.lastLoginAt || null,
  updatedAt: u.updatedAt,
});

const patchSchema = z
  .object({
    // super_admin is not assignable: there is exactly one, seeded from env.
    role: z.enum(['admin', 'employee']).optional(),
    active: z.boolean().optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  .refine((b) => b.role !== undefined || b.active !== undefined, 'Nothing to change.');

export function usersRoutes(db: Db) {
  const router = Router();
  router.use(requireRole('super_admin'));

  router.get('/', async (_req, res) => {
    res.json({ users: (await db.all('Users')).map(publicUser) });
  });

  const loadOther = async (actorId: string, id: string) => {
    const user = await db.find('Users', id);
    if (!user) throw new HttpError(404, 'User not found.');
    if (user.id === actorId) throw new HttpError(400, 'Use your own account settings for this.');
    if (user.role === 'super_admin') throw new HttpError(400, 'The super admin account cannot be changed here.');
    return user;
  };

  /**
   * Issue a one-time temporary password. Returned in this response only and
   * never stored in plain text; the user must change it at first sign-in.
   * Also signs the user out everywhere and clears any lockout.
   */
  router.post('/:id/temp-password', async (req, res) => {
    const actor = authOf(res).user;
    const user = await loadOther(actor.id, req.params.id);
    const tempPassword = generateTempPassword();
    await db.update(
      'Users',
      user.id,
      {
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: boolCell(true),
        sessionVersion: String(num(user.sessionVersion) + 1),
        failedAttempts: '0',
        lockedUntil: '',
      },
      actor.id,
    );
    await audit(db, { actorId: actor.id, action: 'users.temp_password', entity: 'Users', entityId: user.id, ip: req.ip });
    res.set('Cache-Control', 'no-store').json({ tempPassword });
  });

  router.patch('/:id', async (req, res) => {
    const actor = authOf(res).user;
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
    const user = await loadOther(actor.id, req.params.id);

    const patch: Record<string, string> = {};
    if (parsed.data.role) patch.role = parsed.data.role;
    if (parsed.data.active !== undefined) {
      patch.active = boolCell(parsed.data.active);
      // Deactivation must take effect immediately, not when the session expires.
      if (!parsed.data.active) patch.sessionVersion = String(num(user.sessionVersion) + 1);
    }

    const { before, after } = await db.update('Users', user.id, patch, actor.id, parsed.data.expectedUpdatedAt);
    // A deactivated user's leads go back to Unclaimed immediately.
    const released = parsed.data.active === false ? await releaseLeadsOf(db, user.id, actor.id) : 0;
    await audit(db, {
      actorId: actor.id,
      action: 'users.update',
      entity: 'Users',
      entityId: user.id,
      before: { role: before.role, active: before.active },
      after: { role: after.role, active: after.active, leadsReleased: released },
      ip: req.ip,
    });
    res.json({ user: publicUser(after), leadsReleased: released });
  });

  return router;
}
