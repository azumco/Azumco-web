// "Check against Google": normalisation, per-field comparison and the choice of
// candidate. Pure functions; every name, number and site here is fictitious.

import { describe, expect, it } from 'vitest';
import {
  canRunLeadCheck, canonicalCategory, categoryFromGoogle, checkQuery, compareLead, decideMatch, leadOrigin, nameSimilarity,
  normName, normPhone, normWebsite, ourSide, overallStatus, parseCodes, type GoogleSide,
} from '../../shared/leadCheck.ts';

const g = (o: Partial<GoogleSide>): GoogleSide => ({ businessName: '', phone: '', area: '', city: '', website: '', category: '', address: '', ...o });

describe('normalisation', () => {
  it('names: case, accents, punctuation, "&" and extra spaces are ignored', () => {
    expect(normName('  Café   BREWTOPIA!! ')).toBe('cafe brewtopia');
    expect(normName('Glow Salon & Spa')).toBe('glow salon and spa');
    expect(normName("Dr. Mehta's  Dental")).toBe(normName('dr mehta s dental'));
    expect(normName('')).toBe('');
    expect(normName(undefined)).toBe('');
  });

  it('phones: E.164 with India as the default', () => {
    for (const v of ['98260 55555', '098260-55555', '919826055555', '+91 98260 55555', '0091 98260 55555']) expect(normPhone(v)).toBe('+919826055555');
    expect(normPhone('0755 2345678')).toBe('+917552345678');
    expect(normPhone('+1 415 555 0100')).toBe('+14155550100');
    expect(normPhone('12345')).toBe('');
    expect(normPhone('')).toBe('');
  });

  it('websites by domain; social profiles by domain and handle', () => {
    expect(normWebsite('https://www.ironfitgym.in/home?x=1')).toBe('ironfitgym.in');
    expect(normWebsite('ironfitgym.in')).toBe('ironfitgym.in');
    expect(normWebsite('HTTP://IronFitGym.IN/')).toBe('ironfitgym.in');
    expect(normWebsite('@glow.salon')).toBe('instagram.com/glow.salon');
    expect(normWebsite('https://instagram.com/glow.salon/')).toBe('instagram.com/glow.salon');
    expect(normWebsite('https://instagram.com/other')).not.toBe(normWebsite('@glow.salon'));
    expect(normWebsite('not a site')).toBe('');
    expect(normWebsite('')).toBe('');
  });

  it("categories: Google's types map to ours; our free text maps to the canonical one", () => {
    expect(categoryFromGoogle('gym', [])).toBe('Gym / Fitness');
    expect(categoryFromGoogle('', ['point_of_interest', 'beauty_salon'])).toBe('Salon / Spa');
    expect(categoryFromGoogle('dental_clinic', ['dentist', 'doctor'])).toBe('Dentist');
    expect(categoryFromGoogle('coffee_shop', ['cafe'])).toBe('Restaurant / Café');
    expect(categoryFromGoogle('', ['point_of_interest', 'establishment'])).toBe('');
    expect(canonicalCategory('Salon')).toBe('Salon / Spa');
    expect(canonicalCategory('cafe')).toBe('Restaurant / Café');
    expect(canonicalCategory('GYM')).toBe('Gym / Fitness');
    expect(canonicalCategory('Gym / Fitness')).toBe('Gym / Fitness');
    expect(canonicalCategory('Tattoo parlour')).toBe('tattoo parlour');
    expect(canonicalCategory('')).toBe('');
  });
});

describe('per-field comparison and overall status', () => {
  const lead = { businessName: 'Iron Fit Gym', phone: '+919826033302', area: 'New Market', city: 'Bhopal', websiteOrInstagram: 'ironfitgym.in', category: 'Gym' };

  it('everything the same → matches', () => {
    const codes = compareLead(ourSide(lead), g({ businessName: 'IRON FIT GYM', phone: '+91 98260 33302', area: 'New Market', city: 'Bhopal', website: 'https://www.ironfitgym.in/', category: 'Gym / Fitness', address: 'New Market, Bhopal, Madhya Pradesh' }));
    expect(codes).toEqual({ businessName: 'same', phone: 'same', area: 'same', city: 'same', website: 'same', category: 'same' });
    expect(overallStatus(codes)).toBe('matches');
  });

  it('different, only on Google, only ours and empty', () => {
    const codes = compareLead(ourSide({ businessName: 'Glow Salon', phone: '9826012030', city: 'Bhopal', category: 'Salon' }), g({ businessName: 'Glow Salon & Spa', phone: '+91 97000 44100', area: 'MP Nagar', city: 'Bhopal', website: 'https://glowsalon.in', category: '' }));
    expect(codes).toEqual({ businessName: 'different', phone: 'different', area: 'google_only', city: 'same', website: 'google_only', category: 'ours_only' });
    expect(overallStatus(codes)).toBe('needs_review');
    // "Only ours" alone does not need review.
    expect(overallStatus({ businessName: 'same', phone: 'ours_only', area: 'empty', city: 'same', website: 'ours_only', category: 'same' })).toBe('matches');
  });

  it('city aliases, and an area found in the address, count as the same', () => {
    const codes = compareLead(ourSide({ businessName: 'X', area: 'Indiranagar', city: 'Bangalore' }), g({ businessName: 'X', area: 'HAL 2nd Stage', city: 'Bengaluru', address: '12, 100 Feet Rd, Indiranagar, Bengaluru, Karnataka' }));
    expect(codes.city).toBe('same');
    expect(codes.area).toBe('same');
  });

  it('with no separate area part, an area named in the address is the same', () => {
    expect(compareLead(ourSide({ businessName: 'X', area: 'Vijay Nagar', city: 'Indore' }), g({ businessName: 'X', address: 'Scheme 54, Vijay Nagar, Indore' }))).toMatchObject({ area: 'same', city: 'same' });
    expect(compareLead(ourSide({ businessName: 'X', area: 'Palasia', city: 'Indore' }), g({ businessName: 'X', address: 'Rau, Indore' }))).toMatchObject({ area: 'ours_only', city: 'same' });
  });

  it('a combined "Area, City" field is split for comparison', () => {
    expect(ourSide({ city: 'MP Nagar, Bhopal' })).toMatchObject({ area: 'MP Nagar', city: 'Bhopal' });
    expect(ourSide({ area: 'Arera Colony', city: 'Bhopal' })).toMatchObject({ area: 'Arera Colony', city: 'Bhopal' });
    expect(checkQuery(ourSide({ businessName: 'Glow Salon', city: 'MP Nagar, Bhopal' }))).toBe('Glow Salon, MP Nagar, Bhopal');
  });

  it('stored codes parse back; junk is ignored', () => {
    expect(parseCodes('{"businessName":"same","phone":"bogus"}')).toMatchObject({ businessName: 'same', phone: 'empty' });
    expect(parseCodes('not json')).toBeNull();
    expect(parseCodes('')).toBeNull();
  });
});

describe('choosing the candidate', () => {
  const ours = ourSide({ businessName: 'Café Brewtopia', phone: '9900077150', area: 'Vijay Nagar', city: 'Indore' });

  it('name similarity', () => {
    expect(nameSimilarity('Glow Salon', 'Glow Salon & Spa')).toBeGreaterThanOrEqual(0.9);
    expect(nameSimilarity('Cafe Brewtopia', 'Café Brewtopia')).toBe(1);
    expect(nameSimilarity('Iron Fit Gym', 'Sunrise Bakery')).toBeLessThan(0.3);
    expect(nameSimilarity('', 'x')).toBe(0);
  });

  it('a phone match is confident on its own', () => {
    const d = decideMatch(ours, [g({ businessName: 'Brewtopia Coffee Co.', city: 'Indore' }), g({ businessName: 'Totally Different', phone: '+91 99000 77150', city: 'Indore' })]);
    expect(d).toEqual({ kind: 'match', index: 1 });
  });

  it('one strong name in the same city is confident', () => {
    const d = decideMatch(ourSide({ businessName: 'Iron Fit Gym', city: 'Bhopal' }), [g({ businessName: 'Iron Fit Gym', city: 'Bhopal' }), g({ businessName: 'Fit Zone', city: 'Bhopal' })]);
    expect(d).toEqual({ kind: 'match', index: 0 });
  });

  it('a strong name in another city is not confident', () => {
    const d = decideMatch(ourSide({ businessName: 'Iron Fit Gym', city: 'Bhopal' }), [g({ businessName: 'Iron Fit Gym', city: 'Pune', address: 'Pune' })]);
    expect(d).toEqual({ kind: 'pick', indexes: [0] });
  });

  it('several plausible → pick, best first, at most 5', () => {
    const many = [
      g({ businessName: 'Brew Topia Kitchen', city: 'Rau' }),
      g({ businessName: 'Cafe Brewtopia', city: 'Indore' }),
      g({ businessName: 'Café Brewtopia', city: 'Indore' }),
      ...Array.from({ length: 4 }, (_, i) => g({ businessName: `Brewtopia ${i}`, city: 'Indore' })),
    ];
    const d = decideMatch(ours, many);
    expect(d.kind).toBe('pick');
    if (d.kind === 'pick') {
      expect(d.indexes.length).toBe(5);
      expect([1, 2]).toContain(d.indexes[0]);
    }
  });

  it('nothing plausible → none', () => {
    expect(decideMatch(ours, [g({ businessName: 'Sunrise Bakery', city: 'Indore' })])).toEqual({ kind: 'none' });
    expect(decideMatch(ours, [])).toEqual({ kind: 'none' });
  });
});

describe('who and what', () => {
  it('only founders run checks', () => {
    expect(canRunLeadCheck({ role: 'admin' })).toBe(true);
    expect(canRunLeadCheck({ role: 'super_admin' })).toBe(true);
    expect(canRunLeadCheck({ role: 'employee' })).toBe(false);
  });
  it('origin: stored, or derived from the place ID for older rows', () => {
    expect(leadOrigin({ origin: 'team', placeId: '' })).toBe('team');
    expect(leadOrigin({ origin: '', placeId: 'ChIJ_x' })).toBe('find_clients');
    expect(leadOrigin({ origin: '', source: 'Google Places' })).toBe('find_clients');
    expect(leadOrigin({ origin: '', placeId: '', source: 'Instagram' })).toBe('team');
  });
});
