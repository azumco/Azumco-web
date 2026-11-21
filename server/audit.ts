// Audit trail for sensitive actions: who, what, when, before/after.
//
// Values are stored as JSON with secrets stripped. An audit write failing must
// never undo or fail the action it records, so errors are logged and swallowed.

import type { Db } from './sheets/db.ts';
import { log } from './lib/log.ts';

const REDACT = new Set(['passwordHash', 'tokenHash', 'csrfToken', 'password', 'tempPassword']);

function clean(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return String(value);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = REDACT.has(k) ? '[redacted]' : v;
  return JSON.stringify(out);
}

export interface AuditEntry {
  /** Optional stable id, for entries that must be recorded exactly once. */
  id?: string;
  actorId: string;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

function toRow(db: Db, e: AuditEntry): Record<string, string> {
  return {
    ...(e.id ? { id: e.id } : {}),
    at: db.now().toISOString(),
    actorId: e.actorId,
    action: e.action,
    entity: e.entity ?? '',
    entityId: e.entityId ?? '',
    before: clean(e.before),
    after: clean(e.after),
    ip: e.ip ?? '',
  };
}

/** Use INSIDE db.exclusive(). Skips entries whose id already exists. */
export async function auditUnqueued(db: Db, entries: AuditEntry[]): Promise<void> {
  if (!entries.length) return;
  try {
    const withIds = entries.filter((e) => e.id);
    let skip = new Set<string>();
    if (withIds.length) skip = new Set((await db.loadFresh(['Audit']))[0].rows.map((r) => r.id));
    const rows = entries.filter((e) => !e.id || !skip.has(e.id)).map((e) => toRow(db, e));
    await db.insertManyUnqueued('Audit', rows, entries[0].actorId || 'system');
  } catch (err) {
    log.error('audit write failed', { action: entries[0].action, error: (err as Error).message });
  }
}

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.exclusive(() => auditUnqueued(db, [e]));
}
