// "Check against Google" for leads a person added: who may run it, how values
// are normalised, how a Google listing is compared with the lead, and how the
// best candidate is chosen. Pure functions, shared by the server and the UI.
//
// Only the RESULT CODES of a comparison are ever stored (never Google's values).

import { normalizePhone } from './phone.ts';
import { BUSINESS_CATEGORIES } from './rules.ts';

// ─── Who ────────────────────────────────────────────────────────────────────

/** The one place that decides who may run checks and save their results. */
export const LEAD_CHECK_ROLES = ['admin', 'super_admin'] as const;
export const canRunLeadCheck = (user: { role: string }) => (LEAD_CHECK_ROLES as readonly string[]).includes(user.role);

/** Where a lead came from: added by a person, or imported from Find clients. */
export type LeadOrigin = 'team' | 'find_clients';
/** Stored origin, or (rows written before the column existed) derived from the place ID. */
/** Any lead-shaped record (a stored row or a view). */
type LeadLike = Readonly<Record<string, string | undefined>>;

export const leadOrigin = (l: LeadLike): LeadOrigin =>
  l.origin === 'team' || l.origin === 'find_clients' ? l.origin : l.placeId || l.source === 'Google Places' ? 'find_clients' : 'team';

// ─── Results ────────────────────────────────────────────────────────────────

export const CHECK_FIELDS = ['businessName', 'phone', 'area', 'city', 'website', 'category'] as const;
export type CheckField = (typeof CHECK_FIELDS)[number];
export const CHECK_FIELD_LABEL: Record<CheckField, string> = {
  businessName: 'Business name', phone: 'Phone', area: 'Area', city: 'City', website: 'Website', category: 'Category',
};

/** same · different · only on Google · only ours · neither has it. */
export type FieldCode = 'same' | 'different' | 'google_only' | 'ours_only' | 'empty';
export type FieldCodes = Record<CheckField, FieldCode>;

/**
 * '' not checked · matches · needs_review · reviewed (differences seen, ours kept)
 * · pick (several plausible) · not_found (search found nothing) · not_on_google (marked by a founder).
 */
export type CheckStatus = '' | 'matches' | 'needs_review' | 'reviewed' | 'pick' | 'not_found' | 'not_on_google';

export function overallStatus(codes: FieldCodes): 'matches' | 'needs_review' {
  return Object.values(codes).some((c) => c === 'different' || c === 'google_only') ? 'needs_review' : 'matches';
}

export function parseCodes(json: string | undefined | null): FieldCodes | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, string>;
    const ok: FieldCode[] = ['same', 'different', 'google_only', 'ours_only', 'empty'];
    const out = {} as FieldCodes;
    for (const f of CHECK_FIELDS) out[f] = ok.includes(o[f] as FieldCode) ? (o[f] as FieldCode) : 'empty';
    return out;
  } catch {
    return null;
  }
}

// ─── Normalisation ──────────────────────────────────────────────────────────

/** Case, accents, punctuation and extra spaces ignored; "&" reads as "and". */
export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const normPhone = (s: string | null | undefined) => normalizePhone(s ?? '') ?? '';

const SOCIAL = new Set(['instagram.com', 'facebook.com', 'fb.com', 'linktr.ee', 'wa.me']);

/** Websites compare by domain ("https://www.x.in/home" = "x.in"); social profiles by domain + handle. */
export function normWebsite(s: string | null | undefined): string {
  let v = (s ?? '').trim();
  if (!v) return '';
  if (/^@[\w.]+$/.test(v)) return `instagram.com/${v.slice(1).toLowerCase()}`;
  if (!/^[a-z]+:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    if (!host.includes('.')) return '';
    if (SOCIAL.has(host)) {
      const handle = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
      return handle ? `${host}/${handle}` : host;
    }
    return host;
  } catch {
    return '';
  }
}

const CITY_ALIASES: string[][] = [
  ['bengaluru', 'bangalore'], ['mumbai', 'bombay'], ['gurugram', 'gurgaon'], ['kolkata', 'calcutta'], ['chennai', 'madras'],
  ['prayagraj', 'allahabad'], ['puducherry', 'pondicherry'], ['thiruvananthapuram', 'trivandrum'], ['kochi', 'cochin'],
  ['vadodara', 'baroda'], ['mysuru', 'mysore'], ['varanasi', 'banaras', 'benares'], ['new delhi', 'delhi'],
];
export function normPlace(s: string | null | undefined): string {
  const n = normName(s);
  for (const group of CITY_ALIASES) if (group.includes(n)) return group[0];
  return n;
}

// ─── Categories ─────────────────────────────────────────────────────────────

type Category = (typeof BUSINESS_CATEGORIES)[number];

/** Google place types → our categories. Most specific types first. */
const GOOGLE_TYPES: [Category, string[]][] = [
  ['Dentist', ['dentist', 'dental_clinic']],
  ['Hospital', ['hospital', 'general_hospital']],
  ['Pharmacy', ['pharmacy', 'drugstore']],
  ['Clinic / Doctor', ['doctor', 'medical_clinic', 'medical_center', 'physiotherapist', 'chiropractor', 'medical_lab', 'skin_care_clinic']],
  ['Yoga studio', ['yoga_studio']],
  ['Gym / Fitness', ['gym', 'fitness_center', 'sports_club', 'sports_complex', 'pilates_studio']],
  ['Bakery', ['bakery', 'cake_shop', 'pastry_shop', 'dessert_shop']],
  ['Restaurant / Café', ['restaurant', 'cafe', 'coffee_shop', 'tea_house', 'meal_takeaway', 'meal_delivery', 'fast_food_restaurant', 'food_court', 'bar', 'pub', 'juice_shop', 'ice_cream_shop', 'cafeteria', 'diner', 'pizza_restaurant', 'indian_restaurant', 'vegetarian_restaurant']],
  ['Salon / Spa', ['beauty_salon', 'hair_salon', 'hair_care', 'barber_shop', 'nail_salon', 'spa', 'beautician', 'makeup_artist', 'massage', 'wellness_center', 'sauna']],
  ['School', ['school', 'primary_school', 'secondary_school', 'preschool']],
  ['Coaching / Education', ['university', 'educational_institution', 'tutoring', 'library']],
  ['Hotel', ['hotel', 'lodging', 'resort_hotel', 'motel', 'guest_house', 'hostel', 'bed_and_breakfast', 'inn', 'extended_stay_hotel']],
  ['Real estate agency', ['real_estate_agency']],
  ['Jewellery store', ['jewelry_store']],
  ['Car dealer', ['car_dealer', 'car_rental']],
  ['Interior designer', ['interior_designer', 'furniture_store', 'home_improvement_store']],
  ['Event planner', ['event_planner', 'wedding_venue', 'event_venue', 'banquet_hall']],
  ['Boutique', ['clothing_store', 'womens_clothing_store', 'boutique']],
  ['Retail shop', ['store', 'shopping_mall', 'supermarket', 'grocery_store', 'convenience_store', 'electronics_store', 'shoe_store', 'gift_shop', 'department_store', 'market', 'book_store', 'hardware_store', 'sporting_goods_store', 'cell_phone_store', 'home_goods_store']],
];

/** Our category for Google's primary type / types ('' when none map). */
export function categoryFromGoogle(primaryType: string | null | undefined, types: readonly string[] | null | undefined): string {
  const all = [primaryType ?? '', ...(types ?? [])].filter(Boolean);
  for (const t of all) for (const [cat, list] of GOOGLE_TYPES) if (list.includes(t)) return cat;
  return '';
}

/** Our category text (possibly free text like "Salon" or "cafe") → a canonical category where one fits. */
export function canonicalCategory(s: string | null | undefined): string {
  const n = normName(s);
  if (!n) return '';
  for (const c of BUSINESS_CATEGORIES) {
    if (normName(c) === n) return c;
    // "Salon", "Spa", "Gym", "Café", "Doctor"… each half of "A / B" counts.
    if (c.includes('/') && c.split('/').some((part) => normName(part) === n)) return c;
  }
  const alias: Record<string, Category> = {
    cafe: 'Restaurant / Café', coffee: 'Restaurant / Café', dental: 'Dentist', dental_clinic: 'Dentist', jewellery: 'Jewellery store',
    jewelry: 'Jewellery store', hotel: 'Hotel', clinic: 'Clinic / Doctor', coaching: 'Coaching / Education', yoga: 'Yoga studio',
  };
  return alias[n] ?? alias[n.replace(/ /g, '_')] ?? n;
}

// ─── The comparison ─────────────────────────────────────────────────────────

/** What a lead says, in the six compared fields. */
export interface OurSide { businessName: string; phone: string; area: string; city: string; website: string; category: string }
/** What Google says (held in memory only, never stored). */
export interface GoogleSide { businessName: string; phone: string; area: string; city: string; website: string; category: string; address: string }

/**
 * A lead's single "City / area" field may hold "MP Nagar, Bhopal". With no
 * separate area, the last part is the city and the rest the area.
 */
export function ourSide(l: LeadLike): OurSide {
  let area = (l.area ?? '').trim();
  let city = (l.city ?? '').trim();
  if (!area && city.includes(',')) {
    const parts = city.split(',').map((p) => p.trim()).filter(Boolean);
    city = parts.pop() ?? '';
    area = parts.join(', ');
  }
  return { businessName: l.businessName ?? '', phone: l.phone ?? '', area, city, website: l.websiteOrInstagram ?? '', category: l.category ?? '' };
}

function code(ours: string, theirs: string, same: (a: string, b: string) => boolean): FieldCode {
  if (!ours && !theirs) return 'empty';
  if (!theirs) return 'ours_only';
  if (!ours) return 'google_only';
  return same(ours, theirs) ? 'same' : 'different';
}

export function compareLead(ours: OurSide, g: GoogleSide): FieldCodes {
  const addr = ` ${normName(g.address)} `;
  const inAddress = (v: string) => Boolean(normName(v)) && addr.includes(` ${normName(v)} `);
  return {
    businessName: code(normName(ours.businessName), normName(g.businessName), (a, b) => a === b),
    phone: code(normPhone(ours.phone) || ours.phone.trim(), normPhone(g.phone), (a, b) => a === b),
    // Google may give no separate area/city part; then its address decides.
    area: code(ours.area.trim(), g.area.trim() || (inAddress(ours.area) ? ours.area.trim() : ''), (a, b) => normPlace(a) === normPlace(b) || inAddress(a)),
    city: code(ours.city.trim(), g.city.trim() || (inAddress(ours.city) ? ours.city.trim() : ''), (a, b) => normPlace(a) === normPlace(b) || inAddress(a)),
    website: code(normWebsite(ours.website) || ours.website.trim(), normWebsite(g.website), (a, b) => a === b),
    category: code(ours.category.trim(), g.category, (a, b) => canonicalCategory(a) === canonicalCategory(b)),
  };
}

// ─── Choosing the candidate ─────────────────────────────────────────────────

const bigrams = (s: string) => {
  const t = s.replace(/ /g, '');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
};

/** 0…1. Dice over letter pairs; a name whose words are all in the other scores at least 0.9. */
export function nameSimilarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const wx = x.split(' ');
  const wy = y.split(' ');
  const subset = wx.every((w) => wy.includes(w)) || wy.every((w) => wx.includes(w));
  const bx = bigrams(x);
  const by = bigrams(y);
  const pool = [...by];
  let hits = 0;
  for (const g of bx) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      hits++;
      pool.splice(i, 1);
    }
  }
  const dice = bx.length + by.length ? (2 * hits) / (bx.length + by.length) : 0;
  return subset ? Math.max(dice, 0.9) : dice;
}

export const CONFIDENT_NAME = 0.85;
export const PLAUSIBLE_NAME = 0.5;

export type MatchDecision =
  | { kind: 'match'; index: number }
  | { kind: 'pick'; indexes: number[] }
  | { kind: 'none' };

/**
 * One confident match → compare it. Several plausible → pick. None → not found.
 *  - confident: same phone, or (name ≥ 0.85 and same city) — and no other candidate is also confident;
 *  - plausible: same phone, or name ≥ 0.5.
 * Candidates are ranked best first; at most 5 are offered.
 */
export function decideMatch(ours: OurSide, candidates: GoogleSide[]): MatchDecision {
  const phone = normPhone(ours.phone);
  const city = normPlace(ours.city);
  const scored = candidates.map((g, index) => {
    const phoneHit = Boolean(phone) && normPhone(g.phone) === phone;
    const name = nameSimilarity(ours.businessName, g.businessName);
    const cityHit = !city || normPlace(g.city) === city || ` ${normName(g.address)} `.includes(` ${normName(ours.city)} `);
    return { index, phoneHit, name, cityHit, confident: phoneHit || (name >= CONFIDENT_NAME && cityHit), plausible: phoneHit || name >= PLAUSIBLE_NAME };
  });
  const byPhone = scored.filter((s) => s.phoneHit);
  if (byPhone.length === 1) return { kind: 'match', index: byPhone[0].index };
  const confident = scored.filter((s) => s.confident);
  if (confident.length === 1) return { kind: 'match', index: confident[0].index };
  const plausible = scored
    .filter((s) => s.plausible)
    .sort((a, b) => Number(b.phoneHit) - Number(a.phoneHit) || Number(b.cityHit) - Number(a.cityHit) || b.name - a.name)
    .slice(0, 5);
  if (plausible.length === 0) return { kind: 'none' };
  return { kind: 'pick', indexes: plausible.map((s) => s.index) };
}

/** The Google search text: business name plus area and city. */
export function checkQuery(ours: OurSide): string {
  return [ours.businessName, ours.area, ours.city].map((s) => s.trim()).filter(Boolean).join(', ');
}
