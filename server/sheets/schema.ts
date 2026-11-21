// Every tab in the spreadsheet and its columns.
//
// Columns are matched by HEADER NAME, never by position, so a column can be
// moved in the spreadsheet by hand without breaking anything, and new columns
// added here are appended to an existing tab's header on the next start.
//
// Every tab gets the four system columns first. Rows are addressed by `id`
// (a UUID) only; row numbers are looked up fresh at write time.

export const SYSTEM_COLUMNS = ['id', 'createdAt', 'updatedAt', 'updatedBy'] as const;

export const TABS = {
  Users: [
    'email', 'name', 'role', 'active', 'passwordHash', 'mustChangePassword',
    'failedAttempts', 'lockedUntil', 'sessionVersion', 'lastLoginAt',
  ],
  Sessions: ['tokenHash', 'userId', 'sessionVersion', 'csrfToken', 'expiresAt', 'ip', 'userAgent'],
  Settings: ['key', 'value'],
  Audit: ['at', 'actorId', 'action', 'entity', 'entityId', 'before', 'after', 'ip'],
  Meta: ['key', 'value'],

  // Phase 2+
  Leads: [
    'dateAdded', 'addedBy', 'businessName', 'category', 'contactPerson', 'phone', 'city',
    'websiteOrInstagram', 'source', 'serviceInterest', 'placeId', 'phoneSource', 'phoneFetchedAt',
    'assignedTo', 'contacted', 'firstCallDate', 'callOutcome', 'rating', 'decisionMaker', 'need',
    'nextStep', 'followUpDate', 'discoveryCallDate', 'callHappened', 'status', 'dealType',
    'dealValue', 'clientPaid', 'commissionPaid', 'commissionPaidAt', 'notes',
  ],
  CallLog: ['leadId', 'at', 'userId', 'outcome', 'note'],
  PlacesUsage: ['yearMonth', 'sku', 'count'],
  PlacesClaims: ['yearMonth', 'sku', 'status', 'actorId', 'note'],
  Availability: ['founderId', 'date', 'start', 'end', 'slotMinutes', 'repeatWeekly', 'repeatUntil'],
  Bookings: [
    'leadId', 'founderId', 'date', 'start', 'end', 'status', 'clientName', 'phone', 'mode', 'link',
    'notes', 'bookedBy', 'callHappened',
  ],
  Notifications: ['userId', 'type', 'message', 'refId', 'readAt'],
  Expenses: ['date', 'item', 'amount', 'paidBy', 'project', 'repaid'],
  Projects: ['name', 'dealTotal', 'received', 'status'],
  Goals: ['goal', 'task', 'owner', 'support', 'start', 'deadline', 'status'],
} as const;

export type TabName = keyof typeof TABS;

export function columnsOf(tab: TabName): string[] {
  return [...SYSTEM_COLUMNS, ...TABS[tab]];
}

/** All values are strings in storage; domain code parses what it needs. */
export type Row = Record<string, string> & { id: string; createdAt: string; updatedAt: string; updatedBy: string };
