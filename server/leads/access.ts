// Who may see and change a lead, and whether an assignment is still live.
//
// The server clock (db.now) is the only clock that matters. A lead whose
// assignment timer has run out is treated as unassigned on EVERY read, even
// before the sweep has written that down — so access is refused the moment the
// deadline passes, not when the next sweep happens to run.

import type { Row } from '../sheets/schema.ts';
import { bool } from '../sheets/db.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { formatDateTime } from '../../shared/time.ts';

export const isFounder = (user: Pick<SessionUser, 'role'>) => user.role === 'admin' || user.role === 'super_admin';

/** The timer is running: an expiring assignment with no qualifying attempt yet. */
export const timerRunning = (lead: Row) =>
  Boolean(lead.assignedTo) && bool(lead.expiryApplies) && !lead.timerStoppedAt && Boolean(lead.expiresAt);

/** Expired by the clock but not yet swept. */
export const isLapsed = (lead: Row, now: Date) => timerRunning(lead) && now.getTime() >= Date.parse(lead.expiresAt);

/** The assignee as of `now` ('' when unassigned or lapsed). */
export const effectiveAssignee = (lead: Row, now: Date) => (isLapsed(lead, now) ? '' : lead.assignedTo);

export const ASSIGNMENT_EXPIRED = 'ASSIGNMENT_EXPIRED';

/**
 * Throw unless `user` may work on `lead` right now. Founders always may.
 * An employee may only touch a lead assigned to her whose timer has not run out.
 */
const expiredError = (expiresAt: string) =>
  new HttpError(
    409,
    `This lead expired at ${formatDateTime(expiresAt)} because no call was logged in time, and it went back to the founders. Ask a founder if you want it reassigned.`,
    ASSIGNMENT_EXPIRED,
  );

/**
 * Pass `expirations` (the Expirations tab) so that a lead already swept back to
 * Unclaimed still tells its former assignee WHY, instead of a bare 404.
 */
export function assertLeadAccess(user: SessionUser, lead: Row | undefined, now: Date, expirations: Row[] = []): asserts lead is Row {
  if (!lead) throw new HttpError(404, 'Lead not found.');
  if (isFounder(user)) return;
  if (lead.assignedTo === user.id && isLapsed(lead, now)) throw expiredError(lead.expiresAt);
  if (lead.assignedTo !== user.id) {
    const lapsed = expirations
      .filter((e) => e.leadId === lead.id && e.assigneeId === user.id)
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0];
    if (lapsed) throw expiredError(lapsed.expiresAt);
    // Same response for "not yours" and "does not exist": no probing other leads.
    throw new HttpError(404, 'Lead not found.');
  }
}
