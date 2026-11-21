// Shapes returned by the team API.

export type Role = 'super_admin' | 'admin' | 'employee';

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  jobTitle: string;
}

export interface Session {
  user: TeamUser;
  csrfToken: string;
}

export const isFounder = (u: { role: Role }) => u.role === 'admin' || u.role === 'super_admin';

export interface Lead {
  id: string;
  label: string;
  isGoogle: boolean;
  confirmed: boolean;
  needsLiveLookup: boolean;
  dateAdded: string;
  addedBy: string;
  addedByName: string;
  businessName: string;
  category: string;
  contactPerson: string;
  phone: string;
  city: string;
  state: string;
  lastNote: string;
  websiteOrInstagram: string;
  source: string;
  serviceInterest: string;
  phoneSource: string;
  confirmedAt: string | null;
  assignedTo: string;
  assigneeName: string;
  assignedAt: string | null;
  expiresAt: string | null;
  timerRunning: boolean;
  msLeft: number | null;
  contacted: boolean;
  firstCallDate: string;
  attempts: number;
  lastAttemptAt: string | null;
  callOutcome: string;
  rating: string;
  decisionMaker: string;
  need: string;
  nextStep: string;
  followUpDate: string;
  followUp: 'overdue' | 'today' | 'upcoming' | 'none';
  discoveryCallDate: string;
  callHappened: boolean;
  status: string;
  dealType: string;
  dealValue: number;
  clientPaid: boolean;
  commission: number;
  commissionPaid: number;
  commissionPaidAt: string | null;
  notes: string;
  updatedAt: string;
}

export interface LeadsResponse {
  leads: Lead[];
  serverNow: string;
}

export interface CallEntry {
  id: string;
  at: string;
  outcome: string;
  note: string;
  by: string;
}

export interface PlacesUsage {
  yearMonth: string;
  used: number;
  cap: number;
  remaining: number;
  searches: number;
  lookups: number;
  paused: boolean;
}

export interface Slot {
  founderId: string;
  date: string;
  start: string;
  end: string;
  booked: boolean;
}

export interface Booking {
  id: string;
  leadId: string;
  founderId: string;
  founderName: string;
  bookedByName: string;
  date: string;
  start: string;
  end: string;
  status: string;
  clientName: string;
  phone: string;
  mode: string;
  link: string;
  notes: string;
  callHappened: boolean | null;
  leadExists: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  jobTitle: string;
  canReceiveLeads: boolean;
  calendarColor: string;
}

export const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] ?? '';

/** "Good morning/afternoon/evening" by the current hour in India (IST). */
export function istGreeting(now = new Date()) {
  const h = Number(now.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
