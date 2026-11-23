// In-process maintenance scheduler: timing, catch-up, overlap, error isolation,
// config defaults, and idempotency alongside the manual endpoint.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { startScheduler, type Scheduler } from '../scheduler.ts';
import { runMaintenance } from '../leads/service.ts';
import { ADMIN_EMAIL, EMPLOYEE_EMAIL, FakeClock, memberClient, startHarness, superAdmin, testConfig, type Harness } from './harness.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import type { PlacesClient } from '../places/client.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
let sched: Scheduler | undefined;
let h: Harness | undefined;

afterEach(async () => {
  sched?.stop();
  sched = undefined;
  vi.useRealTimers();
  await h?.close();
  h = undefined;
});

/** Let pending promise callbacks run (fake timers do not advance microtasks by themselves). */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('scheduler timing (fake clock)', () => {
  it('runs a catch-up sweep ~10 s after start, then every 15 minutes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const task = vi.fn(async () => ({ expired: 0, expiring: 0 }));
    sched = startScheduler({ name: 't', task, intervalMs: 15 * MIN, startDelayMs: 10_000 });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(task).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(1); // catch-up at start

    await vi.advanceTimersByTimeAsync(15 * MIN - 10_000);
    expect(task).toHaveBeenCalledTimes(2); // first interval tick
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(task).toHaveBeenCalledTimes(4);

    sched.stop();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(task).toHaveBeenCalledTimes(4); // stopped means stopped
  });

  it('skips a tick while the previous run is still going', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    let release!: () => void;
    let calls = 0;
    const task = vi.fn(async () => {
      calls++;
      if (calls === 1) await new Promise<void>((r) => (release = r)); // first run hangs
    });
    sched = startScheduler({ name: 't', task, intervalMs: 15 * MIN, startDelayMs: 10_000 });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(sched.running).toBe(true);
    await vi.advanceTimersByTimeAsync(30 * MIN); // two interval ticks arrive during the slow run
    expect(task).toHaveBeenCalledTimes(1);
    expect(await sched.tick('manual')).toBe('skipped');

    release();
    await flush();
    expect(sched.running).toBe(false);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(task).toHaveBeenCalledTimes(2); // back to normal after the slow run ends
  });

  it('a thrown error is logged, does not escape, and later ticks still run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let n = 0;
    const task = vi.fn(async () => {
      n++;
      if (n <= 2) throw new Error('Sheets 503');
      return { expired: 1, expiring: 0 };
    });
    sched = startScheduler({ name: 't', task, intervalMs: 15 * MIN, startDelayMs: 10_000 });

    await vi.advanceTimersByTimeAsync(10_000 + 30 * MIN);
    expect(task).toHaveBeenCalledTimes(3);
    expect(sched.running).toBe(false);
    expect(errors).toHaveBeenCalledTimes(2);
    expect(String(errors.mock.calls[0][0])).toContain('scheduler: run failed');
    expect(String(errors.mock.calls[0][0])).toContain('Sheets 503');
    expect(await sched.tick('manual')).toBe('ran');
    errors.mockRestore();
  });
});

describe('INTERNAL_SCHEDULER config', () => {
  it('defaults on in production, off in test/dev, and can be forced either way', () => {
    const prod = { NODE_ENV: 'production', SHEETS_BACKEND: 'google', GOOGLE_SHEETS_SPREADSHEET_ID: 'p', GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: 'e30=' };
    expect(testConfig().internalScheduler).toBe(false);
    expect(testConfig({ NODE_ENV: 'development' }).internalScheduler).toBe(false);
    expect(testConfig({ INTERNAL_SCHEDULER: 'true' }).internalScheduler).toBe(true);
    expect(testConfig(prod).internalScheduler).toBe(true);
    expect(testConfig({ ...prod, INTERNAL_SCHEDULER: 'false' }).internalScheduler).toBe(false);
  });
});

describe('scheduler + manual endpoint on the same expiry', () => {
  const places: PlacesClient = {
    async searchText() {
      return [{ placeId: 'ChIJ_fake_place_sched', name: 'Fake', address: 'Fake Rd', phone: '', website: '' }];
    },
    async placeDetails(id) {
      return { placeId: id, name: 'Fake', address: 'Fake Rd', phone: '', website: '' };
    },
  };

  it('gives exactly one notification per person and one audit entry', async () => {
    h = await startHarness(new MemoryBackend(), testConfig(), { placesClient: places, clock: new FakeClock() });
    const owner = await superAdmin(h);
    const admin = (await memberClient(h, owner, ADMIN_EMAIL)).client;
    const staff = await memberClient(h, owner, EMPLOYEE_EMAIL);
    const search = await admin.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 1 });
    await admin.req('POST', '/api/places/import', {
      category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', searchedAt: search.body.searchedAt,
      placeIds: ['ChIJ_fake_place_sched'], assignTo: staff.id, windowHours: 12,
    });
    const leadId = (await admin.req('GET', '/api/leads')).body.leads[0].id as string;

    h.clock.advance(12 * HOUR + MIN);
    const db = h.db;
    sched = startScheduler({ name: 'maintenance', task: () => runMaintenance(db), intervalMs: 15 * MIN, startDelayMs: 60 * MIN });
    const endpoint = () => fetch(`${h!.url}/api/maintenance/run`, { method: 'POST', headers: { Authorization: `Bearer ${h!.config.CRON_TOKEN}` } });

    // At the same moment, then again one after the other.
    const [tickResult, res] = await Promise.all([sched.tick('interval'), endpoint()]);
    expect(tickResult).toBe('ran');
    expect(res.status).toBe(200);
    expect(await sched.tick('interval')).toBe('ran');
    expect((await endpoint()).status).toBe(200);

    const [notes, audit, exps] = await h.db.loadFresh(['Notifications', 'Audit', 'Expirations']);
    const expiry = notes.rows.filter((n) => n.refId === leadId && (n.type === 'assignment_expired' || n.type === 'lead_expired'));
    expect(expiry.filter((n) => n.type === 'lead_expired')).toHaveLength(1); // the team member
    expect(expiry.filter((n) => n.type === 'assignment_expired')).toHaveLength(2); // each founder once
    expect(new Set(expiry.map((n) => n.id)).size).toBe(expiry.length);
    expect(audit.rows.filter((a) => a.action === 'lead.assignment_expired' && a.entityId === leadId)).toHaveLength(1);
    expect(exps.rows.filter((e) => e.leadId === leadId)).toHaveLength(1);
  });
});
