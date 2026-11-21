// Milestone and contribution routes. Every route is founders-only (employees
// get 403), and structural edits are super_admin. Guards are per route — not
// router.use() — because this router is mounted at the API root and must not
// affect other routes.

import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import type { Db } from '../sheets/db.ts';
import { HttpError, authOf, requireRole } from '../auth/middleware.ts';
import { MilestoneService } from '../milestone/service.ts';

const me = (res: Response) => authOf(res).user;
const param = (req: Request, n: string) => String(req.params[n]);

/** Run a service call; validation errors become a 400 with the first message. */
const run = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res);
    res.json(out ?? { ok: true });
  } catch (err) {
    next(err instanceof ZodError ? new HttpError(400, err.issues[0]?.message ?? 'Invalid request.') : err);
  }
};

export function milestoneRoutes(db: Db) {
  const r = Router();
  const svc = new MilestoneService(db);
  const FOUNDERS = requireRole('admin');
  const SUPER = requireRole('super_admin');

  r.get('/milestones', FOUNDERS, run(() => svc.overview()));
  r.patch('/milestones/:id', SUPER, run((req, res) => svc.updateMilestone(me(res), param(req, 'id'), req.body, req.ip)));
  r.post('/milestones/:id/items', SUPER, run((req, res) => svc.addItem(me(res), param(req, 'id'), req.body, req.ip)));
  r.patch('/milestone-items/:id', SUPER, run((req, res) => svc.updateItem(me(res), param(req, 'id'), req.body, req.ip)));
  r.delete('/milestone-items/:id', SUPER, run((req, res) => svc.removeItem(me(res), param(req, 'id'), req.ip)));
  r.post('/milestone-items/:id/pay', FOUNDERS, run((req, res) => svc.markPaid(me(res), param(req, 'id'), req.body, req.ip)));
  r.post('/milestone-items/:id/unpay', FOUNDERS, run((req, res) => svc.markUnpaid(me(res), param(req, 'id'), req.ip)));
  r.get('/contributions', FOUNDERS, run(async () => ({ contributions: (await svc.overview()).contributions })));
  r.post('/contributions', FOUNDERS, run((req, res) => svc.addContribution(me(res), req.body, req.ip)));
  r.delete('/contributions/:id', SUPER, run((req, res) => svc.removeContribution(me(res), param(req, 'id'), req.ip)));

  return r;
}
