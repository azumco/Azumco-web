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
/** The one public host. Other hosts (the Render URL) redirect here; www vs apex is set in Render/DNS. */
const CANONICAL_ORIGIN = 'https://azumco.com';
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
  // Every public page is pre-rendered at build time (scripts/prerender.mjs) to
  // dist/<path>/index.html; unknown paths get dist/404.html with a real 404.
  // The team portal keeps the plain app shell (dist/shell.html).
  if (staticDir && existsSync(staticDir)) {
    const file = (...parts: string[]) => path.join(staticDir, ...parts);
    const shell = existsSync(file('shell.html')) ? file('shell.html') : file('index.html');
    const send = (res: Response, f: string, status = 200) => {
      res.status(status).set('Cache-Control', 'no-cache');
      res.sendFile(f);
    };
    const notFound = (res: Response) => (existsSync(file('404.html')) ? send(res, file('404.html'), 404) : res.status(404).type('text').send('Not found'));

    // One public host: the Render hostname (*.onrender.com) redirects to the
    // canonical domain. The team portal is left alone on every host.
    app.use((req, res, next) => {
      const host = String(req.headers.host ?? '').toLowerCase();
      if (/\.onrender\.com(:\d+)?$/.test(host) && (req.method === 'GET' || req.method === 'HEAD') && !/^\/team(\/|$)/.test(req.path)) {
        return res.redirect(301, `${CANONICAL_ORIGIN}${req.originalUrl}`);
      }
      next();
    });
    // Build files that must never be reachable as pages of their own.
    app.get(['/index.html', '/shell.html', '/404.html'], (req, res) => (req.path === '/index.html' ? res.redirect(301, '/') : notFound(res)));

    // Hashed build assets never change; everything else is revalidated.
    app.use(
      '/assets',
      express.static(file('assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
    );
    // redirect: false — directories (e.g. /services) are served by the page route below, never as /services/.
    app.use(express.static(staticDir, { index: false, redirect: false }));

    app.get(/^\/team(\/.*)?$/, (_req, res) => {
      res.set({ 'X-Robots-Tag': NOINDEX, 'X-Frame-Options': 'DENY' });
      send(res, shell);
    });

    app.get(/.*/, (req, res) => {
      const p = req.path;
      // One URL per page: drop a trailing slash (keeps the query string).
      if (p.length > 1 && p.endsWith('/')) {
        const q = req.originalUrl.slice(req.path.length);
        // Leading slashes collapsed: "//evil.com/" must never become an off-site redirect.
        return res.redirect(301, '/' + p.replace(/^\/+/, '').replace(/\/+$/, '') + q);
      }
      if (p === '/') return send(res, file('index.html'));
      const parts = p.split('/').filter(Boolean);
      if (parts.every((x) => /^[a-z0-9-]+$/.test(x)) && existsSync(file(...parts, 'index.html'))) return send(res, file(...parts, 'index.html'));
      notFound(res);
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
