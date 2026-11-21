// Expenses, projects/income and the cash summary. Founders only — the router
// that mounts these refuses employees on every route.

import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import { bool, boolCell, num } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { audit } from '../audit.ts';
import { summarizeExpenses } from '../../shared/rules.ts';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30.');

export const expenseSchema = z.object({
  date: day,
  item: z.string().trim().min(1, 'What was it for?').max(200),
  amount: z.number().positive('Enter an amount above zero.').max(1e9),
  paidBy: z.string().trim().min(1).max(100),
  project: z.string().trim().max(100).default('General'),
  repaid: z.boolean().default(false),
});

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  dealTotal: z.number().min(0).max(1e10),
  received: z.number().min(0).max(1e10),
  status: z.enum(['Active', 'Completed', 'On Hold', 'Cancelled']).default('Active'),
});

const expenseRow = (e: z.infer<typeof expenseSchema>) => ({ ...e, amount: String(e.amount), repaid: boolCell(e.repaid) });
const projectRow = (p: z.infer<typeof projectSchema>) => ({ ...p, dealTotal: String(p.dealTotal), received: String(p.received) });

export const expenseView = (e: Row) => ({
  id: e.id, date: e.date, item: e.item, amount: num(e.amount), paidBy: e.paidBy, project: e.project, repaid: bool(e.repaid), updatedAt: e.updatedAt,
});
export const projectView = (p: Row) => ({
  id: p.id, name: p.name, dealTotal: num(p.dealTotal), received: num(p.received), status: p.status, updatedAt: p.updatedAt,
});

export class FinanceService {
  constructor(private readonly db: Db) {}

  async overview() {
    const [expenses, projects, users, contributions] = await Promise.all([
      this.db.all('Expenses'),
      this.db.all('Projects'),
      this.db.all('Users'),
      this.db.all('Contributions'),
    ]);
    const ev = expenses.map(expenseView).sort((a, b) => b.date.localeCompare(a.date));
    const pv = projects.map(projectView);
    return {
      expenses: ev,
      projects: pv,
      summary: summarizeExpenses(ev, pv, contributions.reduce((s, c) => s + num(c.amount), 0)),
      members: users.filter((u) => u.active !== 'FALSE').map((u) => u.name),
    };
  }

  async create(actor: SessionUser, tab: 'Expenses' | 'Projects', body: unknown, ip?: string) {
    const row =
      tab === 'Expenses' ? expenseRow(expenseSchema.parse(body)) : projectRow(projectSchema.parse(body));
    const saved = await this.db.insert(tab, row, actor.id);
    await audit(this.db, { actorId: actor.id, action: `${tab.toLowerCase()}.create`, entity: tab, entityId: saved.id, after: row, ip });
    return saved;
  }

  async update(actor: SessionUser, tab: 'Expenses' | 'Projects', id: string, body: unknown, ip?: string) {
    const { expectedUpdatedAt, ...rest } = (body ?? {}) as { expectedUpdatedAt?: string };
    const row = tab === 'Expenses' ? expenseRow(expenseSchema.parse(rest)) : projectRow(projectSchema.parse(rest));
    const { before, after } = await this.db.update(tab, id, row, actor.id, expectedUpdatedAt);
    await audit(this.db, { actorId: actor.id, action: `${tab.toLowerCase()}.update`, entity: tab, entityId: id, before, after, ip });
    return after;
  }

  async remove(actor: SessionUser, tab: 'Expenses' | 'Projects', id: string, ip?: string) {
    const before = await this.db.remove(tab, id, actor.id);
    await audit(this.db, { actorId: actor.id, action: `${tab.toLowerCase()}.delete`, entity: tab, entityId: id, before, ip });
  }
}
