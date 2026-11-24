// User management. super_admin only — enforced here on the router, not just
// hidden in the UI.

import { MEET_LINK_ERROR, normalizeMeetLink } from '../../shared/meet.ts';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import { bool, boolCell, num } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import { audit } from '../audit.ts';
import { generateTempPassword, hashPassword } from '../auth/passwords.ts';
import { HttpError, authOf, requireRole } from '../auth/middleware.ts';
import { istYearMonth } from '../../shared/time.ts';
import { releaseLeadsOf } from '../leads/service.ts';
import { emailInDomain } from '../../shared/email.ts';
import { MIN_PASSWORD_LENGTH } from '../auth/passwords.ts';
import { profileDefaults } from '../users/profile.ts';

/** Validate a Meet link for a user: founders only, strict format; '' clears it. */
export function checkedMeetLink(raw: string, role: string): string {
  const link = normalizeMeetLink(raw);
  if (link === null) throw new HttpError(400, MEET_LINK_ERROR, 'MEET_LINK_INVALID');
  if (link && role !== 'admin' && role !== 'super_admin') throw new HttpError(400, 'Only founders have a Google Meet link.');
  return link;
}

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
  jobTitle: u.jobTitle ?? '',
  meetLink: u.meetLink ?? '',
  /** Monthly Google checks for this person; null = the Settings default. */
  leadCheckLimit: u.leadCheckLimit ? Number(u.leadCheckLimit) : null,
  /** Google checks used this IST month. */
  leadChecksUsed: u.leadCheckMonth === istYearMonth() ? Number(u.leadCheckUsed) || 0 : 0,
  canReceiveLeads: bool(u.canReceiveLeads),
  calendarColor: u.calendarColor || 'neutral',
  updatedAt: u.updatedAt,
});

const patchSchema = z
  .object({
    // super_admin is not assignable: there is exactly one, seeded from env.
    role: z.enum(['admin', 'employee']).optional(),
    active: z.boolean().optional(),
    jobTitle: z.string().trim().max(80).optional(),
    canReceiveLeads: z.boolean().optional(),
    /** Founders only; '' clears it. Validated below (format https://meet.google.com/abc-defg-hij). */
    meetLink: z.string().max(200).optional(),
    /** Monthly Google checks for a team member; null = use the Settings default. */
    leadCheckLimit: z.number().int().min(0).max(100_000).nullable().optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  // Strict: an "email" (or any other) field is rejected, not silently ignored.
  // There is deliberately no way to change an address through the API.
  .strict()
  .refine((b) => b.role !== undefined || b.active !== undefined || b.jobTitle !== undefined || b.canReceiveLeads !== undefined || b.meetLink !== undefined || b.leadCheckLimit !== undefined, 'Nothing to change.');

/** New teammate: super admin only, company domain only, no password until one is issued. */
const createSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(100),
    email: z.string().trim().toLowerCase().email('Enter a valid email.'),
    role: z.enum(['admin', 'employee']),
    jobTitle: z.string().trim().max(80).default(''),
    canReceiveLeads: z.boolean().optional(),
  })
  .strict();

export function usersRoutes(db: Db, allowedDomain: string) {
  const router = Router();
  router.use(requireRole('super_admin'));

  router.get('/', async (_req, res) => {
    res.json({ users: (await db.all('Users')).map(publicUser) });
  });

  router.post('/', async (req, res) => {
    const actor = authOf(res).user;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request.');
    const input = parsed.data;
    if (!emailInDomain(input.email, allowedDomain)) throw new HttpError(400, `Only @${allowedDomain} addresses can have accounts.`);
    const created = await db.exclusive(async () => {
      const [state] = await db.loadFresh(['Users']);
      if (state.rows.some((u) => u.email.toLowerCase() === input.email)) throw new HttpError(409, 'Someone with that email already has an account.');
      const defaults = profileDefaults(input.role, state.rows);
      return db.insertUnqueued(
        'Users',
        {
          email: input.email,
          name: input.name,
          role: input.role,
          active: boolCell(true),
          passwordHash: '',
          mustChangePassword: boolCell(true),
          failedAttempts: '0',
          sessionVersion: '0',
          ...defaults,
          jobTitle: input.jobTitle,
          ...(input.canReceiveLeads !== undefined ? { canReceiveLeads: boolCell(input.canReceiveLeads) } : {}),
        },
        actor.id,
      );
    });
    await audit(db, { actorId: actor.id, action: 'users.create', entity: 'Users', entityId: created.id, after: publicUser(created), ip: req.ip });
    res.status(201).json({ user: publicUser(created) });
  });

  const loadOther = async (actorId: string, id: string) => {
    const user = await db.find('Users', id);
    if (!user) throw new HttpError(404, 'User not found.');
    if (user.id === actorId) throw new HttpError(400, 'Use your own account settings for this.');
    if (user.role === 'super_admin') throw new HttpError(400, 'The super admin account cannot be changed here.');
    if (!emailInDomain(user.email, allowedDomain)) {
      throw new HttpError(400, `This account is not on ${allowedDomain} and cannot be managed or signed in to.`);
    }
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
    // The super admin may type a temporary password, or leave it blank to generate one.
    const typed = z.object({ tempPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional() }).safeParse(req.body ?? {});
    if (!typed.success) throw new HttpError(400, `A temporary password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
    const tempPassword = typed.data.tempPassword || generateTempPassword();
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
    // The super admin may edit their own job title / lead setting, nothing else.
    const selfProfileOnly = req.params.id === actor.id && parsed.data.role === undefined && parsed.data.active === undefined;
    const user = selfProfileOnly ? (await db.find('Users', actor.id))! : await loadOther(actor.id, req.params.id);

    const patch: Record<string, string> = {};
    if (parsed.data.jobTitle !== undefined) patch.jobTitle = parsed.data.jobTitle;
    if (parsed.data.canReceiveLeads !== undefined) patch.canReceiveLeads = boolCell(parsed.data.canReceiveLeads);
    if (parsed.data.meetLink !== undefined) patch.meetLink = checkedMeetLink(parsed.data.meetLink, user.role);
    if (parsed.data.leadCheckLimit !== undefined) patch.leadCheckLimit = parsed.data.leadCheckLimit === null ? '' : String(parsed.data.leadCheckLimit);
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
      before: { role: before.role, active: before.active, jobTitle: before.jobTitle, canReceiveLeads: before.canReceiveLeads, leadCheckLimit: before.leadCheckLimit ?? '' },
      after: { role: after.role, active: after.active, jobTitle: after.jobTitle, canReceiveLeads: after.canReceiveLeads, leadCheckLimit: after.leadCheckLimit ?? '', leadsReleased: released },
      ip: req.ip,
    });
    res.json({ user: publicUser(after), leadsReleased: released });
  });

  return router;
}
