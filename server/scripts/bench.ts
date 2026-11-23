// npm run bench -- <sheets|postgres> <accounts.tsv>
//
// Times the main endpoints against STAGING data only: the staging spreadsheet
// (sheets) or the "staging" schema (postgres). Starts the real app in this
// process, signs in with the staging test accounts (read from the file, never
// printed), and measures each endpoint cold (first request after start) and
// warm (median of 5). Prints a table; no values or secrets.

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../config.ts';
import { createApp } from '../app.ts';
import { Db } from '../sheets/db.ts';
import { GoogleSheetsBackend, parseServiceAccount } from '../sheets/google.ts';
import { openPg } from '../db/open.ts';

const [backendName, accountsFile] = process.argv.slice(2);

class Client {
  cookie = '';
  csrf = '';
  constructor(private base: string) {}
  async req(method: string, path: string, body?: unknown) {
    const res = await fetch(this.base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'azumco', origin: this.base, ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (typeof json.csrfToken === 'string') this.csrf = json.csrfToken;
    return { status: res.status, body: json };
  }
}

async function main() {
  if (backendName !== 'sheets' && backendName !== 'postgres') throw new Error('Usage: npm run bench -- <sheets|postgres> <accounts.tsv>');
  const config = loadConfig();
  if (!config.STAGING_SPREADSHEET_ID) throw new Error('STAGING_SPREADSHEET_ID is required (benchmarks use staging data only).');
  const accounts = Object.fromEntries(readFileSync(accountsFile, 'utf8').trim().split('\n').map((l) => l.split('\t')).map(([role, email, password]) => [role, { email, password }]));

  const opened = backendName === 'sheets'
    ? { db: new Db(new GoogleSheetsBackend(config.STAGING_SPREADSHEET_ID, parseServiceAccount(config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!))), close: async () => undefined }
    : (() => { const o = openPg(config, { schema: 'staging' }); return { db: o.db, close: () => o.pool.end() }; })();
  const app = createApp({ config: { ...config, isProduction: false, CRON_TOKEN: undefined } as never, db: opened.db, ready: Promise.resolve(), placesClient: null });
  const server = await new Promise<import('node:http').Server>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const time = async (fn: () => Promise<{ status: number }>) => {
    const t = performance.now();
    const r = await fn();
    if (r.status >= 400) throw new Error(`status ${r.status}`);
    return performance.now() - t;
  };
  const rows: [string, number, number][] = [];
  const measure = async (name: string, fn: () => Promise<{ status: number }>) => {
    const cold = await time(fn);
    const warm: number[] = [];
    for (let i = 0; i < 5; i++) warm.push(await time(fn));
    warm.sort((a, b) => a - b);
    rows.push([name, cold, warm[2]]);
  };

  const owner = new Client(base);
  const staff = new Client(base);
  const loginTimes: number[] = [];
  loginTimes.push(await time(() => owner.req('POST', '/api/auth/login', accounts.super_admin)));
  loginTimes.push(await time(() => staff.req('POST', '/api/auth/login', accounts.employee)));
  rows.push(['Login (first / second)', loginTimes[0], loginTimes[1]]);

  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  await measure('Founder Home', () => owner.req('GET', '/api/dashboard/founder'));
  await measure('Leads', () => owner.req('GET', '/api/leads'));
  await measure('Find clients (status)', () => owner.req('GET', '/api/places/status'));
  await measure('Calendar (slots + bookings)', async () => {
    const [a, b] = await Promise.all([owner.req('GET', `/api/slots?from=${today}&days=7`), owner.req('GET', '/api/bookings')]);
    return { status: Math.max(a.status, b.status) };
  });
  await measure('Money', async () => {
    const [a, b] = await Promise.all([owner.req('GET', '/api/finance'), owner.req('GET', '/api/milestones')]);
    return { status: Math.max(a.status, b.status) };
  });
  await measure('Team Queue', async () => {
    const [a, b] = await Promise.all([staff.req('GET', '/api/leads'), staff.req('GET', '/api/dashboard/me')]);
    return { status: Math.max(a.status, b.status) };
  });
  const lead = ((await staff.req('GET', '/api/leads')).body.leads as { id: string }[])[0];
  if (lead) await measure('Log a call (write)', () => staff.req('POST', `/api/leads/${lead.id}/calls`, { outcome: 'No answer', note: 'bench' }));

  console.log(`\n${backendName.toUpperCase()} (staging) — milliseconds`);
  console.log(`${'endpoint'.padEnd(30)} ${'cold'.padStart(7)} ${'warm'.padStart(7)}`);
  for (const [n, c, w] of rows) console.log(`${n.padEnd(30)} ${c.toFixed(0).padStart(7)} ${w.toFixed(0).padStart(7)}`);
  server.close();
  await opened.close();
}

main().catch((e) => {
  console.error('bench failed:', (e as Error).message);
  process.exitCode = 1;
});
