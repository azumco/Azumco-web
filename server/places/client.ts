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

// "Check against Google" (team-added leads) needs a little more to compare and
// to let a founder pick: address parts (area, city), types (category) and the
// rating. addressComponents/types/primaryType are Essentials/Pro fields and
// rating/userRatingCount are Enterprise, so the call still bills ONCE at the
// same Enterprise tier as the fields above. Nothing from "Enterprise +
// Atmosphere" is requested.
const CHECK_PLACE_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'addressComponents', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'types', 'primaryType', 'rating', 'userRatingCount',
];
export const CHECK_SEARCH_FIELDS = CHECK_PLACE_FIELDS.map((f) => `places.${f}`).join(',');
export const CHECK_DETAILS_FIELDS = CHECK_PLACE_FIELDS.join(',');

export type PlacesSku = 'text_search_enterprise' | 'place_details_enterprise';

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
}

/** A place as the lead check sees it. Held in memory for one response only. */
export interface CheckPlace extends PlaceResult {
  /** Neighbourhood / sub-locality from the address parts ('' when Google gives none). */
  area: string;
  /** Locality from the address parts. */
  city: string;
  types: string[];
  primaryType: string;
  rating: number | null;
  ratingCount: number | null;
}

export interface PlacesClient {
  searchText(query: string, limit: number): Promise<PlaceResult[]>;
  placeDetails(placeId: string): Promise<PlaceResult>;
  /** Lead check: one Text Search (Enterprise) with the check field mask. */
  checkSearch?(query: string, limit: number): Promise<CheckPlace[]>;
  /** Lead check: one Place Details (Enterprise) with the check field mask. */
  checkDetails?(placeId: string): Promise<CheckPlace>;
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
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  types?: string[];
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
}

const toResult = (p: RawPlace): PlaceResult => ({
  placeId: p.id ?? '',
  name: p.displayName?.text ?? '',
  address: p.formattedAddress ?? '',
  // The international form carries the country code, so normalisation does not guess.
  phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? '',
  website: p.websiteUri ?? '',
});

const component = (p: RawPlace, ...wanted: string[]) => {
  for (const w of wanted) {
    const c = (p.addressComponents ?? []).find((x) => x.types?.includes(w));
    if (c?.longText) return c.longText;
  }
  return '';
};

export const toCheckPlace = (p: RawPlace): CheckPlace => ({
  ...toResult(p),
  area: component(p, 'sublocality_level_1', 'sublocality', 'neighborhood', 'sublocality_level_2'),
  city: component(p, 'locality', 'administrative_area_level_3', 'postal_town'),
  types: p.types ?? [],
  primaryType: p.primaryType ?? '',
  rating: typeof p.rating === 'number' ? p.rating : null,
  ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
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

  async checkSearch(query: string, limit: number): Promise<CheckPlace[]> {
    const data = await this.call<{ places?: RawPlace[] }>('POST', '/places:searchText', CHECK_SEARCH_FIELDS, {
      textQuery: query,
      pageSize: Math.max(1, Math.min(20, limit)),
      regionCode: 'IN',
      languageCode: 'en',
    });
    return (data.places ?? []).map(toCheckPlace).filter((p) => p.placeId);
  }

  async checkDetails(placeId: string): Promise<CheckPlace> {
    const data = await this.call<RawPlace>('GET', `/places/${encodeURIComponent(placeId)}?languageCode=en&regionCode=IN`, CHECK_DETAILS_FIELDS);
    return toCheckPlace(data);
  }
}
