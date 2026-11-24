// LOCAL DEMO ONLY: the full app on an in-memory store, with fictitious people,
// businesses and a mocked Google Places client — for clicking around without
// touching the real spreadsheet or spending Google calls.
//
//   DEMO_DATA=true npm run dev:demo      → http://localhost:8095/team
//
// Refuses to run unless DEMO_DATA=true, and refuses outright if a spreadsheet
// id is configured or NODE_ENV is production: demo rows can never reach the
// production spreadsheet. Nothing here is imported by the real server.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.ts';
import { createApp } from '../app.ts';
import { bootstrap } from '../bootstrap.ts';
import { Db } from '../sheets/db.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { PlacesHttpError, type CheckPlace, type PlacesClient, type PlaceResult } from '../places/client.ts';
import { istDate } from '../../shared/time.ts';
import { addDays } from '../../shared/slots.ts';

/** Throws unless demo data is explicitly allowed and cannot reach Sheets. */
export function assertDemoAllowed(env: NodeJS.ProcessEnv): void {
  if (env.DEMO_DATA !== 'true') throw new Error('Refusing to seed demo data: set DEMO_DATA=true to run the local demo.');
  if (env.GOOGLE_SHEETS_SPREADSHEET_ID) throw new Error('Refusing to seed demo data: GOOGLE_SHEETS_SPREADSHEET_ID is configured.');
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data: NODE_ENV is production.');
}

const FAKE: PlaceResult[] = Array.from({ length: 20 }, (_, i) => ({
  placeId: `demo_place_${i}`,
  name: `${['Demo Fitness', 'Sample Gym', 'Example Studio', 'Test Strength'][i % 4]} ${i + 1}`,
  address: `${10 + i} Demo Road, Sample Nagar`,
  phone: `+91 90000 0${String(i).padStart(4, '0')}`,
  website: i % 3 ? `https://example.com/demo-${i}` : '',
}));

/** Lead check scenarios, chosen by the start of the search text. */
const cp = (o: Partial<CheckPlace> & { placeId: string; name: string }): CheckPlace => ({ address: '', phone: '', website: '', area: '', city: '', types: [], primaryType: '', rating: null, ratingCount: null, ...o });
const CHECKS: Record<string, CheckPlace[]> = {
  'Demo Iron Gym': [cp({ placeId: 'demo_chk_iron', name: 'Demo Iron Gym', phone: '+91 98765 00021', area: 'New Market', city: 'Bhopal', website: 'https://demo-iron.example', primaryType: 'gym', address: 'New Market, Bhopal, Madhya Pradesh', rating: 4.6, ratingCount: 212 })],
  'Demo Salon': [cp({ placeId: 'demo_chk_salon', name: 'Demo Salon & Spa', phone: '+91 97000 44100', area: 'Vijay Nagar', city: 'Indore', website: 'https://demo-salon.example', primaryType: 'beauty_salon', address: 'Vijay Nagar, Indore, Madhya Pradesh', rating: 4.2, ratingCount: 88 })],
  'Demo Brew Cafe': [
    cp({ placeId: 'demo_chk_brew1', name: 'Demo Brew Cafe Vijay Nagar', city: 'Indore', address: 'Scheme 54, Vijay Nagar, Indore', primaryType: 'cafe', rating: 4.4, ratingCount: 312 }),
    cp({ placeId: 'demo_chk_brew2', name: 'Demo Brew Cafe Palasia', city: 'Indore', address: 'Palasia, Indore', primaryType: 'coffee_shop', rating: 4.1, ratingCount: 88 }),
    cp({ placeId: 'demo_chk_brew3', name: 'Demo Brew Cafe Rau', city: 'Indore', address: 'Rau, Indore', primaryType: 'restaurant', rating: 3.9, ratingCount: 41 }),
  ],
};

const mockPlaces: PlacesClient = {
  async checkSearch(q, limit) {
    if (q.startsWith('Demo Offline')) throw new PlacesHttpError(503, 'demo outage');
    const key = Object.keys(CHECKS).find((k) => q.startsWith(k));
    return (key ? CHECKS[key] : []).slice(0, limit);
  },
  async checkDetails(id) {
    const p = Object.values(CHECKS).flat().find((x) => x.placeId === id);
    if (!p) throw new Error('not found');
    return p;
  },
  async searchText(_q, limit) {
    return FAKE.slice(0, limit);
  },
  async placeDetails(id) {
    return FAKE.find((p) => p.placeId === id) ?? FAKE[0];
  },
};

export const DEMO_ACCOUNTS = {
  founder: { email: 'demo.owner@azumco.com', password: 'demo-Owner-pass1' },
  employee: { email: 'demo.staff@azumco.com', password: 'demo-Staff-pass1' },
};

async function main() {
  try {
    assertDemoAllowed(process.env);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const config = loadConfig({
    NODE_ENV: 'development',
    SHEETS_BACKEND: 'memory',
    SESSION_SECRET: 'demo-only-session-secret-not-for-production',
    CRON_TOKEN: 'demo-only-cron-token-not-for-production-use',
    SUPERADMIN_EMAIL: DEMO_ACCOUNTS.founder.email,
    SUPERADMIN_NAME: 'Demo Founder',
    SUPERADMIN_INITIAL_PASSWORD: 'demo-Initial-1',
    TEAM_USERS: JSON.stringify([
      { name: 'Second Founder', email: 'demo.founder2@azumco.com', role: 'admin' },
      { name: 'Third Founder', email: 'demo.founder3@azumco.com', role: 'admin' },
      { name: 'Demo Caller', email: DEMO_ACCOUNTS.employee.email, role: 'employee' },
      { name: 'Second Caller', email: 'demo.staff2@azumco.com', role: 'employee' },
    ]),
  });
  const db = new Db(new MemoryBackend());
  const ready = bootstrap(config, db);
  await ready;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const app = createApp({ config, db, ready, staticDir: path.resolve(here, '..', '..', 'dist'), placesClient: mockPlaces });
  const port = Number(process.env.PORT) || 8095;
  await new Promise<void>((r) => app.listen(port, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${port}`;

  class C {
    cookie = '';
    csrf = '';
    async req(method: string, p: string, body?: unknown) {
      const res = await fetch(base + p, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'azumco', Cookie: this.cookie, 'X-CSRF-Token': this.csrf },
        body: body ? JSON.stringify(body) : undefined,
      });
      const sc = res.headers.get('set-cookie');
      if (sc) this.cookie = sc.split(';')[0];
      const j = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (j.csrfToken) this.csrf = j.csrfToken;
      if (!res.ok) console.warn('demo seed:', method, p, res.status, j.error);
      return j;
    }
  }

  const owner = new C();
  await owner.req('POST', '/api/auth/login', { email: DEMO_ACCOUNTS.founder.email, password: 'demo-Initial-1' });
  await owner.req('POST', '/api/auth/change-password', { currentPassword: 'demo-Initial-1', newPassword: DEMO_ACCOUNTS.founder.password });
  const users = (await owner.req('GET', '/api/users')).users as { id: string; email: string }[];
  const signIn = async (email: string, pw: string) => {
    const u = users.find((x) => x.email === email)!;
    const { tempPassword } = await owner.req('POST', `/api/users/${u.id}/temp-password`, {});
    const c = new C();
    await c.req('POST', '/api/auth/login', { email, password: tempPassword });
    await c.req('POST', '/api/auth/change-password', { currentPassword: tempPassword, newPassword: pw });
    return { c, id: u.id };
  };
  const f2 = await signIn('demo.founder2@azumco.com', 'demo-Founder2-pass1');
  const staff = await signIn(DEMO_ACCOUNTS.employee.email, DEMO_ACCOUNTS.employee.password);
  await signIn('demo.staff2@azumco.com', 'demo-Staff2-pass1');

  const today = istDate();
  const days = [1, 2, 3].map((n) => addDays(today, n));
  await owner.req('POST', '/api/availability/batch', { dates: [days[0], days[2]], start: '18:00', end: '20:00', slotMinutes: 30, repeatWeekly: true });
  await f2.c.req('POST', '/api/availability/batch', { dates: [days[1]], start: '11:00', end: '14:00', slotMinutes: 30, repeatWeekly: false });

  const s = await f2.c.req('POST', '/api/places/search', { category: 'Gym / Fitness', state: 'Madhya Pradesh', city: 'Bhopal', limit: 6 });
  await f2.c.req('POST', '/api/places/import', { category: 'Gym', city: 'Bhopal', searchedAt: s.searchedAt, placeIds: s.results.slice(0, 3).map((r: { placeId: string }) => r.placeId), assignTo: staff.id, windowHours: 24 });
  await f2.c.req('POST', '/api/places/import', { category: 'Gym', city: 'Bhopal', searchedAt: s.searchedAt, placeIds: [s.results[3].placeId] });
  const m1 = await owner.req('POST', '/api/leads', { businessName: 'Demo Salon', category: 'Salon / Spa', city: 'Indore', contactPerson: 'Demo Contact', phone: '9876500011', source: 'Instagram', assignTo: staff.id });
  const m2 = await owner.req('POST', '/api/leads', { businessName: 'Sample Dental Clinic', category: 'Dentist', city: 'Ujjain', phone: '9876500012', source: 'Referral', assignTo: staff.id });
  await staff.c.req('POST', `/api/leads/${m2.id}/calls`, { outcome: 'Interested', rating: 'Good', need: 'Website, Social media', nextStep: 'Book discovery call', followUpDate: today });
  await staff.c.req('POST', `/api/leads/${m1.id}/calls`, { outcome: 'Busy · call later', followUpDate: addDays(today, 2) });
  const slots = (await staff.c.req('GET', `/api/slots?from=${days[0]}&days=3`)).slots;
  if (slots?.[0]) await staff.c.req('POST', '/api/bookings', { leadId: m2.id, founderId: slots[0].founderId, date: slots[0].date, start: slots[0].start, clientName: 'Demo Client', phone: '9876500012', mode: 'Zoho Cliq', link: '', notes: '' });
  await owner.req('PATCH', `/api/leads/${m2.id}`, { callHappened: true, status: 'Won', clientPaid: true, dealType: 'One-time', dealValue: 25000 });

  // Leads the team added by hand, for "Check against Google".
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Iron Gym', category: 'Gym / Fitness', area: 'New Market', city: 'Bhopal', phone: '98765 00021', websiteOrInstagram: 'demo-iron.example' });
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Brew Cafe', category: 'Restaurant / Café', area: 'Vijay Nagar', city: 'Indore', phone: '98765 00022' });
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Nowhere Bakery', category: 'Bakery', city: 'Bhopal', phone: '98765 00023' });
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Salon Studio', category: 'Salon / Spa', city: 'Indore', phone: '97000 44100' });
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Salon & Spa', category: 'Salon / Spa', city: 'Indore' });
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Offline Tailor', category: 'Boutique', city: 'Bhopal', phone: '98765 00026' });
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Lotus Sweets', category: 'Bakery', city: 'Bhopal', phone: '98765 00027' });
  await staff.c.req('POST', '/api/leads', { businessName: 'Demo Iron Gym Annex', category: 'Gym / Fitness', city: 'Bhopal', phone: '98765 00028' });

  console.log(`DEMO READY ${base}/team  founder ${DEMO_ACCOUNTS.founder.email}  employee ${DEMO_ACCOUNTS.employee.email} (demo passwords in server/dev/demo.ts)`);
}

// Run only when executed directly (tests import assertDemoAllowed).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void main();
