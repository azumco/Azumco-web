// "Check against Google" for leads a person added (never Find clients imports).
//
// Billing: a check is ONE Text Search Enterprise call (up to 5 candidates,
// with every field the comparison needs). Choosing among candidates that were
// already fetched, and saving choices, make NO call. Re-opening a past check
// ("View") is one Place Details Enterprise call on the linked place.
// Every call goes through PlacesService.paidCall: monthly cap, pause switch
// and the atomic usage counter, exactly like Find clients.
//
// Google's data (Maps Platform Terms §3.2.3, same reading as Find clients):
//   stored    the place ID, the status, per-field RESULT CODES, candidate place
//             IDs, who checked and when;
//   never     Google's names, phones, addresses, websites or ratings. They go
//             to the founder in the response and are then forgotten. To let a
//             founder pick or save without a second call and without a cache,
//             each Google listing travels to the browser inside a short-lived
//             token signed by the server (HMAC). The server verifies it, so the
//             values it saves really are Google's — and only when the founder
//             ticks "I've confirmed this with the business", after which they
//             are our own first-party data.
// Logs and audit entries carry statuses, codes and counts, plus the lead's own
// before/after values when a founder saves a change.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import type { Row } from '../sheets/schema.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { auditUnqueued } from '../audit.ts';
import { cleanPhone } from '../leads/service.ts';
import { assertLeadAccess } from '../leads/access.ts';
import { getSettings } from '../settings.ts';
import { formatDate, istYearMonth } from '../../shared/time.ts';
import {
  CHECK_FIELDS, MEMBER_CHECK_COOLDOWN_DAYS, isUnlimitedChecker, categoryFromGoogle, checkQuery, compareLead, decideMatch, leadOrigin, overallStatus, ourSide,
  type CheckField, type CheckStatus, type FieldCodes, type GoogleSide,
} from '../../shared/leadCheck.ts';
import type { CheckPlace } from './client.ts';
import { placesUsage } from './budget.ts';
import type { PlacesService } from './service.ts';

/** Candidates offered on "Pick a match". */
export const MAX_CANDIDATES = 5;
/** How long a fetched listing can be picked or saved from without a new call. */
const TOKEN_TTL_MS = 30 * 60_000;

export const checkSchema = z.object({ query: z.string().trim().max(300).optional() }).strict();
export const pickSchema = z.object({ token: z.string().min(10).max(8000) }).strict();
export const applySchema = z.object({
  token: z.string().min(10).max(8000),
  confirmed: z.boolean().default(false),
  /** Per field: keep ours, or use Google's value (needs `confirmed`). Fields left out are kept. */
  choices: z.partialRecord(z.enum(CHECK_FIELDS), z.enum(['mine', 'google'])).default({}),
}).strict();

/** A Google listing as shown to the founder (never stored). */
export interface PlaceView extends GoogleSide {
  placeId: string;
  rating: number | null;
  ratingCount: number | null;
  mapsUrl: string;
}

const mapsUrl = (placeId: string) => `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;

const toView = (p: CheckPlace): PlaceView => ({
  placeId: p.placeId,
  businessName: p.name,
  phone: p.phone,
  area: p.area,
  city: p.city,
  website: p.website,
  category: categoryFromGoogle(p.primaryType, p.types),
  address: p.address,
  rating: p.rating,
  ratingCount: p.ratingCount,
  mapsUrl: mapsUrl(p.placeId),
});

/** Lead field each compared field is saved into. */
const LEAD_COLUMN: Record<CheckField, string> = {
  businessName: 'businessName', phone: 'phone', area: 'area', city: 'city', website: 'websiteOrInstagram', category: 'category',
};

const DAY = 86_400_000;

/** The first day of the next IST month, as an ISO date ("2026-12-01"). */
export function nextMonthStart(now: Date): string {
  const [y, m] = istYearMonth(now).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export class LeadCheckService {
  constructor(
    private readonly db: Db,
    private readonly places: PlacesService,
    private readonly secret: string,
  ) {}

  // ── Signed listings ──────────────────────────────────────────────────────

  private sign(leadId: string, place: PlaceView): string {
    const body = Buffer.from(JSON.stringify({ l: leadId, p: place, x: this.db.now().getTime() + TOKEN_TTL_MS })).toString('base64url');
    return `${body}.${createHmac('sha256', this.secret).update(`lead-check:${body}`).digest('base64url')}`;
  }

  private verify(leadId: string, token: string): PlaceView {
    const [body, mac] = token.split('.');
    const want = createHmac('sha256', this.secret).update(`lead-check:${body ?? ''}`).digest();
    let got: Buffer;
    try {
      got = Buffer.from(mac ?? '', 'base64url');
    } catch {
      got = Buffer.alloc(0);
    }
    if (!body || got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(400, 'That Google result is not valid. Check the lead again.', 'BAD_CHECK_TOKEN');
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { l: string; p: PlaceView; x: number };
    if (data.l !== leadId) throw new HttpError(400, 'That Google result belongs to another lead.', 'BAD_CHECK_TOKEN');
    if (this.db.now().getTime() > data.x) throw new HttpError(410, 'This Google result has expired. Check again (uses 1 Google call).', 'CHECK_EXPIRED');
    return data.p;
  }

  private offer(leadId: string, p: PlaceView) {
    return { token: this.sign(leadId, p), place: p };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** The lead, if `actor` may check it: founders any team-added lead, team members only their own. */
  private async teamLead(id: string, actor: SessionUser): Promise<Row> {
    const [leads, exp] = await this.db.loadFresh(['Leads', 'Expirations']);
    const lead = leads.rows.find((l) => l.id === id);
    if (!lead) throw new HttpError(404, 'Lead not found.');
    if (!isUnlimitedChecker(actor)) {
      assertLeadAccess(actor, lead, this.db.now(), exp.rows);
      if (lead.addedBy !== actor.id) throw new HttpError(403, 'You can only check leads you added yourself.', 'NOT_YOUR_LEAD');
    }
    if (leadOrigin(lead) !== 'team') {
      throw new HttpError(409, 'Leads from Find clients already come from Google, so they are not checked.', 'FIND_CLIENTS_LEAD');
    }
    return lead;
  }

  /** A team member's monthly allowance: their own limit, else the Settings default. */
  private async memberLimit(me: Row | undefined): Promise<number> {
    const own = me?.leadCheckLimit ? Number(me.leadCheckLimit) : NaN;
    return Number.isInteger(own) && own >= 0 ? own : (await getSettings(this.db)).memberLeadChecksPerMonth;
  }

  /** This person's checks used this IST month (the stored counter resets with the month). */
  private usedThisMonth(me: Row | undefined): number {
    return me && me.leadCheckMonth === istYearMonth(this.db.now()) ? Math.max(0, Number(me.leadCheckUsed) || 0) : 0;
  }

  /** Reserve one of a team member's checks (atomic with the read), or refuse at the limit. */
  private async reserve(actor: SessionUser): Promise<void> {
    await this.db.exclusive(async () => {
      const [users] = await this.db.loadFresh(['Users']);
      const me = users.rows.find((u) => u.id === actor.id);
      if (!me) throw new HttpError(401, 'Please sign in.');
      const used = this.usedThisMonth(me);
      const limit = await this.memberLimit(me);
      if (used >= limit) throw new HttpError(429, `You've used all ${limit} of your Google checks this month. They reset on ${formatDate(nextMonthStart(this.db.now()))}.`, 'MEMBER_CHECK_LIMIT');
      await this.db.updateUnqueued('Users', me.id, { leadCheckMonth: istYearMonth(this.db.now()), leadCheckUsed: String(used + 1) }, 'system');
    });
  }

  /** Give a reserved check back (the Google call failed or was refused). */
  private async refund(actor: SessionUser): Promise<void> {
    await this.db.exclusive(async () => {
      const [users] = await this.db.loadFresh(['Users']);
      const me = users.rows.find((u) => u.id === actor.id);
      const used = this.usedThisMonth(me);
      if (me && used > 0) await this.db.updateUnqueued('Users', me.id, { leadCheckUsed: String(used - 1) }, 'system');
    });
  }

  /** When the 7-day rule lets this lead be checked again (null = now). */
  private nextAllowed(lead: Row): number | null {
    const last = lead.gcLastCallAt || (lead.gcStatus && lead.gcStatus !== 'not_on_google' ? lead.gcCheckedAt : '');
    if (!last) return null;
    const next = Date.parse(last) + MEMBER_CHECK_COOLDOWN_DAYS * DAY;
    return this.db.now().getTime() < next ? next : null;
  }

  /**
   * Everything that costs a Google call goes through here, for everyone:
   *  1. the 7-day rule (whoever checked last) — except an edited search right
   *     after "pick a match" / "not on Google", which the check screens offer;
   *  2. the pause switch, before anything is reserved or sent;
   *  3. team members: one check reserved from their monthly allowance, given
   *     back if the call fails;
   *  4. PlacesService.paidCall: the global monthly cap (atomic) and pause again.
   */
  private async billable<T>(actor: SessionUser, lead: Row, run: () => Promise<T>, opts: { editedSearch?: boolean } = {}): Promise<T> {
    const next = opts.editedSearch ? null : this.nextAllowed(lead);
    if (next) {
      const last = lead.gcLastCallAt || lead.gcCheckedAt;
      throw new HttpError(429, `This lead was checked on ${formatDate(last)}. You can check it again from ${formatDate(new Date(next).toISOString())}.`, 'CHECKED_RECENTLY');
    }
    if ((await getSettings(this.db, { fresh: true })).placesPaused) throw new HttpError(423, 'Google checks are paused by the super admin.', 'PLACES_PAUSED');
    const member = !isUnlimitedChecker(actor);
    if (member) await this.reserve(actor);
    try {
      return await run();
    } catch (e) {
      if (member) await this.refund(actor).catch(() => undefined);
      throw e;
    }
  }

  /** What the person can still do this month (allowance line, buttons). */
  async allowance(actor: SessionUser) {
    const usage = await placesUsage(this.db);
    const google = { used: usage.used, cap: usage.cap, remaining: usage.remaining, paused: usage.paused };
    const resetsOn = nextMonthStart(this.db.now());
    if (isUnlimitedChecker(actor)) return { unlimited: true, google, mine: null, cooldownDays: MEMBER_CHECK_COOLDOWN_DAYS, resetsOn };
    const me = (await this.db.loadFresh(['Users']))[0].rows.find((u) => u.id === actor.id);
    const used = this.usedThisMonth(me);
    const limit = await this.memberLimit(me);
    return { unlimited: false, google, mine: { used, limit, remaining: Math.max(0, limit - used) }, cooldownDays: MEMBER_CHECK_COOLDOWN_DAYS, resetsOn };
  }

  /** Founders set a team member's own monthly allowance (null = the Settings default). Audited. */
  async setMemberLimit(actor: SessionUser, userId: string, limit: number | null, ip?: string) {
    return this.db.exclusive(async () => {
      const [users] = await this.db.loadFresh(['Users']);
      const u = users.rows.find((x) => x.id === userId);
      if (!u) throw new HttpError(404, 'Team member not found.');
      if (u.role !== 'employee') throw new HttpError(400, 'Founders have no check allowance.');
      const { before, after } = await this.db.updateUnqueued('Users', u.id, { leadCheckLimit: limit === null ? '' : String(limit) }, actor.id);
      await auditUnqueued(this.db, [{ actorId: actor.id, action: 'users.lead_check_limit', entity: 'Users', entityId: u.id, before: { leadCheckLimit: before.leadCheckLimit ?? '' }, after: { leadCheckLimit: after.leadCheckLimit ?? '' }, ip }]);
      return { userId: u.id, leadCheckLimit: limit, effective: await this.memberLimit(after) };
    });
  }

  private client() {
    const c = this.places.placesClient;
    if (!c.checkSearch || !c.checkDetails) throw new HttpError(503, 'Google checks are not available on this server.', 'PLACES_DISABLED');
    return c as Required<typeof c>;
  }

  private stamp(actor: SessionUser, billed = false) {
    const now = this.db.now().toISOString();
    return { gcCheckedAt: now, gcCheckedBy: actor.id, ...(billed ? { gcLastCallAt: now } : {}) };
  }

  private async save(actor: SessionUser, lead: Row, patch: Record<string, string>, action: string, after: Record<string, unknown>, ip?: string) {
    return this.db.exclusive(async () => {
      const { after: row } = await this.db.updateUnqueued('Leads', lead.id, patch, actor.id);
      await auditUnqueued(this.db, [{ actorId: actor.id, action, entity: 'Leads', entityId: lead.id, after, ip }]);
      return row;
    });
  }

  private async result(lead: Row, status: CheckStatus, extra: Record<string, unknown>) {
    return { leadId: lead.id, status, ...extra, usage: await placesUsage(this.db) };
  }

  /** Link `place` to the lead: store its ID, the codes and the status. */
  private async link(actor: SessionUser, lead: Row, place: PlaceView, action: string, calls: number, ip?: string) {
    const codes = compareLead(ourSide(lead), place);
    const status = overallStatus(codes);
    await this.save(actor, lead, { gcStatus: status, gcPlaceId: place.placeId, gcFields: JSON.stringify(codes), gcCandidates: '', ...this.stamp(actor, calls > 0) }, action, { status, fields: codes, calls }, ip);
    return this.result(lead, status, { fields: codes, google: this.offer(lead.id, place), calls });
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  /** One Google call: search by name + area + city (or the founder's edited search). */
  async check(actor: SessionUser, leadId: string, input: z.infer<typeof checkSchema>, ip?: string) {
    const lead = await this.teamLead(leadId, actor);
    const ours = ourSide(lead);
    const query = input.query || checkQuery(ours);
    if (!query) throw new HttpError(400, 'Add the business name before checking it against Google.');
    const client = this.client();
    // An edited search right after "pick a match" / "not on Google" is what those screens offer.
    const editedSearch = Boolean(input.query) && ['pick', 'not_found', 'not_on_google'].includes(lead.gcStatus ?? '');
    return this.billable(actor, lead, () => this.search(actor, lead, ours, query, client, ip), { editedSearch });
  }

  private async search(actor: SessionUser, lead: Row, ours: ReturnType<typeof ourSide>, query: string, client: ReturnType<LeadCheckService['client']>, ip?: string) {
    const found = (await this.places.paidCall('text_search_enterprise', actor, () => client.checkSearch(query, MAX_CANDIDATES))).map(toView);

    const decision = decideMatch(ours, found);
    if (decision.kind === 'match') return this.link(actor, lead, found[decision.index], 'lead.google_check', 1, ip);
    if (decision.kind === 'pick') {
      const picks = decision.indexes.map((i) => found[i]);
      await this.save(actor, lead, { gcStatus: 'pick', gcPlaceId: '', gcFields: '', gcCandidates: picks.map((p) => p.placeId).join(','), ...this.stamp(actor, true) }, 'lead.google_check', { status: 'pick', candidates: picks.length, calls: 1 }, ip);
      return this.result(lead, 'pick', { candidates: picks.map((p) => this.offer(lead.id, p)), query, calls: 1 });
    }
    await this.save(actor, lead, { gcStatus: 'not_found', gcPlaceId: '', gcFields: '', gcCandidates: '', ...this.stamp(actor, true) }, 'lead.google_check', { status: 'not_found', calls: 1 }, ip);
    return this.result(lead, 'not_found', { query, calls: 1 });
  }

  /** No Google call: the founder picks one of the listings already fetched. */
  async pick(actor: SessionUser, leadId: string, input: z.infer<typeof pickSchema>, ip?: string) {
    const lead = await this.teamLead(leadId, actor);
    const place = this.verify(leadId, input.token);
    return this.link(actor, lead, place, 'lead.google_pick', 0, ip);
  }

  /** One Google call: re-open a linked check with Google's current values. */
  async view(actor: SessionUser, leadId: string, ip?: string) {
    const lead = await this.teamLead(leadId, actor);
    if (!lead.gcPlaceId) throw new HttpError(409, 'This lead is not linked to a Google listing yet. Check it first.', 'NOT_LINKED');
    const client = this.client();
    return this.billable(actor, lead, () => this.lookup(actor, lead, client, ip));
  }

  private async lookup(actor: SessionUser, lead: Row, client: ReturnType<LeadCheckService['client']>, ip?: string) {
    const place = toView(await this.places.paidCall('place_details_enterprise', actor, () => client.checkDetails(lead.gcPlaceId), (e) => {
      if (e.status === 404) throw new HttpError(404, 'Google no longer lists this business. Check it again to search for it.');
      throw new HttpError(502, 'Google rejected the request. Nothing was charged; try again later.');
    }));
    // A founder who already kept our values stays "reviewed" unless something new differs.
    const codes = compareLead(ourSide(lead), place);
    let status: CheckStatus = overallStatus(codes);
    if (status === 'needs_review' && lead.gcStatus === 'reviewed' && JSON.stringify(codes) === JSON.stringify(JSON.parse(lead.gcFields || 'null'))) status = 'reviewed';
    await this.save(actor, lead, { gcStatus: status, gcFields: JSON.stringify(codes), ...this.stamp(actor, true) }, 'lead.google_view', { status, fields: codes, calls: 1 }, ip);
    return this.result(lead, status, { fields: codes, google: this.offer(lead.id, place), calls: 1 });
  }

  /** No Google call. "Keep mine" needs nothing; "Use Google's" / "Add to lead" need `confirmed`. */
  async apply(actor: SessionUser, leadId: string, input: z.infer<typeof applySchema>, ip?: string) {
    await this.teamLead(leadId, actor);
    const place = this.verify(leadId, input.token);
    const useGoogle = (Object.entries(input.choices) as [CheckField, 'mine' | 'google'][]).filter(([, c]) => c === 'google').map(([f]) => f);
    if (useGoogle.length && !input.confirmed) {
      throw new HttpError(400, "Tick \"I've confirmed this with the business\" before saving Google's details to the lead.", 'CONFIRMATION_REQUIRED');
    }
    for (const f of useGoogle) if (!place[f]) throw new HttpError(400, `Google has no ${f} for this business.`);

    return this.db.exclusive(async () => {
      const [state] = await this.db.loadFresh(['Leads']);
      const lead = state.rows.find((l) => l.id === leadId);
      if (!lead) throw new HttpError(404, 'Lead not found.');
      if (leadOrigin(lead) !== 'team') throw new HttpError(409, 'Leads from Find clients already come from Google, so they are not checked.', 'FIND_CLIENTS_LEAD');

      const ours = ourSide(lead);
      const patch: Record<string, string> = {};
      if (useGoogle.some((f) => f === 'area' || f === 'city') && !lead.area && ours.area) {
        // "MP Nagar, Bhopal" in the one field: split it so the other half is kept.
        patch.area = ours.area;
        patch.city = ours.city;
      }
      for (const f of useGoogle) {
        if (f === 'phone') {
          try {
            patch.phone = cleanPhone(place.phone, state.rows, leadId);
          } catch (e) {
            // Team members don't see other people's leads, so don't name the match.
            if (!isUnlimitedChecker(actor) && e instanceof HttpError && e.code === 'DUPLICATE') throw new HttpError(409, "This number is already in Azumco's leads. Ask a founder before adding it again.", 'DUPLICATE');
            throw e;
          }
          // Confirmed with the business by a founder: first-party, like "Confirm contact".
          patch.phoneSource = 'outreach_confirmed';
        } else {
          patch[LEAD_COLUMN[f]] = place[f];
        }
      }
      const next = { ...lead, ...patch } as Row;
      const codes: FieldCodes = compareLead(ourSide(next), place);
      const status: CheckStatus = overallStatus(codes) === 'matches' ? 'matches' : 'reviewed';
      Object.assign(patch, { gcStatus: status, gcPlaceId: place.placeId, gcFields: JSON.stringify(codes), gcCandidates: '', ...this.stamp(actor) });

      const { before, after } = await this.db.updateUnqueued('Leads', leadId, patch, actor.id);
      const changed = Object.keys(patch).filter((k) => !k.startsWith('gc') && k !== 'phoneSource' && (before[k] ?? '') !== (after[k] ?? ''));
      const kept = (Object.entries(input.choices) as [CheckField, string][]).filter(([, c]) => c === 'mine').map(([f]) => f);
      await auditUnqueued(this.db, [{
        actorId: actor.id,
        action: 'lead.google_apply',
        entity: 'Leads',
        entityId: leadId,
        // The lead's own values (now first-party), only for fields that changed.
        before: Object.fromEntries(changed.map((k) => [k, before[k] ?? ''])),
        after: { ...Object.fromEntries(changed.map((k) => [k, after[k] ?? ''])), status, usedGoogle: useGoogle, kept, confirmed: input.confirmed },
        ip,
      }]);
      return { leadId, status, fields: codes, changed, google: this.offer(leadId, place) };
    });
  }

  /** No Google call: the founder records that the business is not on Google. */
  async markNotOnGoogle(actor: SessionUser, leadId: string, ip?: string) {
    const lead = await this.teamLead(leadId, actor);
    await this.save(actor, lead, { gcStatus: 'not_on_google', gcPlaceId: '', gcFields: '', gcCandidates: '', ...this.stamp(actor) }, 'lead.google_not_listed', { status: 'not_on_google' }, ip);
    return { leadId, status: 'not_on_google' as CheckStatus };
  }
}
