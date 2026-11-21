// Milestone funding (company registration) and founder contributions.
// Founders only — the router refuses employees on every route.
//
// Marking a line item paid creates the matching expense (project "Company
// registration") in the same serialized step, and un-marking deletes it, so
// the finance numbers never count a payment twice.

import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import { bool, boolCell, num } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { audit, auditUnqueued } from '../audit.ts';
import { COMPANY_FUND, computeMilestone, itemAmount, summarizeExpenses } from '../../shared/rules.ts';
import { istDate } from '../../shared/time.ts';

export const REGISTRATION_PROJECT = 'Company registration';

const money = z.number().min(0).max(1e9);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30.');

export const milestonePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    provider: z.string().trim().max(200),
    gstIncluded: z.boolean(),
    targetOverride: money.nullable(),
    notes: z.string().trim().max(2000),
    expectedUpdatedAt: z.string(),
  })
  .partial()
  .strict();

export const itemSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    amount: money,
    amountWithoutGst: money.nullable(),
    note: z.string().trim().max(500),
    expectedUpdatedAt: z.string(),
  })
  .partial()
  .strict();

export const contributionSchema = z.object({
  date: day,
  founder: z.string().trim().min(1).max(100),
  amount: z.number().positive('Enter an amount above zero.').max(1e9),
  note: z.string().trim().max(500).default(''),
});

const parseNullable = (v: string) => (v === '' ? null : num(v));

function itemView(i: Row, gstIncluded: boolean) {
  return {
    id: i.id,
    label: i.label,
    amount: num(i.amount),
    amountWithoutGst: parseNullable(i.amountWithoutGst),
    effectiveAmount: itemAmount({ amount: num(i.amount), amountWithoutGst: parseNullable(i.amountWithoutGst) }, gstIncluded),
    note: i.note,
    paid: bool(i.paid),
    paidBy: i.paidBy,
    paidAmount: num(i.paidAmount),
    paidAt: i.paidAt || null,
    updatedAt: i.updatedAt,
  };
}

export class MilestoneService {
  constructor(private readonly db: Db) {}

  /** Expense summary including founder contributions (shared with the finance page). */
  async financeSummary() {
    const [expenses, projects, contributions] = await Promise.all([this.db.all('Expenses'), this.db.all('Projects'), this.db.all('Contributions')]);
    const contributed = contributions.reduce((s, c) => s + num(c.amount), 0);
    return summarizeExpenses(
      expenses.map((e) => ({ amount: num(e.amount), paidBy: e.paidBy, project: e.project, repaid: bool(e.repaid) })),
      projects.map((p) => ({ name: p.name, dealTotal: num(p.dealTotal), received: num(p.received) })),
      contributed,
    );
  }

  async overview() {
    const [milestones, items, contributions, users, summary] = await Promise.all([
      this.db.all('Milestones'),
      this.db.all('MilestoneItems'),
      this.db.all('Contributions'),
      this.db.all('Users'),
      this.financeSummary(),
    ]);
    const views = milestones.map((m) => {
      const gst = bool(m.gstIncluded);
      const mine = items.filter((i) => i.milestoneId === m.id).sort((a, b) => num(a.sortOrder) - num(b.sortOrder));
      const list = mine.map((i) => itemView(i, gst));
      return {
        id: m.id,
        name: m.name,
        provider: m.provider,
        notes: m.notes,
        gstIncluded: gst,
        targetOverride: parseNullable(m.targetOverride),
        updatedAt: m.updatedAt,
        items: list,
        numbers: computeMilestone({
          items: list.map((i) => ({ amount: i.amount, amountWithoutGst: i.amountWithoutGst, paid: i.paid, paidAmount: i.paidAmount })),
          gstIncluded: gst,
          targetOverride: parseNullable(m.targetOverride),
          fundsAvailable: summary.cashAfterPayingMembers,
          stillToReceive: summary.stillToReceive,
        }),
      };
    });
    return {
      milestones: views,
      contributions: contributions
        .map((c) => ({ id: c.id, date: c.date, founder: c.founder, amount: num(c.amount), note: c.note }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      founders: users.filter((u) => (u.role === 'admin' || u.role === 'super_admin') && u.active !== 'FALSE').map((u) => u.name),
      summary,
    };
  }

  // ── super_admin edits ───────────────────────────────────────────────────

  async updateMilestone(actor: SessionUser, id: string, body: unknown, ip?: string) {
    const { expectedUpdatedAt, ...p } = milestonePatchSchema.parse(body);
    const patch: Record<string, string> = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.provider !== undefined) patch.provider = p.provider;
    if (p.notes !== undefined) patch.notes = p.notes;
    if (p.gstIncluded !== undefined) patch.gstIncluded = boolCell(p.gstIncluded);
    if (p.targetOverride !== undefined) patch.targetOverride = p.targetOverride === null ? '' : String(p.targetOverride);
    const { before, after } = await this.db.update('Milestones', id, patch, actor.id, expectedUpdatedAt);
    await audit(this.db, { actorId: actor.id, action: 'milestone.update', entity: 'Milestones', entityId: id, before, after, ip });
  }

  async addItem(actor: SessionUser, milestoneId: string, body: unknown, ip?: string) {
    const p = itemSchema.required({ label: true, amount: true }).parse(body);
    if (!(await this.db.find('Milestones', milestoneId))) throw new HttpError(404, 'Milestone not found.');
    const count = (await this.db.all('MilestoneItems')).filter((i) => i.milestoneId === milestoneId).length;
    const row = await this.db.insert(
      'MilestoneItems',
      {
        milestoneId,
        label: p.label,
        amount: String(p.amount),
        amountWithoutGst: p.amountWithoutGst == null ? '' : String(p.amountWithoutGst),
        note: p.note ?? '',
        sortOrder: String(count + 1),
        paid: 'FALSE',
      },
      actor.id,
    );
    await audit(this.db, { actorId: actor.id, action: 'milestone.item_add', entity: 'MilestoneItems', entityId: row.id, after: row, ip });
  }

  async updateItem(actor: SessionUser, id: string, body: unknown, ip?: string) {
    const { expectedUpdatedAt, ...p } = itemSchema.parse(body);
    const current = await this.db.find('MilestoneItems', id);
    if (!current) throw new HttpError(404, 'Item not found.');
    if (bool(current.paid) && (p.amount !== undefined || p.amountWithoutGst !== undefined)) {
      throw new HttpError(400, 'Un-mark this item as paid before changing its amount.');
    }
    const patch: Record<string, string> = {};
    if (p.label !== undefined) patch.label = p.label;
    if (p.note !== undefined) patch.note = p.note;
    if (p.amount !== undefined) patch.amount = String(p.amount);
    if (p.amountWithoutGst !== undefined) patch.amountWithoutGst = p.amountWithoutGst === null ? '' : String(p.amountWithoutGst);
    const { before, after } = await this.db.update('MilestoneItems', id, patch, actor.id, expectedUpdatedAt);
    await audit(this.db, { actorId: actor.id, action: 'milestone.item_update', entity: 'MilestoneItems', entityId: id, before, after, ip });
  }

  async removeItem(actor: SessionUser, id: string, ip?: string) {
    const current = await this.db.find('MilestoneItems', id);
    if (!current) throw new HttpError(404, 'Item not found.');
    if (bool(current.paid)) throw new HttpError(400, 'Un-mark this item as paid before deleting it.');
    const before = await this.db.remove('MilestoneItems', id, actor.id);
    await audit(this.db, { actorId: actor.id, action: 'milestone.item_delete', entity: 'MilestoneItems', entityId: id, before, ip });
  }

  // ── founders: payments ──────────────────────────────────────────────────

  async markPaid(actor: SessionUser, id: string, body: unknown, ip?: string) {
    const { paidBy } = z.object({ paidBy: z.string().trim().min(1).max(100) }).parse(body);
    const founders = (await this.db.all('Users')).filter((u) => u.role === 'admin' || u.role === 'super_admin').map((u) => u.name);
    if (paidBy !== COMPANY_FUND && !founders.includes(paidBy)) throw new HttpError(400, 'Choose Company Fund or a founder.');

    await this.db.exclusive(async () => {
      const [items, milestones] = await this.db.loadFresh(['MilestoneItems', 'Milestones']);
      const item = items.rows.find((i) => i.id === id);
      if (!item) throw new HttpError(404, 'Item not found.');
      if (bool(item.paid)) throw new HttpError(409, 'This item is already marked paid.');
      const gst = bool(milestones.rows.find((m) => m.id === item.milestoneId)?.gstIncluded);
      const amount = itemAmount({ amount: num(item.amount), amountWithoutGst: parseNullable(item.amountWithoutGst) }, gst);
      if (amount <= 0) throw new HttpError(400, 'Set the amount for this item before marking it paid.');

      const now = this.db.now();
      const expense = await this.db.insertUnqueued(
        'Expenses',
        { date: istDate(now), item: item.label, amount: String(amount), paidBy, project: REGISTRATION_PROJECT, repaid: 'FALSE' },
        actor.id,
      );
      const { before, after } = await this.db.updateUnqueued(
        'MilestoneItems',
        id,
        { paid: 'TRUE', paidBy, paidAmount: String(amount), paidAt: now.toISOString(), expenseId: expense.id },
        actor.id,
      );
      await auditUnqueued(this.db, [
        { actorId: actor.id, action: 'milestone.item_paid', entity: 'MilestoneItems', entityId: id, before, after: { ...after, expense }, ip },
      ]);
    });
  }

  async markUnpaid(actor: SessionUser, id: string, ip?: string) {
    await this.db.exclusive(async () => {
      const [items, expenses] = await this.db.loadFresh(['MilestoneItems', 'Expenses']);
      const item = items.rows.find((i) => i.id === id);
      if (!item) throw new HttpError(404, 'Item not found.');
      if (!bool(item.paid)) throw new HttpError(409, 'This item is not marked paid.');
      const expense = expenses.rows.find((e) => e.id === item.expenseId);
      if (expense) await this.db.removeUnqueued('Expenses', expense.id, actor.id);
      const { before, after } = await this.db.updateUnqueued(
        'MilestoneItems',
        id,
        { paid: 'FALSE', paidBy: '', paidAmount: '', paidAt: '', expenseId: '' },
        actor.id,
      );
      await auditUnqueued(this.db, [
        { actorId: actor.id, action: 'milestone.item_unpaid', entity: 'MilestoneItems', entityId: id, before: { ...before, expense }, after, ip },
      ]);
    });
  }

  // ── founder contributions ───────────────────────────────────────────────

  async addContribution(actor: SessionUser, body: unknown, ip?: string) {
    const c = contributionSchema.parse(body);
    const row = await this.db.insert('Contributions', { ...c, amount: String(c.amount) }, actor.id);
    await audit(this.db, { actorId: actor.id, action: 'contribution.add', entity: 'Contributions', entityId: row.id, after: row, ip });
  }

  async removeContribution(actor: SessionUser, id: string, ip?: string) {
    const before = await this.db.remove('Contributions', id, actor.id);
    await audit(this.db, { actorId: actor.id, action: 'contribution.delete', entity: 'Contributions', entityId: id, before, ip });
  }
}
