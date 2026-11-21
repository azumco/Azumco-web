// Business rules shared by the server and the team UI, so the numbers the UI
// shows are computed exactly as the server computes them.

import { daysBetween } from './time.ts';

// ─── Leads ──────────────────────────────────────────────────────────────────

export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiating', 'Won', 'Lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const RATINGS = ['Good', 'Intermediate', 'Bad'] as const;
export const DEAL_TYPES = ['One-time', 'Monthly'] as const;

/** Call outcomes (Log a call screen). `reached` = a person was actually spoken to. */
export const CALL_OUTCOMES = [
  { value: 'No answer', reached: false },
  { value: 'Busy · call later', reached: true },
  { value: 'Interested', reached: true },
  { value: 'Call booked', reached: true },
  { value: 'Not interested', reached: true },
  { value: 'Wrong number', reached: false },
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number]['value'];

/** "What do they need?" — stored comma-separated in the lead's `need`. */
export const NEEDS = ['Website', 'Social media', 'Ads', 'Branding', 'App', 'Not sure'] as const;
/** "Next step" choices. */
export const NEXT_STEPS = ['Call again', 'Send WhatsApp', 'Book discovery call', 'Drop'] as const;

/** Status pill label and colour family. */
export function statusTone(status: string): { label: string; tone: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost' } {
  switch (status) {
    case 'Contacted': return { label: 'Contacted', tone: 'contacted' };
    case 'Qualified': return { label: 'Qualified', tone: 'qualified' };
    case 'Proposal Sent': return { label: 'Proposal', tone: 'proposal' };
    case 'Negotiating': return { label: 'Negotiating', tone: 'proposal' };
    case 'Won': return { label: 'Won', tone: 'won' };
    case 'Lost': return { label: 'Lost', tone: 'lost' };
    default: return { label: 'New', tone: 'new' };
  }
}

export const isReachedOutcome = (outcome: string) => CALL_OUTCOMES.some((o) => o.value === outcome && o.reached);

export const LEAD_SOURCES = ['Google Places', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Cold call', 'Other'] as const;

export const BUSINESS_CATEGORIES = [
  'Gym / Fitness', 'Restaurant / Café', 'Salon / Spa', 'Clinic / Doctor', 'Dentist', 'Coaching / Education', 'Retail shop',
  'Hotel', 'Real estate agency', 'Boutique', 'Jewellery store', 'Car dealer', 'Bakery', 'Pharmacy', 'Yoga studio',
  'Interior designer', 'Event planner', 'School', 'Hospital',
] as const;

// ─── Assignment countdown ───────────────────────────────────────────────────

export type Urgency = 'normal' | 'warning' | 'urgent' | 'expired';

const HOUR = 3_600_000;

export function urgencyOf(msLeft: number): Urgency {
  if (msLeft <= 0) return 'expired';
  if (msLeft <= 3 * HOUR) return 'urgent';
  if (msLeft <= 12 * HOUR) return 'warning';
  return 'normal';
}

/** "5h 12m", "45m", "2d 3h". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Commission ─────────────────────────────────────────────────────────────

export interface CommissionRates {
  qualifiedFee: number;
  oneTimePct: number;
  monthlyPct: number;
}

export interface CommissionInput {
  callHappened: boolean;
  status: string;
  clientPaid: boolean;
  dealType: string;
  dealValue: number;
}

/**
 * Commission for one lead =
 *   qualified fee            if the discovery call happened
 * + deal value × rate        only when status is Won AND the client has paid
 *   (one-time % or monthly % by deal type)
 */
export function commissionFor(lead: CommissionInput, rates: CommissionRates): number {
  let total = lead.callHappened ? rates.qualifiedFee : 0;
  if (lead.status === 'Won' && lead.clientPaid && lead.dealValue > 0) {
    const pct = lead.dealType === 'Monthly' ? rates.monthlyPct : rates.oneTimePct;
    total += (lead.dealValue * pct) / 100;
  }
  return Math.round(total * 100) / 100;
}

// ─── Goals ──────────────────────────────────────────────────────────────────

export const GOAL_STATUSES = ['Not Started', 'In Progress', 'Done', 'On Hold'] as const;

export type TimeLeft =
  | { kind: 'done'; label: string }
  | { kind: 'none'; label: string }
  | { kind: 'left'; days: number; label: string }
  | { kind: 'today'; label: string }
  | { kind: 'overdue'; days: number; label: string };

/** Time left on a task, by IST calendar day. `today` is "YYYY-MM-DD". */
export function timeLeft(deadline: string, status: string, today: string): TimeLeft {
  if (status === 'Done') return { kind: 'done', label: 'Done' };
  if (!deadline) return { kind: 'none', label: 'No deadline' };
  const days = daysBetween(today, deadline);
  if (days > 0) return { kind: 'left', days, label: `${days} day${days === 1 ? '' : 's'} left` };
  if (days === 0) return { kind: 'today', label: 'Due today' };
  const over = -days;
  return { kind: 'overdue', days: over, label: `Overdue ${over} day${over === 1 ? '' : 's'}` };
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export const COMPANY_FUND = 'Company Fund';

export interface ExpenseInput {
  amount: number;
  paidBy: string;
  project: string;
  repaid: boolean;
}

export interface ProjectInput {
  name: string;
  dealTotal: number;
  received: number;
}

export interface ExpenseSummary {
  received: number;
  /** Money founders put into the company. Counts as company funds. */
  contributions: number;
  spentByCompany: number;
  cashInCompany: number;
  stillToReceive: number;
  owedToMembers: number;
  cashAfterPayingMembers: number;
  members: { name: string; spent: number; repaid: number; toPay: number }[];
  projects: { name: string; dealTotal: number; received: number; pending: number; expenses: number; profit: number }[];
}

/**
 * - spent by company = expenses paid from the Company Fund + member expenses already repaid
 * - cash in company  = money received + founder contributions − spent by company
 * - owed to members  = member expenses not yet repaid
 */
export function summarizeExpenses(expenses: ExpenseInput[], projects: ProjectInput[], contributions = 0): ExpenseSummary {
  const received = projects.reduce((s, p) => s + p.received, 0);
  const stillToReceive = projects.reduce((s, p) => s + Math.max(0, p.dealTotal - p.received), 0);

  let companyPaid = 0;
  const members = new Map<string, { spent: number; repaid: number }>();
  for (const e of expenses) {
    if (e.paidBy === COMPANY_FUND) {
      companyPaid += e.amount;
      continue;
    }
    const m = members.get(e.paidBy) ?? { spent: 0, repaid: 0 };
    m.spent += e.amount;
    if (e.repaid) m.repaid += e.amount;
    members.set(e.paidBy, m);
  }
  const repaidTotal = [...members.values()].reduce((s, m) => s + m.repaid, 0);
  const owedToMembers = [...members.values()].reduce((s, m) => s + m.spent - m.repaid, 0);
  const spentByCompany = companyPaid + repaidTotal;
  const cashInCompany = received + contributions - spentByCompany;

  return {
    received,
    contributions,
    spentByCompany,
    cashInCompany,
    stillToReceive,
    owedToMembers,
    cashAfterPayingMembers: cashInCompany - owedToMembers,
    members: [...members].map(([name, m]) => ({ name, spent: m.spent, repaid: m.repaid, toPay: m.spent - m.repaid })),
    projects: projects.map((p) => {
      const charged = expenses.filter((e) => e.project === p.name).reduce((s, e) => s + e.amount, 0);
      return {
        name: p.name,
        dealTotal: p.dealTotal,
        received: p.received,
        pending: Math.max(0, p.dealTotal - p.received),
        expenses: charged,
        profit: p.received - charged,
      };
    }),
  };
}

// ─── Milestone (company registration funding) ───────────────────────────────

/** "Equal share per founder" divides by this (the three founders). */
export const FOUNDER_SHARE_COUNT = 3;

export interface MilestoneItemInput {
  amount: number;
  /** Amount when GST registration is not included; null = same as amount. */
  amountWithoutGst: number | null;
  paid: boolean;
  /** What was actually recorded as an expense when marked paid. */
  paidAmount: number;
}

export const itemAmount = (item: Pick<MilestoneItemInput, 'amount' | 'amountWithoutGst'>, gstIncluded: boolean) =>
  !gstIncluded && item.amountWithoutGst !== null ? item.amountWithoutGst : item.amount;

export interface MilestoneNumbers {
  target: number;
  paid: number;
  unpaid: number;
  fundsAvailable: number;
  stillNeeded: number;
  expectedAfterPending: number;
  sharePerFounder: number;
  sharePerFounderAfterPending: number;
  percent: number;
  fullyFunded: boolean;
}

/**
 * - target            = sum of line items (or the super admin's override)
 * - still needed      = unpaid line items − funds available, never below zero
 * - expected after pending income = still needed − money still to receive, never below zero
 * - shares            = each divided by the three founders, rounded up to whole rupees
 *
 * Paid items are already reflected in the expense summary (their expense
 * lowered the funds), so they are taken out of "unpaid" — never counted twice.
 */
export function computeMilestone(opts: {
  items: MilestoneItemInput[];
  gstIncluded: boolean;
  targetOverride: number | null;
  fundsAvailable: number;
  stillToReceive: number;
}): MilestoneNumbers {
  const itemsTotal = opts.items.reduce((s, i) => s + itemAmount(i, opts.gstIncluded), 0);
  const paid = opts.items.filter((i) => i.paid).reduce((s, i) => s + i.paidAmount, 0);
  const target = opts.targetOverride ?? itemsTotal;
  const unpaid = Math.max(0, target - paid);
  const stillNeeded = Math.max(0, unpaid - opts.fundsAvailable);
  const expectedAfterPending = Math.max(0, stillNeeded - opts.stillToReceive);
  const funded = target - stillNeeded;
  return {
    target,
    paid,
    unpaid,
    fundsAvailable: opts.fundsAvailable,
    stillNeeded,
    expectedAfterPending,
    sharePerFounder: Math.ceil(stillNeeded / FOUNDER_SHARE_COUNT),
    sharePerFounderAfterPending: Math.ceil(expectedAfterPending / FOUNDER_SHARE_COUNT),
    percent: target > 0 ? Math.max(0, Math.min(100, Math.round((funded / target) * 1000) / 10)) : 100,
    fullyFunded: stillNeeded === 0,
  };
}
