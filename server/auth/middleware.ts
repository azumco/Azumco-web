// Request guards. Every /api route except health and login goes through
// requireAuth + a role check; every state-changing request is CSRF-checked.

import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../config.ts';
import { SESSION_COOKIE, safeEqual, type AuthContext, type Sessions } from './sessions.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export const authOf = (res: Response) => res.locals.auth as AuthContext;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Routes a user who must change their password may still reach. */
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

/**
 * Cross-site request guard for every mutating /api request, logged in or not.
 *
 * - The custom header cannot be set by a cross-site form post, and setting it
 *   from another origin's script forces a CORS preflight this server never
 *   approves.
 * - When the browser sends Origin, it must be this site.
 */
export function sameOriginGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'azumco') return next(new HttpError(403, 'Request blocked.'));
  const origin = req.get('origin');
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return next(new HttpError(403, 'Request blocked.'));
    }
    if (host !== req.get('host')) return next(new HttpError(403, 'Request blocked.'));
  }
  next();
}

export function requireAuth(sessions: Sessions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = await sessions.resolve(readCookie(req, SESSION_COOKIE));
      if (!ctx) return next(new HttpError(401, 'Please sign in.', 'UNAUTHENTICATED'));

      // Per-session CSRF token on every state-changing request.
      if (!SAFE_METHODS.has(req.method) && !safeEqual(req.get('x-csrf-token'), ctx.session.csrfToken)) {
        return next(new HttpError(403, 'Your session expired. Reload the page.', 'CSRF'));
      }

      if (ctx.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.originalUrl.split('?')[0])) {
        return next(new HttpError(403, 'Change your password to continue.', 'PASSWORD_CHANGE_REQUIRED'));
      }

      res.locals.auth = ctx;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Role gate. super_admin passes every check. */
export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const role = authOf(res)?.user.role;
    if (role === 'super_admin' || (role && roles.includes(role))) return next();
    next(new HttpError(403, 'You do not have access to this.', 'FORBIDDEN'));
  };
}

/** Founders = admin + super_admin. */
export const FOUNDERS: Role[] = ['admin'];
