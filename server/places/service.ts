// Find clients: Places search, import and the live contact lookup.
//
// Google's terms (Maps Platform Terms §3.2.3) allow storing place IDs only, so:
//   - results are returned to the founder and then forgotten — never written to
//     Sheets, logs or the audit log;
//   - import stores the place ID plus OUR OWN search inputs (category, city);
//   - opening an unconfirmed Google lead fetches its contact live, every time,
//     with no cache (the terms give no allowance for even a short cache);
//   - once a person confirms the contact by reaching the business, it is saved
//     as first-party data and no further lookups are made.
// Logs and audit entries below carry counts and ids, never Places content.

import { z } from 'zod';
import type { Db } from '../sheets/db.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { HttpError } from '../auth/middleware.ts';
import { audit, auditUnqueued } from '../audit.ts';
import { log } from '../lib/log.ts';
import { getSettings } from '../settings.ts';
import { normalizePhone } from '../../shared/phone.ts';
import { istDate } from '../../shared/time.ts';
import { notifyUnqueued } from '../notifications.ts';
import { assertLeadAccess } from '../leads/access.ts';
import { GOOGLE_SOURCE, readLeads } from '../leads/service.ts';
import { PlacesHttpError, type PlaceResult, type PlacesClient, type PlacesSku } from './client.ts';
import { claimPlacesCall, releasePlacesCall } from './budget.ts';

export const searchSchema = z.object({
  category: z.string().trim().min(2, 'Enter a business category.').max(80),
  city: z.string().trim().min(2, 'Choose a city.').max(80),
  /** Disambiguates same-named cities (e.g. Udaipur, Rajasthan vs Udaipur, Tripura). */
  state: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export const importSchema = z.object({
  category: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  searchedAt: z.string().datetime(),
  placeIds: z.array(z.string().trim().min(1).max(300)).min(1, 'Select at least one result.').max(20),
  assignTo: z.string().optional(),
  windowHours: z.union([z.literal(12), z.literal(24), z.literal(48)]).optional(),
});

const PAUSED = 'Google lookups are paused by the super admin.';

export class PlacesService {
  constructor(
    private readonly db: Db,
    private readonly client: PlacesClient | null,
  ) {}

  get enabled() {
    return this.client !== null;
  }

  private requireClient(): PlacesClient {
    if (!this.client) throw new HttpError(503, 'Find clients is not set up on this server (no Google Places key).', 'PLACES_DISABLED');
    return this.client;
  }

  /**
   * Claim → final pause check → one outbound call → release if unbilled.
   * The pause is checked when the request joins the queue (inside the claim,
   * from a fresh read) and again immediately before the request leaves.
   */
  private async paidCall<T>(sku: PlacesSku, actor: SessionUser, call: (c: PlacesClient) => Promise<T>, onReject?: (e: PlacesHttpError) => never): Promise<T> {
    const client = this.requireClient();
    if ((await getSettings(this.db)).placesPaused) throw new HttpError(423, PAUSED, 'PLACES_PAUSED');

    const claim = await claimPlacesCall(this.db, sku, actor.id);
    if (!claim.ok) {
      if (claim.reason === 'paused') throw new HttpError(423, PAUSED, 'PLACES_PAUSED');
      throw new HttpError(429, "This month's Google lookup limit has been reached. It resets on the 1st (IST), or the super admin can raise it.", 'PLACES_CAP_REACHED');
    }

    if ((await getSettings(this.db)).placesPaused) {
      await releasePlacesCall(this.db, claim.claimId, actor.id);
      throw new HttpError(423, PAUSED, 'PLACES_PAUSED');
    }

    try {
      return await call(client);
    } catch (err) {
      if (err instanceof PlacesHttpError && err.unbilled) {
        await releasePlacesCall(this.db, claim.claimId, actor.id);
        log.warn('places request rejected; slot released', { sku, status: err.status });
        if (onReject) onReject(err);
        throw new HttpError(502, 'Google rejected the request. Nothing was charged; try again later.');
      }
      // A network fault or 5xx may still have been billed, so the slot is kept.
      log.error('places request failed; slot kept', { sku, error: (err as Error).message });
      throw new HttpError(502, 'Could not reach Google. Try again in a moment.');
    }
  }

  async search(actor: SessionUser, input: z.infer<typeof searchSchema>, ip?: string) {
    const results = await this.paidCall('text_search_enterprise', actor, (c) =>
      c.searchText(`${input.category} in ${input.city}${input.state ? `, ${input.state}` : ''}`, input.limit),
    );

    // Mark what we already have — compared in memory, nothing stored.
    const leads = await readLeads(this.db);
    const placeIds = new Set(leads.map((l) => l.placeId).filter(Boolean));
    const phones = new Set(leads.map((l) => normalizePhone(l.phone)).filter(Boolean));
    const marked = results.map((r: PlaceResult) => ({
      ...r,
      alreadyInLeads: placeIds.has(r.placeId) || (r.phone ? phones.has(normalizePhone(r.phone)) : false),
    }));

    await audit(this.db, {
      actorId: actor.id,
      action: 'places.search',
      entity: 'PlacesClaims',
      // Our inputs and a count only — no Places content.
      after: { category: input.category, city: input.city, state: input.state ?? '', limit: input.limit, results: results.length },
      ip,
    });
    return { results: marked, searchedAt: this.db.now().toISOString() };
  }

  /** Store only the place ID and our own search inputs. No Google call. */
  async import(actor: SessionUser, input: z.infer<typeof importSchema>, defaultWindow: number, ip?: string) {
    if (input.assignTo) {
      const u = (await this.db.all('Users')).find((x) => x.id === input.assignTo);
      if (!u || u.active === 'FALSE') throw new HttpError(400, 'Choose an active team member to assign to.');
    }
    const hours = input.windowHours ?? defaultWindow;

    return this.db.exclusive(async () => {
      const now = this.db.now();
      const [state] = await this.db.loadFresh(['Leads']);
      const have = new Set(state.rows.map((l) => l.placeId).filter(Boolean));
      const ids = [...new Set(input.placeIds)].filter((id) => !have.has(id));

      await this.db.insertManyUnqueued(
        'Leads',
        ids.map((placeId) => ({
          placeId,
          category: input.category,
          city: input.city,
          searchedAt: input.searchedAt,
          source: GOOGLE_SOURCE,
          dateAdded: istDate(now),
          addedBy: actor.id,
          status: 'New',
          contacted: 'FALSE',
          ...(input.assignTo
            ? {
                assignedTo: input.assignTo,
                assignedAt: now.toISOString(),
                expiresAt: new Date(now.getTime() + hours * 3_600_000).toISOString(),
                expiryApplies: 'TRUE',
              }
            : {}),
        })),
        actor.id,
      );
      if (input.assignTo && ids.length) {
        await notifyUnqueued(this.db, [{
          userId: input.assignTo,
          type: 'leads_assigned',
          message: `${ids.length} new ${input.category} lead${ids.length === 1 ? '' : 's'} in ${input.city} assigned to you. Contact them within ${hours} hours or they go back to the founders.`,
        }], actor.id);
      }
      await auditUnqueued(this.db, [{
        actorId: actor.id,
        action: 'places.import',
        entity: 'Leads',
        after: { category: input.category, city: input.city, imported: ids.length, skipped: input.placeIds.length - ids.length, assignedTo: input.assignTo ?? '', hours: input.assignTo ? hours : null },
        ip,
      }]);
      return { imported: ids.length, skipped: input.placeIds.length - ids.length };
    });
  }

  /** Live contact for an unconfirmed Google lead. Shown once, never stored or cached. */
  async lookup(actor: SessionUser, leadId: string, ip?: string) {
    const lead = (await readLeads(this.db)).find((l) => l.id === leadId);
    assertLeadAccess(actor, lead, this.db.now(), await this.db.all('Expirations'));
    if (!lead.placeId) throw new HttpError(400, 'This lead did not come from Google.');
    if (lead.confirmedAt) throw new HttpError(409, 'This contact is already confirmed; no lookup is needed.', 'ALREADY_CONFIRMED');

    const result = await this.paidCall('place_details_enterprise', actor, (c) => c.placeDetails(lead.placeId), (e) => {
      if (e.status === 404) throw new HttpError(404, 'Google no longer lists this business. Delete the lead or add the contact by hand.');
      throw new HttpError(502, 'Google rejected the request. Nothing was charged; try again later.');
    });
    await audit(this.db, { actorId: actor.id, action: 'places.lookup', entity: 'Leads', entityId: leadId, ip });
    return { contact: { name: result.name, address: result.address, phone: result.phone, website: result.website } };
  }
}
