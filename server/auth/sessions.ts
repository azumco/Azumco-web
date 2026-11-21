// Server-side sessions, stored in the Sessions tab (survives restarts and
// Render spin-downs) and served from the Db cache.
//
// The browser holds only a random opaque token in an httpOnly cookie. The tab
// stores an HMAC of it keyed with SESSION_SECRET, so a copy of the spreadsheet
// alone cannot be replayed as a login.
//
// Each session records the user's `sessionVersion` at creation. Deactivating a
// user, resetting their password or a password change bumps the version, which
// invalidates every existing session for that user at once.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from '../sheets/db.ts';
import { bool, num } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { Role } from '../config.ts';

export const SESSION_COOKIE = 'azumco_sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AuthContext {
  user: SessionUser;
  session: Row;
}

export const toSessionUser = (u: Row): SessionUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role as Role,
  mustChangePassword: bool(u.mustChangePassword),
});

export class Sessions {
  constructor(
    private readonly db: Db,
    private readonly secret: string,
  ) {}

  private hash(token: string): string {
    return createHmac('sha256', this.secret).update(token).digest('hex');
  }

  async create(user: Row, ip: string, userAgent: string): Promise<{ token: string; csrfToken: string }> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    await this.db.insert(
      'Sessions',
      {
        tokenHash: this.hash(token),
        userId: user.id,
        sessionVersion: user.sessionVersion || '0',
        csrfToken,
        expiresAt: new Date(this.db.now().getTime() + SESSION_TTL_MS).toISOString(),
        ip,
        userAgent: userAgent.slice(0, 200),
      },
      user.id,
    );
    return { token, csrfToken };
  }

  /** The live session for a token, or null if missing, expired, revoked or the user is inactive. */
  async resolve(token: string | undefined): Promise<AuthContext | null> {
    if (!token || token.length > 200) return null;
    const wanted = Buffer.from(this.hash(token));
    const sessions = await this.db.all('Sessions');
    const session = sessions.find((s) => {
      const have = Buffer.from(s.tokenHash);
      return have.length === wanted.length && timingSafeEqual(have, wanted);
    });
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= this.db.now().getTime()) return null;

    const user = await this.db.find('Users', session.userId);
    if (!user || !bool(user.active)) return null;
    if (num(user.sessionVersion) !== num(session.sessionVersion)) return null;

    return { user: toSessionUser(user), session };
  }

  async destroy(session: Row): Promise<void> {
    await this.db.remove('Sessions', session.id, session.userId).catch(() => undefined);
  }

  /** Remove this user's sessions that can no longer be used. Housekeeping only. */
  async prune(userId: string, currentVersion: number): Promise<void> {
    const now = this.db.now().getTime();
    const dead = (await this.db.all('Sessions')).filter(
      (s) => s.userId === userId && (Date.parse(s.expiresAt) <= now || num(s.sessionVersion) !== currentVersion),
    );
    for (const s of dead) await this.db.remove('Sessions', s.id, userId).catch(() => undefined);
  }
}

/** Constant-time string comparison for CSRF tokens. */
export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
