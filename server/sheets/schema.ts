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
    'jobTitle', 'canReceiveLeads', 'calendarColor', 'meetLink',
  ],
  Sessions: ['tokenHash', 'userId', 'sessionVersion', 'csrfToken', 'expiresAt', 'ip', 'userAgent'],
  Settings: ['key', 'value'],
  Audit: ['at', 'actorId', 'action', 'entity', 'entityId', 'before', 'after', 'ip'],
  Meta: ['key', 'value'],

  // Leads. Google-sourced leads hold ONLY placeId + category + city + searchedAt
  // until a person confirms the contact; businessName/phone stay empty until then.
  Leads: [
    'dateAdded', 'addedBy', 'businessName', 'category', 'contactPerson', 'phone', 'city',
    'websiteOrInstagram', 'source', 'serviceInterest', 'placeId', 'state', 'searchedAt', 'phoneSource',
    'confirmedAt', 'confirmedBy',
    'assignedTo', 'assignedAt', 'expiresAt', 'expiryApplies', 'timerStoppedAt',
    'contacted', 'firstCallDate', 'callOutcome', 'rating', 'decisionMaker', 'need',
    'nextStep', 'followUpDate', 'discoveryCallDate', 'callHappened', 'status', 'dealType',
    'dealValue', 'clientPaid', 'commissionPaid', 'commissionPaidAt', 'notes',
    // Added later (appended, never reordered). origin: 'team' (added by a person)
    // or 'find_clients'. gc*: "Check against Google" — the place ID, status,
    // per-field RESULT CODES (never Google's values), candidate place IDs, who and when.
    'area', 'origin', 'gcStatus', 'gcPlaceId', 'gcFields', 'gcCandidates', 'gcCheckedAt', 'gcCheckedBy',
  ],
  CallLog: ['leadId', 'at', 'userId', 'outcome', 'note'],
  /** One row per expired assignment. The row id is `${leadId}:${expiresAt}`, which makes the sweep idempotent. */
  Expirations: ['leadId', 'assigneeId', 'assignedAt', 'expiresAt'],
  /**
   * Ledger of paid Google Places calls: one row per claimed call. The monthly
   * count is the number of 'claimed' rows for the IST month; an unbilled
   * rejection flips its row to 'released'. Holds no Places content.
   */
  PlacesClaims: ['yearMonth', 'sku', 'status', 'actorId'],
  Availability: ['founderId', 'date', 'start', 'end', 'slotMinutes', 'repeatWeekly', 'repeatUntil'],
  Bookings: [
    'leadId', 'founderId', 'date', 'start', 'end', 'status', 'clientName', 'phone', 'mode', 'link',
    'notes', 'bookedBy', 'callHappened',
  ],
  Notifications: ['userId', 'type', 'message', 'refId', 'readAt'],
  Expenses: ['date', 'item', 'amount', 'paidBy', 'project', 'repaid'],
  Projects: ['name', 'dealTotal', 'received', 'status'],
  Goals: ['goal', 'task', 'owner', 'support', 'start', 'deadline', 'status', 'note'],
  Milestones: ['name', 'provider', 'gstIncluded', 'targetOverride', 'notes'],
  /** amountWithoutGst: the amount when GST registration is not included ('' = same). */
  MilestoneItems: [
    'milestoneId', 'label', 'amount', 'amountWithoutGst', 'note', 'sortOrder',
    'paid', 'paidBy', 'paidAmount', 'paidAt', 'expenseId',
  ],
  /** Founder money put into the company. Counts as company funds. */
  Contributions: ['date', 'founder', 'amount', 'note'],
} as const;

export type TabName = keyof typeof TABS;

export function columnsOf(tab: TabName): string[] {
  return [...SYSTEM_COLUMNS, ...TABS[tab]];
}

/** All values are strings in storage; domain code parses what it needs. */
export type Row = Record<string, string> & { id: string; createdAt: string; updatedAt: string; updatedBy: string };
