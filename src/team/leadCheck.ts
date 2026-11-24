// "Check against Google" on the client: API calls, how a status is shown, and
// a hand-off of the latest result between the list and the check screen.
//
// The hand-off lives in this tab's memory only (never localStorage) and holds
// what the server just returned, so opening a lead right after checking it
// does not cost a second Google call. A reload forgets it.

import { api } from './api';
import { CHECK_FIELDS, type CheckField, type CheckStatus, type FieldCodes } from '../../shared/leadCheck';
import type { Lead, PlacesUsage } from './types';
import type { TagTone } from './ui';

export { canRunLeadCheck } from '../../shared/leadCheck';

export interface PlaceView {
  placeId: string;
  businessName: string;
  phone: string;
  area: string;
  city: string;
  website: string;
  category: string;
  address: string;
  rating: number | null;
  ratingCount: number | null;
  mapsUrl: string;
}
export interface Offer { token: string; place: PlaceView }

export interface CheckResult {
  leadId: string;
  status: CheckStatus;
  fields?: FieldCodes;
  google?: Offer;
  candidates?: Offer[];
  query?: string;
  calls: number;
  usage?: PlacesUsage;
}

const latest = new Map<string, CheckResult>();
export const rememberCheck = (r: CheckResult) => void latest.set(r.leadId, r);
export const recallCheck = (leadId: string) => latest.get(leadId);
export const forgetCheck = (leadId: string) => void latest.delete(leadId);

export const runCheck = async (leadId: string, query?: string) => {
  const r = await api<CheckResult>('POST', `/leads/${leadId}/google-check`, query ? { query } : {});
  rememberCheck(r);
  return r;
};
export const pickCandidate = async (leadId: string, token: string) => {
  const r = await api<CheckResult>('POST', `/leads/${leadId}/google-check/pick`, { token });
  rememberCheck(r);
  return r;
};
export const viewCheck = async (leadId: string) => {
  const r = await api<CheckResult>('POST', `/leads/${leadId}/google-check/view`, {});
  rememberCheck(r);
  return r;
};
export type Choice = 'mine' | 'google';
export const applyCheck = async (leadId: string, token: string, choices: Partial<Record<CheckField, Choice>>, confirmed: boolean) => {
  const r = await api<CheckResult & { changed: string[] }>('POST', `/leads/${leadId}/google-check/apply`, { token, choices, confirmed });
  rememberCheck({ ...r, calls: 0 });
  return r;
};
export const markNotOnGoogle = (leadId: string) => api<{ status: CheckStatus }>('POST', `/leads/${leadId}/google-check/not-on-google`, {});

/** Differences and "only on Google" counts from the stored codes. */
export function tally(fields: FieldCodes | null | undefined) {
  const v = fields ? CHECK_FIELDS.map((f) => fields[f]) : [];
  return { different: v.filter((c) => c === 'different').length, googleOnly: v.filter((c) => c === 'google_only').length };
}

export type CheckFilter = 'all' | 'team' | 'google' | 'unchecked' | 'review' | 'missing';
export const CHECK_FILTERS: { key: CheckFilter; label: string; test: (l: Lead) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'team', label: 'Added by team', test: (l) => l.origin === 'team' },
  { key: 'google', label: 'From Google', test: (l) => l.origin === 'find_clients' },
  { key: 'unchecked', label: 'Not checked', test: (l) => l.origin === 'team' && !l.googleCheck.status },
  { key: 'review', label: 'Needs review', test: (l) => l.origin === 'team' && l.googleCheck.status === 'needs_review' },
  { key: 'missing', label: 'Not on Google', test: (l) => l.origin === 'team' && (l.googleCheck.status === 'not_found' || l.googleCheck.status === 'not_on_google') },
];

/** How a lead's check shows in lists: tag text, tone and the founder's next action. */
export function checkMeta(l: Pick<Lead, 'origin' | 'googleCheck'>): { label: string; tone: TagTone; action: string; icon: 'check' | 'warn' | 'search' | 'pin' | 'none' } {
  if (l.origin === 'find_clients') return { label: 'From Find clients', tone: 'muted', action: '', icon: 'pin' };
  const { status, fields, candidates } = l.googleCheck;
  switch (status) {
    case 'matches':
      return { label: 'Matches Google', tone: 'good', action: 'View', icon: 'check' };
    case 'reviewed':
      return { label: 'Reviewed', tone: 'good', action: 'View', icon: 'check' };
    case 'needs_review': {
      const t = tally(fields);
      const label = t.different ? `${t.different} difference${t.different === 1 ? '' : 's'}` : `${t.googleOnly} detail${t.googleOnly === 1 ? '' : 's'} only on Google`;
      return { label, tone: 'warn', action: 'Review', icon: 'warn' };
    }
    case 'pick':
      return { label: `${candidates} possible match${candidates === 1 ? '' : 'es'}`, tone: 'info', action: 'Choose', icon: 'search' };
    case 'not_found':
    case 'not_on_google':
      return { label: 'Not on Google', tone: 'bad', action: 'Search again', icon: 'pin' };
    default:
      return { label: 'Not checked', tone: 'neutral', action: 'Check', icon: 'none' };
  }
}

export const checkPath = (id: string) => `/team/leads/${id}/google`;

/** "412 of 1,000 left this month". */
export const leftText = (u: PlacesUsage | undefined) =>
  u ? `${u.remaining.toLocaleString('en-IN')} of ${u.cap.toLocaleString('en-IN')} left this month` : '';
