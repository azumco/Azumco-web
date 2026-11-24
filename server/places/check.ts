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
import {
  CHECK_FIELDS, categoryFromGoogle, checkQuery, compareLead, decideMatch, leadOrigin, overallStatus, ourSide,
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

  private async teamLead(id: string): Promise<Row> {
    const lead = (await this.db.loadFresh(['Leads']))[0].rows.find((l) => l.id === id);
    if (!lead) throw new HttpError(404, 'Lead not found.');
    if (leadOrigin(lead) !== 'team') {
      throw new HttpError(409, 'Leads from Find clients already come from Google, so they are not checked.', 'FIND_CLIENTS_LEAD');
    }
    return lead;
  }

  private client() {
    const c = this.places.placesClient;
    if (!c.checkSearch || !c.checkDetails) throw new HttpError(503, 'Google checks are not available on this server.', 'PLACES_DISABLED');
    return c as Required<typeof c>;
  }

  private stamp(actor: SessionUser) {
    return { gcCheckedAt: this.db.now().toISOString(), gcCheckedBy: actor.id };
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
    await this.save(actor, lead, { gcStatus: status, gcPlaceId: place.placeId, gcFields: JSON.stringify(codes), gcCandidates: '', ...this.stamp(actor) }, action, { status, fields: codes, calls }, ip);
    return this.result(lead, status, { fields: codes, google: this.offer(lead.id, place), calls });
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  /** One Google call: search by name + area + city (or the founder's edited search). */
  async check(actor: SessionUser, leadId: string, input: z.infer<typeof checkSchema>, ip?: string) {
    const lead = await this.teamLead(leadId);
    const ours = ourSide(lead);
    const query = input.query || checkQuery(ours);
    if (!query) throw new HttpError(400, 'Add the business name before checking it against Google.');
    const client = this.client();
    const found = (await this.places.paidCall('text_search_enterprise', actor, () => client.checkSearch(query, MAX_CANDIDATES))).map(toView);

    const decision = decideMatch(ours, found);
    if (decision.kind === 'match') return this.link(actor, lead, found[decision.index], 'lead.google_check', 1, ip);
    if (decision.kind === 'pick') {
      const picks = decision.indexes.map((i) => found[i]);
      await this.save(actor, lead, { gcStatus: 'pick', gcPlaceId: '', gcFields: '', gcCandidates: picks.map((p) => p.placeId).join(','), ...this.stamp(actor) }, 'lead.google_check', { status: 'pick', candidates: picks.length, calls: 1 }, ip);
      return this.result(lead, 'pick', { candidates: picks.map((p) => this.offer(lead.id, p)), query, calls: 1 });
    }
    await this.save(actor, lead, { gcStatus: 'not_found', gcPlaceId: '', gcFields: '', gcCandidates: '', ...this.stamp(actor) }, 'lead.google_check', { status: 'not_found', calls: 1 }, ip);
    return this.result(lead, 'not_found', { query, calls: 1 });
  }

  /** No Google call: the founder picks one of the listings already fetched. */
  async pick(actor: SessionUser, leadId: string, input: z.infer<typeof pickSchema>, ip?: string) {
    const lead = await this.teamLead(leadId);
    const place = this.verify(leadId, input.token);
    return this.link(actor, lead, place, 'lead.google_pick', 0, ip);
  }

  /** One Google call: re-open a linked check with Google's current values. */
  async view(actor: SessionUser, leadId: string, ip?: string) {
    const lead = await this.teamLead(leadId);
    if (!lead.gcPlaceId) throw new HttpError(409, 'This lead is not linked to a Google listing yet. Check it first.', 'NOT_LINKED');
    const client = this.client();
    const place = toView(await this.places.paidCall('place_details_enterprise', actor, () => client.checkDetails(lead.gcPlaceId), (e) => {
      if (e.status === 404) throw new HttpError(404, 'Google no longer lists this business. Check it again to search for it.');
      throw new HttpError(502, 'Google rejected the request. Nothing was charged; try again later.');
    }));
    // A founder who already kept our values stays "reviewed" unless something new differs.
    const codes = compareLead(ourSide(lead), place);
    let status: CheckStatus = overallStatus(codes);
    if (status === 'needs_review' && lead.gcStatus === 'reviewed' && JSON.stringify(codes) === JSON.stringify(JSON.parse(lead.gcFields || 'null'))) status = 'reviewed';
    await this.save(actor, lead, { gcStatus: status, gcFields: JSON.stringify(codes), ...this.stamp(actor) }, 'lead.google_view', { status, fields: codes, calls: 1 }, ip);
    return this.result(lead, status, { fields: codes, google: this.offer(lead.id, place), calls: 1 });
  }

  /** No Google call. "Keep mine" needs nothing; "Use Google's" / "Add to lead" need `confirmed`. */
  async apply(actor: SessionUser, leadId: string, input: z.infer<typeof applySchema>, ip?: string) {
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
          patch.phone = cleanPhone(place.phone, state.rows, leadId);
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
    const lead = await this.teamLead(leadId);
    await this.save(actor, lead, { gcStatus: 'not_on_google', gcPlaceId: '', gcFields: '', gcCandidates: '', ...this.stamp(actor) }, 'lead.google_not_listed', { status: 'not_on_google' }, ip);
    return { leadId, status: 'not_on_google' as CheckStatus };
  }
}
