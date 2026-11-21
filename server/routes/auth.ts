import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Config } from '../config.ts';
import type { Db } from '../sheets/db.ts';
import { bool, boolCell, num } from '../sheets/db.ts';
import { audit } from '../audit.ts';
import { RateLimiter } from '../auth/rate-limit.ts';
import { hashPassword, passwordProblem, verifyPassword } from '../auth/passwords.ts';
import { HttpError, authOf, readCookie, requireAuth } from '../auth/middleware.ts';
import { SESSION_COOKIE, SESSION_TTL_MS, toSessionUser, type Sessions } from '../auth/sessions.ts';

/** Consecutive failures before an account is locked, and for how long. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * One message for every failed sign-in — wrong password, unknown email,
 * deactivated, locked, or no password set yet — so the response never reveals
 * whether an account exists or what state it is in.
 */
export const LOGIN_FAILED = 'Sign-in failed. Check your email and password, or try again in 15 minutes.';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().max(200),
});

const changeSchema = z.object({
  currentPassword: z.string().max(200),
  newPassword: z.string().max(200),
});

export function authRoutes(config: Config, db: Db, sessions: Sessions) {
  const router = Router();
  const ipLimiter = new RateLimiter(10, LOCKOUT_MS);

  const setCookie = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/api',
      maxAge: SESSION_TTL_MS,
    });

  const clearCookie = (res: Response) =>
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.isProduction, sameSite: 'strict', path: '/api' });

  router.post('/login', async (req: Request, res: Response) => {
    const ip = req.ip ?? '';
    if (!ipLimiter.take(ip)) throw new HttpError(429, LOGIN_FAILED);

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(401, LOGIN_FAILED);
    const { email, password } = parsed.data;

    const user = (await db.all('Users')).find((u) => u.email.toLowerCase() === email);
    // Always run bcrypt, even with no user, so timing is uniform.
    const passwordOk = await verifyPassword(password, user?.passwordHash);

    if (!user) throw new HttpError(401, LOGIN_FAILED);

    const now = db.now().getTime();
    const locked = user.lockedUntil && Date.parse(user.lockedUntil) > now;
    if (!bool(user.active) || locked) throw new HttpError(401, LOGIN_FAILED);

    if (!passwordOk) {
      const failed = num(user.failedAttempts) + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await db.update(
        'Users',
        user.id,
        { failedAttempts: String(lock ? 0 : failed), lockedUntil: lock ? new Date(now + LOCKOUT_MS).toISOString() : '' },
        'system',
      );
      await audit(db, { actorId: user.id, action: lock ? 'auth.lockout' : 'auth.login_failed', entity: 'Users', entityId: user.id, ip });
      throw new HttpError(401, LOGIN_FAILED);
    }

    const { after } = await db.update(
      'Users',
      user.id,
      { failedAttempts: '0', lockedUntil: '', lastLoginAt: new Date(now).toISOString() },
      user.id,
    );
    const { token, csrfToken } = await sessions.create(after, ip, req.get('user-agent') ?? '');
    await sessions.prune(user.id, num(after.sessionVersion));
    await audit(db, { actorId: user.id, action: 'auth.login', entity: 'Users', entityId: user.id, ip });

    setCookie(res, token);
    res.json({ user: toSessionUser(after), csrfToken });
  });

  const authed = requireAuth(sessions);

  router.get('/me', authed, (_req, res) => {
    const { user, session } = authOf(res);
    res.json({ user, csrfToken: session.csrfToken });
  });

  router.post('/logout', async (req, res) => {
    // Logout works even with a dead session, so the browser can always clear itself.
    const ctx = await sessions.resolve(readCookie(req, SESSION_COOKIE));
    if (ctx) {
      if (req.get('x-csrf-token') !== ctx.session.csrfToken) throw new HttpError(403, 'Request blocked.');
      await sessions.destroy(ctx.session);
      await audit(db, { actorId: ctx.user.id, action: 'auth.logout', entity: 'Users', entityId: ctx.user.id, ip: req.ip });
    }
    clearCookie(res);
    res.json({ ok: true });
  });

  router.post('/change-password', authed, async (req, res) => {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Enter your current and new password.');
    const { user, session } = authOf(res);
    const row = await db.find('Users', user.id);
    if (!row || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
      throw new HttpError(400, 'Your current password is incorrect.');
    }
    const problem = passwordProblem(parsed.data.newPassword, parsed.data.currentPassword);
    if (problem) throw new HttpError(400, problem);

    // Bumping the version signs out every other device; this one gets a new session.
    const { after } = await db.update(
      'Users',
      user.id,
      {
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: boolCell(false),
        sessionVersion: String(num(row.sessionVersion) + 1),
      },
      user.id,
    );
    await sessions.destroy(session);
    const { token, csrfToken } = await sessions.create(after, req.ip ?? '', req.get('user-agent') ?? '');
    await sessions.prune(user.id, num(after.sessionVersion));
    await audit(db, { actorId: user.id, action: 'auth.password_changed', entity: 'Users', entityId: user.id, ip: req.ip });

    setCookie(res, token);
    res.json({ user: toSessionUser(after), csrfToken });
  });

  return router;
}
