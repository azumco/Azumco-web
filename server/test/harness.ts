// Test harness: the real app on an ephemeral port over the in-memory backend,
// plus a tiny cookie-keeping client that behaves like the team UI.

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig, type Config } from '../config.ts';
import { createApp } from '../app.ts';
import { bootstrap } from '../bootstrap.ts';
import { Db } from '../sheets/db.ts';
import { MemoryBackend } from '../sheets/backend.ts';
import type { PlacesClient } from '../places/client.ts';
import { columnsOf, type TabName } from '../sheets/schema.ts';
import { PgPool } from '../db/pg.ts';
import { PgDb } from '../db/pgdb.ts';
import { migrate } from '../db/migrate.ts';
import { TABLE } from '../db/tables.ts';
import { caFrom } from '../db/open.ts';

/**
 * npm run test:pg sets TEST_PG=1 and PG_RUN_ID: every test file then runs on
 * Postgres in its own throwaway schema (t_<run>_<random>), dropped after the
 * run. Each fresh harness starts from empty tables, like a new MemoryBackend.
 */
export const PG = process.env.TEST_PG === '1';
let pgShared: Promise<PgPool> | undefined;
export function testPool(): Promise<PgPool> {
  pgShared ??= (async () => {
    const schema = `t_${process.env.PG_RUN_ID ?? 'local'}_${Math.random().toString(36).slice(2, 8)}`;
    const pool = new PgPool({ connectionString: process.env.DATABASE_URL!, schema, caCert: caFrom(process.env.DATABASE_CA_CERT), max: 4 });
    await migrate(pool);
    return pool;
  })();
  return pgShared;
}
const seenBackends = new WeakSet<object>();
async function pgDbFor(backend: MemoryBackend, now: () => Date): Promise<PgDb> {
  const pool = await testPool();
  if (!seenBackends.has(backend)) {
    // A new "backend" means a new, empty store.
    seenBackends.add(backend);
    await pool.query(`TRUNCATE ${Object.values(TABLE).map((t) => `"${t}"`).join(', ')}, "places_usage" RESTART IDENTITY CASCADE`);
  }
  return new PgDb(pool, { now });
}

/** A controllable clock: tests move time forward instead of waiting. */
export class FakeClock {
  constructor(public t = new Date('2026-11-21T04:30:00.000Z')) {}
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
  set(iso: string) {
    this.t = new Date(iso);
  }
}

export interface HarnessOptions {
  clock?: FakeClock;
  placesClient?: PlacesClient | null;
}

// Fake fixture values only — no real people or customers.
export const SUPER = { email: 'test.owner@azumco.com', password: 'initial-Passw0rd!' };
export const ADMIN_EMAIL = 'test.admin@azumco.com';
export const EMPLOYEE_EMAIL = 'test.staff@azumco.com';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    SHEETS_BACKEND: 'memory',
    SESSION_SECRET: 'x'.repeat(40),
    CRON_TOKEN: 'c'.repeat(40),
    SUPERADMIN_EMAIL: SUPER.email,
    SUPERADMIN_NAME: 'Owner',
    SUPERADMIN_INITIAL_PASSWORD: SUPER.password,
    TEAM_USERS: JSON.stringify([
      { name: 'Admin One', email: ADMIN_EMAIL, role: 'admin' },
      { name: 'Staff One', email: EMPLOYEE_EMAIL, role: 'employee' },
    ]),
    ...overrides,
  });
}

export interface Harness {
  url: string;
  db: Db;
  backend: MemoryBackend;
  config: Config;
  close: () => Promise<void>;
  clock: FakeClock;
  /** Restart the app over the SAME backend: proves state lives in storage, not memory. */
  restart: () => Promise<Harness>;
  /** Every tab as stored (header + rows), on whichever backend is in use. */
  snapshot: (tabs: readonly string[]) => Promise<string[][][]>;
  /** A second, independent data layer over the same storage (a "second server process"). */
  secondDb: () => Promise<Db>;
}

export async function startHarness(backend = new MemoryBackend(), config = testConfig(), opts: HarnessOptions = {}): Promise<Harness> {
  const clock = opts.clock ?? new FakeClock();
  const db = PG ? await pgDbFor(backend, clock.now) : new Db(backend, { now: clock.now });
  const ready = bootstrap(config, db);
  await ready;
  const app = createApp({ config, db, ready, placesClient: opts.placesClient ?? null });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const close = () => new Promise<void>((r) => server.close(() => r()));
  return {
    url: `http://127.0.0.1:${port}`,
    db,
    backend,
    config,
    clock,
    close,
    restart: async () => {
      await close();
      return startHarness(backend, config, { ...opts, clock });
    },
    snapshot: async (tabs) => {
      if (!PG) return backend.readTabs([...tabs]);
      return Promise.all((tabs as TabName[]).map(async (t) => [columnsOf(t), ...(await db.all(t)).map((r) => columnsOf(t).map((c) => r[c] ?? ''))]));
    },
    secondDb: async () => (PG ? new PgDb(await testPool(), { now: clock.now }) : new Db(backend, { now: clock.now })),
  };
}

/** A browser-like client: keeps the session cookie and sends CSRF headers. */
export class Client {
  cookie = '';
  csrf = '';
  constructor(private readonly base: string) {}

  async req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'azumco',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (typeof json.csrfToken === 'string') this.csrf = json.csrfToken;
    return { status: res.status, body: json, headers: res.headers };
  }

  login(email: string, password: string) {
    return this.req('POST', '/api/auth/login', { email, password });
  }
}

/** Sign in as the super admin and clear the forced password change. */
export async function superAdmin(h: Harness, newPassword = 'owner-New-Passw0rd!') {
  const c = new Client(h.url);
  await c.login(SUPER.email, SUPER.password);
  await c.req('POST', '/api/auth/change-password', { currentPassword: SUPER.password, newPassword });
  return c;
}

/** Give a team member a usable password via the real temp-password flow, and sign them in. */
export async function memberClient(h: Harness, owner: Client, email: string, newPassword = 'member-Passw0rd-1') {
  const users = (await owner.req('GET', '/api/users')).body.users as { id: string; email: string }[];
  const id = users.find((u) => u.email === email)!.id;
  const temp = (await owner.req('POST', `/api/users/${id}/temp-password`)).body.tempPassword as string;
  const c = new Client(h.url);
  await c.login(email, temp);
  await c.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword });
  return { client: c, id };
}
