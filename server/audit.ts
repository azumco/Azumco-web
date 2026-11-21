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
  actorId: string;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  try {
    await db.insert(
      'Audit',
      {
        at: db.now().toISOString(),
        actorId: e.actorId,
        action: e.action,
        entity: e.entity ?? '',
        entityId: e.entityId ?? '',
        before: clean(e.before),
        after: clean(e.after),
        ip: e.ip ?? '',
      },
      e.actorId || 'system',
    );
  } catch (err) {
    log.error('audit write failed', { action: e.action, error: (err as Error).message });
  }
}
