// Live integration run against the REAL spreadsheet (and optionally ONE real
// Google Places Text Search). Not part of `npm test`.
//
//   npm run test:live              Sheets only
//   npm run test:live -- --places  also one real Text Search (limit 1)
//
// Safety:
//   - every tab it touches is prefixed "__test_"; they are deleted at the end;
//   - the list of non-test tabs is compared before and after;
//   - nothing secret is printed, and no Places content (names, phones…) —
//     only which fields came back.

import { loadConfig } from '../config.ts';
import { bootstrap } from '../bootstrap.ts';
import { Db, ConflictError } from '../sheets/db.ts';
import { GoogleSheetsBackend, parseServiceAccount } from '../sheets/google.ts';
import { claimPlacesCall } from '../places/budget.ts';
import { GooglePlacesClient } from '../places/client.ts';
import { summarizeExpenses } from '../../shared/rules.ts';
import { TABS } from '../sheets/schema.ts';
import { num, bool } from '../sheets/db.ts';

const PREFIX = '__test_';
const results: { step: string; ok: boolean; detail?: string }[] = [];
const check = (step: string, ok: boolean, detail?: string) => {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  (${detail})` : ''}`);
};

async function main() {
  const required = ['GOOGLE_SHEETS_SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.log(`SKIPPED: missing ${missing.join(', ')}`);
    return;
  }

  // Patient retries: this run makes many requests in a short time and can hit
  // Google's 60-per-minute quota (429), which simply needs waiting out.
  const backend = new GoogleSheetsBackend(process.env.GOOGLE_SHEETS_SPREADSHEET_ID!, parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!), {
    retries: 8,
    baseDelayMs: 2000,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 30_000))),
  });
  const before = (await backend.listTabs()).filter((t) => !t.title.startsWith(PREFIX)).map((t) => t.title).sort();
  console.log(`Connected. ${before.length} existing non-test tab(s) — these are not touched.`);

  // Fictitious accounts for the test tabs only.
  const config = loadConfig({
    NODE_ENV: 'test',
    SHEETS_BACKEND: 'memory', // config validation only; the backend is passed explicitly below
    SESSION_SECRET: 'live-test-'.repeat(5),
    SUPERADMIN_EMAIL: 'test.owner@azumco.com',
    SUPERADMIN_NAME: 'Test Owner',
    SUPERADMIN_INITIAL_PASSWORD: 'live-test-Passw0rd',
    TEAM_USERS: JSON.stringify([
      { name: 'Ayan Test', email: 'test.ayan@azumco.com', role: 'admin' },
      { name: 'Staff Test', email: 'test.staff@azumco.com', role: 'employee' },
    ]),
  });

  try {
    const db = new Db(backend, { tabPrefix: PREFIX, cacheTtlMs: 0 });
    await bootstrap(config, db);
    const tabs = (await backend.listTabs()).filter((t) => t.title.startsWith(PREFIX));
    check('bootstrap creates every tab with headers', tabs.length === Object.keys(TABS).length, `${tabs.length} __test_ tabs`);
    check('seeds users', (await db.all('Users')).length === 3);

    // Idempotent restart.
    await bootstrap(config, new Db(backend, { tabPrefix: PREFIX, cacheTtlMs: 0 }));
    const db2 = new Db(backend, { tabPrefix: PREFIX, cacheTtlMs: 0 });
    check('second bootstrap adds nothing', (await db2.all('Users')).length === 3 && (await db2.all('Goals')).length === 7 && (await db2.all('Expenses')).length === 3);

    const [expenses, projects] = await Promise.all([db2.all('Expenses'), db2.all('Projects')]);
    const s = summarizeExpenses(
      expenses.map((e) => ({ amount: num(e.amount), paidBy: e.paidBy, project: e.project, repaid: bool(e.repaid) })),
      projects.map((p) => ({ name: p.name, dealTotal: num(p.dealTotal), received: num(p.received) })),
    );
    check('seeded expense summary read back from Sheets', s.received === 4000 && s.spentByCompany === 1394 && s.cashInCompany === 2606 && s.owedToMembers === 150 && s.cashAfterPayingMembers === 2456);

    // CRUD + optimistic concurrency + formula safety.
    const row = await db.insert('Leads', { businessName: '=HYPERLINK("http://x")', city: 'Testpur', status: 'New' }, 'live');
    const [raw] = await backend.readTabs([`${PREFIX}Leads`]);
    check('values are stored as text, not formulas', raw.some((r) => r.includes('=HYPERLINK("http://x")')));
    const { after } = await db.update('Leads', row.id, { status: 'Contacted' }, 'live', row.updatedAt);
    let conflict = false;
    try {
      await db.update('Leads', row.id, { status: 'Won' }, 'live', row.updatedAt);
    } catch (e) {
      conflict = e instanceof ConflictError;
    }
    check('stale edit rejected', conflict);
    await db.remove('Leads', row.id, 'live', after.updatedAt);
    check('delete by id', !(await db2.all('Leads')).some((l) => l.id === row.id));

    // Cap with write-then-read-back across two "processes" on the real sheet.
    const settings = (await db.all('Settings')).find((r) => r.key === 'placesMonthlyCap')!;
    await db.update('Settings', settings.id, { value: '2' }, 'live');
    const a = new Db(backend, { tabPrefix: PREFIX, cacheTtlMs: 0 });
    const b = new Db(backend, { tabPrefix: PREFIX, cacheTtlMs: 0 });
    const claims = await Promise.all(Array.from({ length: 5 }, (_, i) => claimPlacesCall(i % 2 ? a : b, 'text_search_enterprise', 'live')));
    const claimed = (await new Db(backend, { tabPrefix: PREFIX }).all('PlacesClaims')).filter((r) => r.status === 'claimed').length;
    check('cap 2 across two processes on real Sheets', claims.filter((c) => c.ok).length === 2 && claimed === 2, `${claims.filter((c) => c.ok).length} granted, ${claimed} in ledger`);

    if (process.argv.includes('--places')) {
      const key = process.env.GOOGLE_PLACES_API_KEY;
      if (!key) {
        console.log('SKIPPED Places: GOOGLE_PLACES_API_KEY is not set');
      } else {
        // The ONE real Text Search. Prints field presence only — never content.
        const [r] = await new GooglePlacesClient(key).searchText('gym in Bhopal', 1);
        const present = r ? Object.entries(r).filter(([, v]) => Boolean(v)).map(([k]) => k).join(', ') : 'none';
        check('real Text Search with the production field mask', Boolean(r?.placeId), `fields returned: ${present}`);
      }
    }
  } finally {
    const mine = (await backend.listTabs()).filter((t) => t.title.startsWith(PREFIX));
    await backend.deleteTabs(mine.map((t) => t.sheetId));
    const after = (await backend.listTabs()).map((t) => t.title).sort();
    check('cleanup removed every __test_ tab', !after.some((t) => t.startsWith(PREFIX)));
    check('non-test tabs unchanged', JSON.stringify(after) === JSON.stringify(before));
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  // Error messages here come from our own code or Google's error body for the
  // request — they do not contain credentials.
  console.error('Live test aborted:', (err as Error).message);
  process.exitCode = 1;
});
