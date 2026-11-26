// The Express app: the public site's static build plus the team API.
//
// Public pages are served exactly as the static host serves them today: the
// built files, and index.html for any other path (the client router decides
// what to render). The only additions are /api and the noindex header on
// /team.

import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import type { Db } from './sheets/db.ts';
import { HttpError, requireAuth, sameOriginGuard } from './auth/middleware.ts';
import { Sessions } from './auth/sessions.ts';
import { authRoutes } from './routes/auth.ts';
import { usersRoutes } from './routes/users.ts';
import { workRoutes } from './routes/work.ts';
import { milestoneRoutes } from './routes/milestone.ts';
import { maintenanceRoutes } from './routes/maintenance.ts';
import { PlacesService } from './places/service.ts';
import { LeadCheckService } from './places/check.ts';
import { setAssignmentMinutesOverride } from './leads/service.ts';
import { GooglePlacesClient, type PlacesClient } from './places/client.ts';
import { log } from './lib/log.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  /** Resolves once bootstrap is done. API calls wait on it, so a cold start is slow, not an error. */
  ready: Promise<void>;
  staticDir?: string;
  /** Override for tests. Defaults to the real client when GOOGLE_PLACES_API_KEY is set, else disabled. */
  placesClient?: PlacesClient | null;
}

const NOINDEX = 'noindex, nofollow, noarchive';
const READY_TIMEOUT_MS = 40_000;

export function createApp({ config, db, ready, staticDir, placesClient }: AppDeps) {
  const app = express();
  const sessions = new Sessions(db, config.SESSION_SECRET, config.ALLOWED_EMAIL_DOMAIN);
  const client = placesClient !== undefined ? placesClient : config.GOOGLE_PLACES_API_KEY ? new GooglePlacesClient(config.GOOGLE_PLACES_API_KEY) : null;
  const places = new PlacesService(db, client);
  setAssignmentMinutesOverride(config.assignmentOverrideMinutes);

  app.disable('x-powered-by');
  // Render terminates TLS at one proxy hop; this makes req.ip the client address.
  app.set('trust proxy', 1);

  // ── API ──────────────────────────────────────────────────────────────────
  const api = express.Router();
  api.use((_req, res, next) => {
    res.set({
      'X-Robots-Tag': NOINDEX,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });

  // Health answers before bootstrap and never touches Sheets, so the pinger
  // keeps the instance awake without spending Sheets quota.
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Called by an external scheduler with a bearer token, so it sits before the
  // browser-oriented same-origin guard. It reads no cookies.
  api.use('/maintenance', maintenanceRoutes(config, db, ready));

  api.use(express.json({ limit: '100kb' }));
  api.use(sameOriginGuard);
  api.use(async (_req, _res, next) => {
    // Wait for bootstrap, but not forever: past the limit the client gets a
    // 503 it can show as "still starting" and retry, instead of a hung request.
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('starting')), READY_TIMEOUT_MS);
    });
    try {
      await Promise.race([ready, timeout]);
      next();
    } catch {
      next(new HttpError(503, 'The server is starting. Try again in a moment.', 'STARTING'));
    } finally {
      clearTimeout(timer);
    }
  });

  api.use('/auth', authRoutes(config, db, sessions));
  api.use('/users', requireAuth(sessions), usersRoutes(db, config.ALLOWED_EMAIL_DOMAIN));
  api.use(requireAuth(sessions), workRoutes(db, places, new LeadCheckService(db, places, config.SESSION_SECRET)));
  api.use(requireAuth(sessions), milestoneRoutes(db));

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found.')));
  api.use(errorHandler(config));
  app.use('/api', api);

  // ── Static site ──────────────────────────────────────────────────────────
  if (staticDir && existsSync(staticDir)) {
    // Hashed build assets never change; everything else is revalidated.
    app.use(
      '/assets',
      express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
    );
    // redirect: false — no /services → /services/ redirect; the pre-rendered route below serves it.
    app.use(express.static(staticDir, { index: false, redirect: false }));

    app.get(/^\/team(\/.*)?$/, (_req, res) => {
      res.set({ 'X-Robots-Tag': NOINDEX, 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-cache' });
      res.sendFile(path.join(staticDir, 'index.html'));
    });
    // Pre-rendered pages (/services, /services/<slug>): their own HTML file,
    // so crawlers get the content and meta tags. Unknown slugs fall through.
    app.get(/^\/services(\/[a-z0-9-]+)?\/?$/, (req, res, next) => {
      const file = path.join(staticDir, ...req.path.split('/').filter(Boolean), 'index.html');
      if (!existsSync(file)) return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(file);
    });
    // Same as the current host's "/* /index.html 200" rule.
    app.get(/.*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}

function errorHandler(config: Config) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; statusCode?: number; message?: string; code?: string; type?: string };
    // Body-parser errors (malformed JSON, too large) carry a status of their own.
    const status = e.status ?? e.statusCode ?? 500;

    if (status >= 500 && !(err instanceof HttpError)) {
      log.error('request failed', { method: req.method, path: req.path, error: e.message });
    }

    // Our own HttpErrors carry user-facing messages (e.g. a deliberate 503
    // "not set up"); anything unexpected is hidden in production.
    const intentional = err instanceof HttpError;
    const expose = intentional || status < 500 || !config.isProduction;
    res.status(status).json({
      error: expose ? e.message || 'Request failed.' : 'Something went wrong. Please try again.',
      ...(expose && typeof e.code === 'string' ? { code: e.code } : {}),
    });
  };
}
