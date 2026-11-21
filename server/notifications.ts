// In-app notifications, with a channel interface so email can be added later
// without touching the callers.
//
// To add email: implement NotificationChannel (e.g. an EmailChannel that looks
// up each recipient's address and sends via a provider), then register it in
// `channels` below. In-app delivery stays the source of truth.

import type { Db } from './sheets/db.ts';
import { log } from './lib/log.ts';

export interface Notice {
  /** Optional stable id. Supplying one makes delivery idempotent (re-sending is a no-op). */
  id?: string;
  userId: string;
  type: string;
  message: string;
  refId?: string;
}

export interface NotificationChannel {
  name: string;
  deliver(notices: Notice[]): Promise<void>;
}

/** Additional delivery channels (email, WhatsApp…). Empty for now. */
export const channels: NotificationChannel[] = [];

/**
 * Record notifications. Must be called INSIDE db.exclusive(): it reads the tab
 * fresh to skip ids that already exist, which is what makes it idempotent.
 */
export async function notifyUnqueued(db: Db, notices: Notice[], actorId = 'system'): Promise<void> {
  if (!notices.length) return;
  const [state] = await db.loadFresh(['Notifications']);
  const existing = new Set(state.rows.map((r) => r.id));
  const fresh = notices.filter((n) => !n.id || !existing.has(n.id));
  await db.insertManyUnqueued(
    'Notifications',
    fresh.map((n) => ({ ...(n.id ? { id: n.id } : {}), userId: n.userId, type: n.type, message: n.message, refId: n.refId ?? '', readAt: '' })),
    actorId,
  );
  for (const ch of channels) {
    // A failing extra channel must not undo the in-app record.
    await ch.deliver(fresh).catch((err) => log.warn('notification channel failed', { channel: ch.name, error: (err as Error).message }));
  }
}

export const notify = (db: Db, notices: Notice[], actorId?: string) => db.exclusive(() => notifyUnqueued(db, notices, actorId));

/** Founders: every active admin and the super_admin. */
export async function founderIds(db: Db): Promise<string[]> {
  return (await db.all('Users'))
    .filter((u) => (u.role === 'admin' || u.role === 'super_admin') && u.active !== 'FALSE')
    .map((u) => u.id);
}
