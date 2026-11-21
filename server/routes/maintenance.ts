// Token-protected maintenance for an external free scheduler (Render free has
// no cron). Runs the assignment-expiry sweep. Expiry is also evaluated on every
// read, so this only makes the founders' notifications timely when nobody is
// using the app.
//
//   POST or GET /api/maintenance/run
//   Authorization: Bearer <CRON_TOKEN>       (preferred)
//   or ?token=<CRON_TOKEN>                   (for schedulers without custom headers)
//
// Disabled (404) when CRON_TOKEN is not set.

import { Router } from 'express';
import type { Config } from '../config.ts';
import type { Db } from '../sheets/db.ts';
import { HttpError } from '../auth/middleware.ts';
import { safeEqual } from '../auth/sessions.ts';
import { sweepExpired } from '../leads/service.ts';
import { log } from '../lib/log.ts';

export function maintenanceRoutes(config: Config, db: Db, ready: Promise<void>) {
  const r = Router();
  const run = async (req: import('express').Request, res: import('express').Response) => {
    if (!config.CRON_TOKEN) throw new HttpError(404, 'Not found.');
    const header = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    const token = header || (typeof req.query.token === 'string' ? req.query.token : '');
    if (!safeEqual(token, config.CRON_TOKEN)) throw new HttpError(401, 'Unauthorized.');
    await ready;
    const expired = await sweepExpired(db);
    log.info('maintenance run', { expired });
    res.json({ ok: true, expired, at: db.now().toISOString() });
  };
  r.post('/run', run);
  r.get('/run', run);
  return r;
}
