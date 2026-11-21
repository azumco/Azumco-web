// Google Places API (New): the two calls the lead finder makes.
//
// Billing (developers.google.com/maps/documentation/places/web-service/text-search
// and /place-details, checked 2026-11-21): a request is billed at the HIGHEST
// tier of any field in its field mask. Phone and website are Enterprise
// fields, so both calls below bill as "Enterprise". Nothing from the
// "Enterprise + Atmosphere" tier (rating counts aside, reviews, hours,
// summaries) is requested. rating/userRatingCount are also Enterprise and are
// deliberately left out: they would not change the tier but are not needed.
//
//   searchText   Text Search Enterprise  — ONE request returns up to 20 places
//   placeDetails Place Details Enterprise — one place
//
// Nothing returned here is persisted or logged by the callers: Google's terms
// allow storing place IDs only (Maps Platform Terms §3.2.3).

export const TEXT_SEARCH_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
].join(',');

export const DETAILS_FIELDS = ['id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri'].join(',');

export type PlacesSku = 'text_search_enterprise' | 'place_details_enterprise';

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
}

export interface PlacesClient {
  searchText(query: string, limit: number): Promise<PlaceResult[]>;
  placeDetails(placeId: string): Promise<PlaceResult>;
}

/** A non-OK response. 4xx other than 429 are treated as unbilled (Google bills "successful requests"). */
export class PlacesHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PlacesHttpError';
  }
  get unbilled(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
}

const toResult = (p: RawPlace): PlaceResult => ({
  placeId: p.id ?? '',
  name: p.displayName?.text ?? '',
  address: p.formattedAddress ?? '',
  // The international form carries the country code, so normalisation does not guess.
  phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? '',
  website: p.websiteUri ?? '',
});

const BASE = 'https://places.googleapis.com/v1';

export class GooglePlacesClient implements PlacesClient {
  constructor(private readonly apiKey: string) {}

  private async call<T>(method: 'GET' | 'POST', path: string, fieldMask: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': fieldMask },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // The status only. Google's error body is not logged: it can echo the query.
      throw new PlacesHttpError(res.status, `Places request failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  async searchText(query: string, limit: number): Promise<PlaceResult[]> {
    // Text Search is POST /places:searchText; India bias via regionCode.
    const data = await this.call<{ places?: RawPlace[] }>('POST', '/places:searchText', TEXT_SEARCH_FIELDS, {
      textQuery: query,
      pageSize: Math.max(1, Math.min(20, limit)),
      regionCode: 'IN',
      languageCode: 'en',
    });
    return (data.places ?? []).map(toResult).filter((p) => p.placeId);
  }

  async placeDetails(placeId: string): Promise<PlaceResult> {
    // Place Details is GET /places/{id} — a POST here returns a bare 404.
    const data = await this.call<RawPlace>('GET', `/places/${encodeURIComponent(placeId)}?languageCode=en&regionCode=IN`, DETAILS_FIELDS);
    return toResult(data);
  }
}
