// Postgres-only: concurrency that the database must make safe, the schema's
// constraints, and import idempotency. Runs under `npm run test:pg`; skipped
// on the in-memory backend.

import { describe, expect, it, afterEach } from 'vitest';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, PG, memberClient, startHarness, superAdmin, testConfig, testPool, type Harness } from './harness.ts';
import { PgDb } from '../db/pgdb.ts';
import { claimPlacesCall } from '../places/budget.ts';
import { BookingService } from '../bookings/service.ts';
import { runMaintenance } from '../leads/service.ts';
import { toSessionUser } from '../auth/sessions.ts';
import { Db } from '../sheets/db.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import { bootstrap } from '../bootstrap.ts';
import { importRows, readAllRows, verify } from '../db/transfer.ts';
import type { PlacesClient } from '../places/client.ts';

const d = PG ? describe : describe.skip;
/** Read straight from the database (another "server" may just have written). */
const fresh = async (t: Parameters<Harness['db']['all']>[0]) => (await h!.db.loadFresh([t]))[0].rows;
let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

const places: PlacesClient = {
  async searchText(_q, limit) {
    return Array.from({ length: limit }, (_, i) => ({ placeId: `ChIJ_fake_place_pg_${i}`, name: 'X', address: 'Y', phone: '', website: '' }));
  },
  async placeDetails(id) {
    return { placeId: id, name: 'X', address: 'Y', phone: '', website: '' };
  },
};

d('Postgres schema', () => {
  it('has the constraints, RLS on every table, and an append-only audit log', async () => {
    h = await startHarness();
    const pool = await testPool();
    const idx = (await pool.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname = $1`, [pool.schema])).rows.map((r) => r.indexname);
    for (const name of ['users_email_unique', 'sessions_token_unique', 'settings_key_unique', 'meta_key_unique', 'expirations_lead_deadline_unique', 'milestone_items_expense_unique', 'leads_place_unique']) expect(idx).toContain(name);
    const cons = (await pool.query<{ conname: string; contype: string }>(`SELECT conname, contype FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1`, [pool.schema])).rows;
    expect(cons.find((c) => c.conname === 'bookings_no_double_booking')?.contype).toBe('x'); // exclusion
    expect(cons.filter((c) => c.contype === 'f').length).toBeGreaterThanOrEqual(10); // foreign keys
    const rls = (await pool.query<{ relname: string; relrowsecurity: boolean }>(`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname <> 'schema_migrations'`, [pool.schema])).rows;
    expect(rls.length).toBe(19);
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    const policies = (await pool.query(`SELECT 1 FROM pg_policies WHERE schemaname = $1`, [pool.schema])).rowCount;
    expect(policies).toBe(0); // deny by default
    // Audit: insert works, update and delete are refused.
    const a = await h.db.insert('Audit', { at: new Date().toISOString(), actorId: 't', action: 'test' }, 't');
    await expect(pool.query(`UPDATE "audit" SET "action" = 'changed' WHERE "id" = $1`, [a.id])).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM "audit" WHERE "id" = $1`, [a.id])).rejects.toThrow(/append-only/);
    // Unique email, case-insensitive.
    const u = (await fresh('Users'))[0];
    await expect(h.db.insert('Users', { ...u, id: '', email: u.email.toUpperCase() }, 't')).rejects.toThrow();
  });
});

d('Concurrency on Postgres', () => {
  it('parallel bookings of one slot from two servers: exactly one wins, and the database refuses an overlap outright', async () => {
    h = await startHarness();
    const owner = await superAdmin(h);
    const admin = await memberClient(h, owner, ADMIN_EMAIL);
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
    await admin.client.req('POST', '/api/availability', { date: '2026-11-23', start: '10:00', end: '11:00', slotMinutes: 30 });
    const lead = (await admin.client.req('POST', '/api/leads', { businessName: 'Race Co', assignTo: staff.id })).body.id;
    const user = toSessionUser((await fresh('Users')).find((u) => u.id === staff.id)!);
    const other = await h.secondDb();
    const body = { leadId: lead, founderId: admin.id, date: '2026-11-23', start: '10:00', clientName: 'C', mode: 'Phone call', phone: '', link: '', notes: '' } as never;
    const results = await Promise.allSettled([1, 2, 3, 4].map((i) => new BookingService(i % 2 ? h!.db : other).book(user, body)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await fresh('Bookings')).filter((b) => b.status === 'booked')).toHaveLength(1);
    // Bypassing the app: the exclusion constraint itself refuses an overlapping active booking.
    const pg = h.db as PgDb;
    const base = (await fresh('Bookings'))[0];
    await expect(pg.insertRaw('Bookings', [{ ...base, id: 'overlap-1', start: '10:15', end: '10:45' }])).rejects.toMatchObject({ code: '23P01' });
    // …but a cancelled one may overlap.
    await expect(pg.insertRaw('Bookings', [{ ...base, id: 'overlap-2', status: 'cancelled' }])).resolves.toBe(1);
  });

  it('parallel Places claims at the cap: the cap is never exceeded', async () => {
    h = await startHarness();
    const s = (await fresh('Settings')).find((r) => r.key === 'placesMonthlyCap')!;
    await h.db.update('Settings', s.id, { value: '3' }, 't');
    const other = await h.secondDb();
    const claims = await Promise.all(Array.from({ length: 12 }, (_, i) => claimPlacesCall(i % 2 ? h!.db : other, 'text_search_enterprise', 'u')));
    expect(claims.filter((c) => c.ok)).toHaveLength(3);
    const pool = await testPool();
    const usage = (await pool.query<{ used: number }>(`SELECT "used" FROM "places_usage"`)).rows;
    expect(usage.reduce((t, r) => t + r.used, 0)).toBe(3);
    expect((await fresh('PlacesClaims')).filter((c) => c.status === 'claimed')).toHaveLength(3);
    // Releasing an unbilled call gives the slot back, exactly once.
    const first = claims.find((c) => c.ok) as { ok: true; claimId: string };
    await Promise.all([(h.db as PgDb).releasePlacesCall(first.claimId, 'u'), (other as PgDb).releasePlacesCall(first.claimId, 'u')]);
    expect((await pool.query<{ used: number }>(`SELECT "used" FROM "places_usage"`)).rows[0].used).toBe(2);
  });

  it('parallel claims of one lead: one Google place becomes one lead; parallel assignment stays consistent', async () => {
    h = await startHarness(undefined, undefined, { placesClient: places });
    const owner = await superAdmin(h);
    const admin = await memberClient(h, owner, ADMIN_EMAIL);
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
    const search = await admin.client.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 1 });
    const body = { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', searchedAt: search.body.searchedAt, placeIds: ['ChIJ_fake_place_pg_0'] };
    const [a, b] = await Promise.all([admin.client.req('POST', '/api/places/import', body), owner.req('POST', '/api/places/import', body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const leads = (await fresh('Leads')).filter((l) => l.placeId === 'ChIJ_fake_place_pg_0');
    expect(leads).toHaveLength(1);
    // Two founders assign it at the same moment: one consistent final state, both recorded.
    const id = leads[0].id;
    const r = await Promise.all([
      admin.client.req('POST', '/api/leads/assign', { leadIds: [id], assigneeId: staff.id, hours: 24 }),
      owner.req('POST', '/api/leads/assign', { leadIds: [id], assigneeId: staff.id, hours: 48 }),
    ]);
    expect(r.map((x) => x.status)).toEqual([200, 200]);
    const after = (await h.db.find('Leads', id))!;
    expect(after.assignedTo).toBe(staff.id);
    const audits = (await fresh('Audit')).filter((e) => e.action === 'leads.assign' && e.after.includes(id));
    expect(audits).toHaveLength(2);
  });

  it('repeated, overlapping expiry sweeps: one notification per person and one audit entry', async () => {
    h = await startHarness(undefined, undefined, { placesClient: places });
    const owner = await superAdmin(h);
    const admin = await memberClient(h, owner, ADMIN_EMAIL);
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
    const search = await admin.client.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 1 });
    await admin.client.req('POST', '/api/places/import', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', searchedAt: search.body.searchedAt, placeIds: ['ChIJ_fake_place_pg_0'], assignTo: staff.id, windowHours: 12 });
    const lead = (await fresh('Leads'))[0];
    h.clock.advance(13 * 3_600_000);
    const other = await h.secondDb();
    await Promise.all([runMaintenance(h.db), runMaintenance(other), runMaintenance(h.db), runMaintenance(other)]);
    await runMaintenance(h.db);
    const notes = (await fresh('Notifications')).filter((n) => n.refId === lead.id && (n.type === 'lead_expired' || n.type === 'assignment_expired'));
    expect(notes.filter((n) => n.type === 'lead_expired')).toHaveLength(1);
    expect(notes.filter((n) => n.type === 'assignment_expired')).toHaveLength(2);
    expect((await fresh('Audit')).filter((a) => a.action === 'lead.assignment_expired' && a.entityId === lead.id)).toHaveLength(1);
    expect((await fresh('Expirations')).filter((e) => e.leadId === lead.id)).toHaveLength(1);
  });
});

d('Import from Sheets', () => {
  it('is idempotent: a second run inserts and changes nothing, and verification matches', async () => {
    // Source: a Sheets-shaped store with the real seeds plus some activity.
    const source = new Db(new MemoryBackend());
    await bootstrap(testConfig(), source);
    const users = await source.all('Users');
    const staff = users.find((u) => u.role === 'employee')!;
    const founder = users.find((u) => u.role === 'admin')!;
    const [lead] = await source.exclusive(() => source.insertManyUnqueued('Leads', [{ businessName: 'Import Co', status: 'Won', assignedTo: staff.id, callHappened: 'TRUE', clientPaid: 'TRUE', dealType: 'One-time', dealValue: '25000', commissionPaid: '2700', dateAdded: '2026-11-20' }], 't'));
    await source.insert('CallLog', { leadId: lead.id, at: '2026-11-20T06:00:00.000Z', userId: staff.id, outcome: 'Interested', note: '' }, 't');
    await source.insert('CallLog', { leadId: 'deleted-lead', at: '2026-11-19T06:00:00.000Z', userId: staff.id, outcome: 'No answer', note: '' }, 't');
    await source.insert('Bookings', { leadId: lead.id, founderId: founder.id, date: '2026-11-25', start: '10:00', end: '10:30', status: 'booked', clientName: 'C', phone: '', mode: 'Google Meet', link: 'https://meet.google.com/abc-defg-hij', notes: '', bookedBy: staff.id, callHappened: '' }, 't');
    await source.insert('Audit', { at: '2026-11-20T06:00:00.000Z', actorId: 't', action: 'test', entity: 'Leads', entityId: lead.id, before: JSON.stringify({ b: 1, a: 2 }), after: '', ip: '' }, 't');
    await source.insert('Sessions', { tokenHash: 'x', userId: staff.id, sessionVersion: '0', csrfToken: 'y', expiresAt: '2030-01-01T00:00:00.000Z', ip: '', userAgent: '' }, 't');
    const rows = await readAllRows(source);

    h = await startHarness(); // a fresh, empty Postgres store (plus its own seeds)
    const pool = await testPool();
    await pool.query(`TRUNCATE "users", "settings", "meta", "milestones", "milestone_items", "projects", "expenses", "contributions", "goals", "leads", "call_log", "expirations", "places_claims", "availability", "bookings", "notifications", "sessions", "places_usage" RESTART IDENTITY CASCADE`);
    await pool.query(`ALTER TABLE "audit" DISABLE TRIGGER audit_no_update_or_delete`);
    await pool.query(`DELETE FROM "audit"`);
    await pool.query(`ALTER TABLE "audit" ENABLE TRIGGER audit_no_update_or_delete`);
    const target = h.db as PgDb;

    const first = await importRows(target, rows, { dryRun: false });
    expect(first.find((s) => s.tab === 'CallLog')).toMatchObject({ inserted: 2, adjusted: 1 }); // the orphan's lead reference is cleared
    const checks = await verify(rows, target, first);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    const second = await importRows(target, rows, { dryRun: false });
    expect(second.every((s) => s.inserted === 0)).toBe(true);
    expect(second.every((s) => s.mismatches === 0 || s.tab === 'CallLog')).toBe(true);
    expect(second.reduce((t, s) => t + s.existing, 0)).toBe(first.reduce((t, s) => t + s.inserted, 0));
    // Hashes, ids and timestamps are preserved; sessions are not copied.
    const u = (await target.all('Users')).find((x) => x.id === staff.id)!;
    expect(u).toMatchObject({ passwordHash: staff.passwordHash, createdAt: staff.createdAt, updatedAt: staff.updatedAt });
    expect(await target.all('Sessions')).toHaveLength(0);
    expect(JSON.parse((await target.all('Audit')).find((a) => a.action === 'test')!.before)).toEqual({ a: 2, b: 1 });
  });
});
