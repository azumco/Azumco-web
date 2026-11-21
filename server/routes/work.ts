// API routes for leads, Find clients, bookings, finance, goals, dashboards,
// notifications, settings and audit. Every router here sits behind
// requireAuth; role checks are applied per route below, at the API, so a
// direct call is refused exactly as the UI would hide it.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import { HttpError, authOf, requireRole } from '../auth/middleware.ts';
import { istDate } from '../../shared/time.ts';
import { getSettings, settingsPatchSchema, updateSettings } from '../settings.ts';
import {
  assignLeads, callSchema, confirmContact, confirmSchema, createLead, createLeadSchema, deleteLead, leadView, logCall,
  markCommissionPaid, unassignLeads, updateLead, viewContext, visibleLeads,
} from '../leads/service.ts';
import { assertLeadAccess } from '../leads/access.ts';
import { PlacesService, importSchema, searchSchema } from '../places/service.ts';
import { placesUsage } from '../places/budget.ts';
import { BookingService, availabilitySchema, bookingSchema, rescheduleSchema } from '../bookings/service.ts';
import { FinanceService } from '../finance/service.ts';
import { GoalService } from '../goals/service.ts';
import { employeeDashboard, founderDashboard } from '../dashboard/service.ts';

const FOUNDERS = requireRole('admin');
const SUPER = requireRole('super_admin');

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'Invalid request.');
  return r.data;
}

const me = (res: Response) => authOf(res).user;
const param = (req: Request, name: string) => String(req.params[name]);

/** Neutralise spreadsheet formulas in exported cells (CSV injection). */
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function workRoutes(db: Db, places: PlacesService) {
  const r = Router();
  const bookings = new BookingService(db);
  const finance = new FinanceService(db);
  const goals = new GoalService(db);

  // ── Leads ────────────────────────────────────────────────────────────────
  r.get('/leads', async (_req, res) => {
    const [rows, ctx] = await Promise.all([visibleLeads(db, me(res)), viewContext(db)]);
    res.json({ leads: rows.map((l) => leadView(l, ctx)), serverNow: ctx.now.toISOString() });
  });

  r.get('/leads/export.csv', FOUNDERS, async (_req, res) => {
    const [rows, ctx] = await Promise.all([visibleLeads(db, me(res)), viewContext(db)]);
    const views = rows.map((l) => leadView(l, ctx));
    const cols = [
      'label', 'category', 'city', 'contactPerson', 'phone', 'websiteOrInstagram', 'source', 'serviceInterest', 'status',
      'assigneeName', 'attempts', 'callOutcome', 'rating', 'followUpDate', 'discoveryCallDate', 'callHappened', 'dealType',
      'dealValue', 'clientPaid', 'commission', 'commissionPaid', 'dateAdded', 'addedByName',
    ] as const;
    const csv = [cols.join(','), ...views.map((v) => cols.map((c) => csvCell(v[c])).join(','))].join('\r\n');
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="azumco-leads-${istDate(ctx.now)}.csv"` });
    res.send(`﻿${csv}`);
  });

  r.get('/leads/:id', async (req, res) => {
    const id = param(req, 'id');
    const [rows, ctx] = await Promise.all([visibleLeads(db, me(res)), viewContext(db)]);
    // visibleLeads has already swept, so this is the current state. The former
    // assignee of a lapsed lead gets the precise "expired" message; others 404.
    const lead = (await db.all('Leads')).find((l) => l.id === id);
    assertLeadAccess(me(res), lead, ctx.now, await db.all('Expirations'));
    if (!rows.some((l) => l.id === id)) throw new HttpError(404, 'Lead not found.');
    const calls = ctx.calls
      .filter((c) => c.leadId === id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((c) => ({ id: c.id, at: c.at, outcome: c.outcome, note: c.note, by: ctx.users.find((u) => u.id === c.userId)?.name ?? '' }));
    res.json({ lead: leadView(lead, ctx), calls, serverNow: ctx.now.toISOString() });
  });

  r.post('/leads', FOUNDERS, async (req, res) => {
    const lead = await createLead(db, me(res), parse(createLeadSchema, req.body));
    res.status(201).json({ id: lead.id });
  });

  r.patch('/leads/:id', async (req, res) => {
    const lead = await updateLead(db, me(res), param(req, 'id'), req.body);
    res.json({ lead: leadView(lead, await viewContext(db)) });
  });

  r.delete('/leads/:id', FOUNDERS, async (req, res) => {
    await deleteLead(db, me(res), param(req, 'id'), req.ip);
    res.json({ ok: true });
  });

  r.post('/leads/assign', FOUNDERS, async (req, res) => {
    const body = parse(
      z.object({
        leadIds: z.array(z.string()).min(1).max(200),
        assigneeId: z.string().nullable(),
        hours: z.union([z.literal(12), z.literal(24), z.literal(48)]).nullable().default(null),
      }),
      req.body,
    );
    if (body.assigneeId === null) await unassignLeads(db, me(res), body.leadIds, req.ip);
    else await assignLeads(db, me(res), body.leadIds, body.assigneeId, body.hours, req.ip);
    res.json({ ok: true });
  });

  r.post('/leads/:id/calls', async (req, res) => {
    const result = await logCall(db, me(res), param(req, 'id'), parse(callSchema, req.body));
    res.status(201).json({ timerStopped: result.timerStopped, lead: leadView(result.lead, await viewContext(db)) });
  });

  r.post('/leads/:id/confirm', async (req, res) => {
    const lead = await confirmContact(db, me(res), param(req, 'id'), parse(confirmSchema, req.body));
    res.json({ lead: leadView(lead, await viewContext(db)) });
  });

  r.post('/leads/:id/commission-paid', FOUNDERS, async (req, res) => {
    await markCommissionPaid(db, me(res), param(req, 'id'), req.ip);
    res.json({ ok: true });
  });

  /** Live Google contact for an unconfirmed lead. Employees may use it on their own leads. */
  r.get('/leads/:id/live-contact', async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await places.lookup(me(res), param(req, 'id'), req.ip));
  });

  // ── Find clients (founders only) ─────────────────────────────────────────
  r.get('/places/status', FOUNDERS, async (_req, res) => {
    const settings = await getSettings(db);
    res.json({ enabled: places.enabled, usage: await placesUsage(db), defaultWindowHours: settings.assignmentWindowHours });
  });

  r.post('/places/search', FOUNDERS, async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await places.search(me(res), parse(searchSchema, req.body), req.ip));
  });

  r.post('/places/import', FOUNDERS, async (req, res) => {
    const settings = await getSettings(db);
    res.json(await places.import(me(res), parse(importSchema, req.body), settings.assignmentWindowHours, req.ip));
  });

  // ── Availability & bookings ──────────────────────────────────────────────
  r.get('/availability', FOUNDERS, async (_req, res) => {
    res.json({ availability: await bookings.listAvailability(me(res).id) });
  });
  r.post('/availability', FOUNDERS, async (req, res) => {
    res.status(201).json({ availability: await bookings.addAvailability(me(res), parse(availabilitySchema, req.body)) });
  });
  r.delete('/availability/:id', FOUNDERS, async (req, res) => {
    await bookings.removeAvailability(me(res), param(req, 'id'));
    res.json({ ok: true });
  });

  r.get('/slots', async (req, res) => {
    const q = parse(
      z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), days: z.coerce.number().int().min(1).max(31).default(14), founderId: z.string().optional() }),
      req.query,
    );
    const users = await db.all('Users');
    const founders = users.filter((u) => (u.role === 'admin' || u.role === 'super_admin') && u.active !== 'FALSE');
    res.json({
      slots: await bookings.slots(q.from ?? istDate(db.now()), q.days, q.founderId),
      founders: founders.map((u) => ({ id: u.id, name: u.name })),
    });
  });

  r.get('/bookings', async (_req, res) => {
    const [rows, leads, users] = await Promise.all([bookings.list(me(res)), db.all('Leads'), db.all('Users')]);
    res.json({
      bookings: rows.map((b) => ({
        id: b.id,
        leadId: b.leadId,
        founderId: b.founderId,
        founderName: users.find((u) => u.id === b.founderId)?.name ?? '',
        bookedByName: users.find((u) => u.id === b.bookedBy)?.name ?? '',
        date: b.date,
        start: b.start,
        end: b.end,
        status: b.status,
        clientName: b.clientName,
        phone: b.phone,
        mode: b.mode,
        link: b.link,
        notes: b.notes,
        callHappened: b.callHappened === '' ? null : b.callHappened === 'TRUE',
        leadExists: leads.some((l) => l.id === b.leadId),
      })),
    });
  });
  r.post('/bookings', async (req, res) => {
    res.status(201).json({ booking: await bookings.book(me(res), parse(bookingSchema, req.body)) });
  });
  r.post('/bookings/:id/cancel', FOUNDERS, async (req, res) => {
    await bookings.cancel(me(res), param(req, 'id'));
    res.json({ ok: true });
  });
  r.post('/bookings/:id/reschedule', FOUNDERS, async (req, res) => {
    res.json({ booking: await bookings.reschedule(me(res), param(req, 'id'), parse(rescheduleSchema, req.body)) });
  });
  r.post('/bookings/:id/call-happened', FOUNDERS, async (req, res) => {
    const { happened } = parse(z.object({ happened: z.boolean() }), req.body);
    await bookings.markCallHappened(me(res), param(req, 'id'), happened, req.ip);
    res.json({ ok: true });
  });

  // ── Finance (founders only — employees get 403 on every route) ───────────
  const fin = Router();
  fin.use(FOUNDERS);
  fin.get('/', async (_req, res) => res.json(await finance.overview()));
  for (const [path, tab] of [['expenses', 'Expenses'], ['projects', 'Projects']] as const) {
    fin.post(`/${path}`, async (req, res) => res.status(201).json({ row: await finance.create(me(res), tab, req.body, req.ip) }));
    fin.put(`/${path}/:id`, async (req, res) => res.json({ row: await finance.update(me(res), tab, param(req, 'id'), req.body, req.ip) }));
    fin.delete(`/${path}/:id`, async (req, res) => {
      await finance.remove(me(res), tab, param(req, 'id'), req.ip);
      res.json({ ok: true });
    });
  }
  r.use('/finance', fin);

  // ── Goals ────────────────────────────────────────────────────────────────
  r.get('/goals', async (_req, res) => res.json({ goals: await goals.list(me(res)), today: istDate(db.now()) }));
  r.post('/goals', FOUNDERS, async (req, res) => res.status(201).json({ goal: await goals.create(me(res), req.body) }));
  r.patch('/goals/:id', async (req, res) => res.json({ goal: await goals.update(me(res), param(req, 'id'), req.body) }));
  r.delete('/goals/:id', FOUNDERS, async (req, res) => {
    await goals.remove(me(res), param(req, 'id'));
    res.json({ ok: true });
  });

  // ── Dashboards ───────────────────────────────────────────────────────────
  r.get('/dashboard/founder', FOUNDERS, async (_req, res) => res.json(await founderDashboard(db)));
  r.get('/dashboard/me', async (_req, res) => res.json(await employeeDashboard(db, me(res))));

  // ── Team list (for assign / paid-by pickers) ─────────────────────────────
  r.get('/team', FOUNDERS, async (_req, res) => {
    const users = await db.all('Users');
    res.json({ users: users.filter((u) => u.active !== 'FALSE').map((u) => ({ id: u.id, name: u.name, role: u.role })) });
  });

  // ── Notifications (own only) ─────────────────────────────────────────────
  r.get('/notifications', async (_req, res) => {
    const mine = (await db.all('Notifications')).filter((n) => n.userId === me(res).id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({
      unread: mine.filter((n) => !n.readAt).length,
      notifications: mine.slice(0, 50).map((n) => ({ id: n.id, type: n.type, message: n.message, refId: n.refId, at: n.createdAt, read: Boolean(n.readAt) })),
    });
  });
  r.post('/notifications/read-all', async (_req, res) => {
    const user = me(res);
    await db.exclusive(async () => {
      const [state] = await db.loadFresh(['Notifications']);
      const now = db.now().toISOString();
      await db.updateManyUnqueued(
        'Notifications',
        state.rows.filter((n) => n.userId === user.id && !n.readAt).map((n) => ({ id: n.id, patch: { readAt: now } })),
        user.id,
      );
    });
    res.json({ ok: true });
  });

  // ── Settings & audit (super_admin only) ──────────────────────────────────
  r.get('/settings', SUPER, async (_req, res) => {
    res.json({ settings: await getSettings(db), usage: await placesUsage(db), placesEnabled: places.enabled });
  });
  r.put('/settings', SUPER, async (req, res) => {
    res.json({ settings: await updateSettings(db, me(res).id, parse(settingsPatchSchema, req.body), req.ip) });
  });
  r.get('/audit', SUPER, async (_req, res) => {
    const [rows, users] = await Promise.all([db.all('Audit'), db.all('Users')]);
    const sorted = [...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
    res.json({
      entries: sorted.map((a) => ({
        id: a.id, at: a.at, action: a.action, entity: a.entity, entityId: a.entityId, before: a.before, after: a.after,
        actor: a.actorId === 'system' ? 'System' : users.find((u) => u.id === a.actorId)?.name ?? a.actorId,
      })),
    });
  });

  return r;
}
