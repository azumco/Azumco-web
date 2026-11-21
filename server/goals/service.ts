// Goals and tasks. Founders see everything and edit titles, dates, owner and
// support. ONLY the goal's owner may change its status (including Done and
// undoing Done) — super_admin included. An employee sees only tasks she owns
// or supports.
//
// Owners and support are stored as display names (support is "; "-separated):
// the seed tasks name people, and a four-person team has unique names. An
// employee matches a task by her full name or her first name.

import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { isFounder } from '../leads/access.ts';
import { audit } from '../audit.ts';
import { GOAL_STATUSES, timeLeft } from '../../shared/rules.ts';
import { istDate } from '../../shared/time.ts';

const day = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const goalSchema = z.object({
  goal: z.string().trim().min(1).max(150),
  task: z.string().trim().min(1).max(300),
  owner: z.string().trim().min(1).max(100),
  support: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  start: day.default(''),
  deadline: day.default(''),
  status: z.enum(GOAL_STATUSES).default('Not Started'),
  note: z.string().trim().max(300).default(''),
});

/** Is `user` this goal's owner? Matched by full name, or by first name. */
export function isOwner(task: Record<string, string>, user: Pick<SessionUser, 'name'>): boolean {
  const owner = (task.owner ?? '').trim().toLowerCase();
  const full = user.name.trim().toLowerCase();
  return Boolean(owner) && (owner === full || owner === full.split(' ')[0]);
}

const splitSupport = (s: string) => s.split(';').map((x) => x.trim()).filter(Boolean);

function involves(task: Row, user: SessionUser): boolean {
  const names = [user.name, user.name.split(' ')[0]].map((n) => n.toLowerCase());
  const people = [task.owner, ...splitSupport(task.support)].map((n) => n.toLowerCase());
  return people.some((p) => names.includes(p) || names.includes(p.split(' ')[0]));
}

export function goalView(g: Row, today: string) {
  return {
    id: g.id,
    goal: g.goal,
    task: g.task,
    owner: g.owner,
    support: splitSupport(g.support),
    start: g.start,
    deadline: g.deadline,
    status: g.status || 'Not Started',
    note: g.note ?? '',
    timeLeft: timeLeft(g.deadline, g.status, today),
    updatedAt: g.updatedAt,
  };
}

export class GoalService {
  constructor(private readonly db: Db) {}

  async list(user: SessionUser) {
    const rows = await this.db.all('Goals');
    const today = istDate(this.db.now());
    return rows.filter((g) => isFounder(user) || involves(g, user)).map((g) => ({ ...goalView(g, today), canChangeStatus: isOwner(g, user) }));
  }

  async create(user: SessionUser, body: unknown) {
    if (!isFounder(user)) throw new HttpError(403, 'Only founders can add tasks.');
    const g = goalSchema.parse(body);
    return this.db.insert('Goals', { ...g, support: g.support.join('; ') }, user.id);
  }

  async update(user: SessionUser, id: string, body: unknown, ip?: string) {
    const row = await this.db.find('Goals', id);
    if (!row || (!isFounder(user) && !involves(row, user))) throw new HttpError(404, 'Task not found.');
    const { expectedUpdatedAt, ...rest } = (body ?? {}) as Record<string, unknown> & { expectedUpdatedAt?: string };

    // Status belongs to the owner alone — checked before anything else, for everyone.
    if ('status' in rest && rest.status !== row.status && !isOwner(row, user)) {
      throw new HttpError(403, `Only ${row.owner} can change the status of this goal.`, 'NOT_GOAL_OWNER');
    }

    let patch: Record<string, string>;
    if (isFounder(user)) {
      const g = goalSchema.partial().parse(rest);
      // Defaults must not sneak a status/note change into a partial edit.
      patch = Object.fromEntries(
        Object.entries(g)
          .filter(([k, v]) => v !== undefined && k in rest)
          .map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : String(v)]),
      );
    } else {
      const g = z.object({ status: z.enum(GOAL_STATUSES) }).strict().safeParse(rest);
      if (!g.success) throw new HttpError(400, 'You can only change the status of your tasks.');
      patch = { status: g.data.status };
    }
    const { before, after } = await this.db.update('Goals', id, patch, user.id, expectedUpdatedAt as string | undefined);
    if (before.status !== after.status) {
      await audit(this.db, { actorId: user.id, action: 'goal.status', entity: 'Goals', entityId: id, before: { status: before.status }, after: { status: after.status }, ip });
    }
    return { ...goalView(after, istDate(this.db.now())), canChangeStatus: isOwner(after, user) };
  }

  async remove(user: SessionUser, id: string) {
    if (!isFounder(user)) throw new HttpError(403, 'Only founders can delete tasks.');
    await this.db.remove('Goals', id, user.id);
  }
}
