// Goals and tasks. Founders see and edit everything. An employee sees only
// tasks where she is the owner or in support, and may change only their status.
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
});

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
    timeLeft: timeLeft(g.deadline, g.status, today),
    updatedAt: g.updatedAt,
  };
}

export class GoalService {
  constructor(private readonly db: Db) {}

  async list(user: SessionUser) {
    const rows = await this.db.all('Goals');
    const today = istDate(this.db.now());
    return rows.filter((g) => isFounder(user) || involves(g, user)).map((g) => goalView(g, today));
  }

  async create(user: SessionUser, body: unknown) {
    if (!isFounder(user)) throw new HttpError(403, 'Only founders can add tasks.');
    const g = goalSchema.parse(body);
    return this.db.insert('Goals', { ...g, support: g.support.join('; ') }, user.id);
  }

  async update(user: SessionUser, id: string, body: unknown) {
    const row = await this.db.find('Goals', id);
    if (!row || (!isFounder(user) && !involves(row, user))) throw new HttpError(404, 'Task not found.');
    const { expectedUpdatedAt, ...rest } = (body ?? {}) as Record<string, unknown> & { expectedUpdatedAt?: string };
    let patch: Record<string, string>;
    if (isFounder(user)) {
      const g = goalSchema.partial().parse(rest);
      patch = Object.fromEntries(
        Object.entries(g).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : String(v)]),
      );
    } else {
      const g = z.object({ status: z.enum(GOAL_STATUSES) }).strict().safeParse(rest);
      if (!g.success) throw new HttpError(400, 'You can only change the status of your tasks.');
      patch = { status: g.data.status };
    }
    const { after } = await this.db.update('Goals', id, patch, user.id, expectedUpdatedAt as string | undefined);
    return goalView(after, istDate(this.db.now()));
  }

  async remove(user: SessionUser, id: string) {
    if (!isFounder(user)) throw new HttpError(403, 'Only founders can delete tasks.');
    await this.db.remove('Goals', id, user.id);
  }
}
