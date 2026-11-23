// Staging end-to-end walk over real HTTP against a locally running production
// build in STAGING_MODE. Prints step results only — never passwords, tokens or
// Places content. Places content seen in responses is written to <needles>
// so `npm run staging -- grep <needles>` can prove none of it was stored.
//
//   npm run staging:walk -- <base-url> <accounts.tsv> <needles-out> <phase>
//   phase "a": steps 1–7 (search, import, assign, live lookup, confirm, call, booking)
//   phase "b": steps 8–9 (expiry after the staging timer, won + commission, pause)

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

const [base, accountsFile, needlesFile, phase] = process.argv.slice(2);
const accounts = readFileSync(accountsFile, 'utf8').trim().split('\n').map((l) => {
  const [role, email, password] = l.split('\t');
  return { role, email, password };
});
const statePath = `${needlesFile}.state.json`;
const state: Record<string, string> = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state));
const needle = (...v: (string | undefined)[]) => v.filter((s) => s && s.length >= 4).forEach((s) => appendFileSync(needlesFile, `${s}\n`));

// The search for phase a (WALK_CATEGORY / WALK_CITY, default Gym in Bhopal).
const CAT = process.env.WALK_CATEGORY || 'Gym';
const CITY = process.env.WALK_CITY || 'Bhopal';

let failures = 0;
const check = (label: string, ok: boolean, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${info ? `  (${info})` : ''}`);
};

class Client {
  cookie = '';
  csrf = '';
  constructor(public who: string) {}
  async req(method: string, path: string, body?: unknown) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'azumco',
        origin: base,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 80) }; }
    return { status: res.status, body: json, headers: res.headers };
  }
  async login(role: string) {
    const a = accounts.find((x) => x.role === role)!;
    const r = await this.req('POST', '/api/auth/login', { email: a.email, password: a.password });
    this.csrf = r.body.csrfToken ?? '';
    return r;
  }
}

const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

async function main() {
  const owner = new Client('super_admin');
  const staff = new Client('employee');
  const l1 = await owner.login('super_admin');
  check('1. super admin signs in', l1.status === 200, `status ${l1.status}, cookie flags: ${(l1.headers.get('set-cookie') ?? '').split(';').slice(1).map((s) => s.trim().split('=')[0]).join(',')}`);
  const l2 = await staff.login('employee');
  check('1. team member signs in', l2.status === 200, `status ${l2.status}`);
  const team = (await owner.req('GET', '/api/team')).body.team ?? (await owner.req('GET', '/api/team')).body.users;
  const staffId = l2.body.user?.id;

  if (phase === 'a') {
    const s0 = (await owner.req('GET', '/api/places/status')).body;
    check('2. Places status before', s0.enabled !== false, `used ${JSON.stringify(s0.used ?? s0.usage ?? s0)}`.slice(0, 160));

    const search = await owner.req('POST', '/api/places/search', { category: CAT, state: 'Madhya Pradesh', city: CITY, limit: 2 });
    console.log('      REAL PLACES CALL #1 (Text Search) made');
    if (search.status !== 200) {
      check('3. search', false, `status ${search.status} code ${search.body.code ?? ''} error ${search.body.error ?? ''}`);
      return;
    }
    const results = search.body.results as { placeId: string; name: string; address: string; phone: string; website: string }[];
    results.forEach((r) => needle(r.name, r.address, r.phone, r.website, r.phone?.replace(/\D/g, '')));
    check('3. search returns results with contact fields', results.length > 0 && results.every((r) => r.placeId && r.name), `${results.length} result(s), phone on ${results.filter((r) => r.phone).length}`);

    const imp = await owner.req('POST', '/api/places/import', {
      category: CAT, state: 'Madhya Pradesh', city: CITY, searchedAt: search.body.searchedAt,
      placeIds: results.map((r) => r.placeId), assignTo: staffId, windowHours: 24,
    });
    check('4. import + assign to team member', imp.status === 200, `status ${imp.status} ${imp.body.error ?? ''}`);

    const mine = ((await staff.req('GET', '/api/leads')).body.leads as any[]).filter((l) => l.category === CAT && l.city === CITY && l.timerRunning);
    check('5. team member sees assigned leads (no Places names stored)', mine.length === results.length, `${mine.length} lead(s); labels: ${mine.map((l) => (results.some((r) => r.name === l.label) ? 'PLACES-NAME!' : 'generic')).join(',')}`);
    const expiresInMin = mine.map((l) => Math.round((new Date(l.expiresAt).getTime() - Date.now()) / 60000));
    check('5. staging timer is short', expiresInMin.every((m) => m <= 3), `expires in ${expiresInMin.join(',')} min`);
    state.lead1 = mine[0].id;
    state.lead2 = mine[1]?.id ?? '';
    save();

    const live = await staff.req('GET', `/api/leads/${state.lead1}/live-contact`);
    console.log('      REAL PLACES CALL #2 (Place Details) made');
    check('6. live contact lookup for the team member', live.status === 200, `status ${live.status} cache-control ${live.headers.get('cache-control')}`);
    if (live.status === 200) needle(live.body.contact?.name, live.body.contact?.address, live.body.contact?.phone, live.body.contact?.website);

    const pc = await staff.req('POST', `/api/leads/${state.lead1}/phone-check`, { phone: '90000 00001' });
    check('6. phone pre-check', pc.status === 200, JSON.stringify(pc.body));
    const conf = await staff.req('POST', `/api/leads/${state.lead1}/confirm`, { businessName: 'Staging Walk Gym', contactPerson: 'Test Person', phone: '90000 00001' });
    check('6. confirm contact (typed values)', conf.status === 200, `status ${conf.status} ${conf.body.error ?? ''}`);
    const call = await staff.req('POST', `/api/leads/${state.lead1}/calls`, { outcome: 'Interested', note: 'staging walk' });
    check('7. log call Interested stops the timer', call.status === 201 && call.body.timerStopped === true, `status ${call.status} timerStopped ${call.body.timerStopped}`);

    const tomorrow = istDate(new Date(Date.now() + 86_400_000));
    const av = await owner.req('POST', '/api/availability/batch', { dates: [tomorrow], start: '11:00', end: '12:00', slotMinutes: 30 });
    check('7. founder adds free time', av.status === 200 || av.status === 201, `status ${av.status} ${av.body.error ?? ''}`);
    const slots = (await staff.req('GET', `/api/slots?from=${tomorrow}&days=1`)).body.slots as any[];
    const bk = await staff.req('POST', '/api/bookings', { leadId: state.lead1, founderId: slots[0]?.founderId, date: tomorrow, start: slots[0]?.start, clientName: 'Test Person', mode: 'Phone call' });
    check('7. team member books a call', bk.status === 200 || bk.status === 201, `status ${bk.status} ${bk.body.error ?? ''}`);
    state.booking = bk.body.booking?.id ?? '';
    save();
    console.log(`\nPhase a done. Lead 2 expires in ~3 min; run phase b after that.`);
  }

  if (phase === 'b') {
    const tok = process.env.CRON_TOKEN ?? '';
    const noTok = await fetch(`${base}/api/maintenance/run`, { method: 'POST' });
    check('8. maintenance rejects a missing token', noTok.status === 401 || noTok.status === 404, `status ${noTok.status}`);
    if (tok) {
      const run = await fetch(`${base}/api/maintenance/run`, { method: 'POST', headers: { authorization: `Bearer ${tok}` } });
      const j: any = await run.json();
      check('8. maintenance sweep with token', run.status === 200, `expired ${j.expired} expiring ${j.expiring}`);
    } else console.log('SKIP  8. CRON_TOKEN not set locally; expiry checked lazily instead');
    const l2 = await staff.req('GET', `/api/leads/${state.lead2}`);
    check('8. un-worked lead expired and left the team member', l2.status !== 200, `status ${l2.status} ${l2.body.code ?? ''}`);
    const l1 = await staff.req('GET', `/api/leads/${state.lead1}`);
    check('8. worked lead (timer stopped) stays', l1.status === 200);
    const notes = (await staff.req('GET', '/api/notifications')).body.notifications as any[];
    check('8. team member notified', notes.some((n) => n.type === 'lead_expired'), notes.map((n) => n.type).join(','));

    if (state.booking) {
      const ch = await owner.req('POST', `/api/bookings/${state.booking}/call-happened`, { happened: true });
      check('9. founder marks the call happened', ch.status === 200, `status ${ch.status}`);
    }
    const lead = (await owner.req('GET', `/api/leads/${state.lead1}`)).body.lead ?? (await owner.req('GET', `/api/leads/${state.lead1}`)).body;
    const won = await owner.req('PATCH', `/api/leads/${state.lead1}`, { callHappened: true, status: 'Won', clientPaid: true, dealType: 'One-time', dealValue: 10000, expectedUpdatedAt: lead.updatedAt });
    check('9. founder marks Won + paid', won.status === 200, `status ${won.status} ${won.body.error ?? ''}`);
    const e1 = (await staff.req('GET', '/api/dashboard/me')).body.earnings;
    check('9. commission earned shows for the team member', e1?.earned > 0 && e1?.pending === e1?.earned, JSON.stringify(e1));
    const paid = await owner.req('POST', `/api/leads/${state.lead1}/commission-paid`);
    const e2 = (await staff.req('GET', '/api/dashboard/me')).body.earnings;
    check('9. commission marked paid', paid.status === 200 && e2?.pending === 0, JSON.stringify(e2));

    const before = (await owner.req('GET', '/api/places/status')).body;
    await owner.req('PUT', '/api/settings', { placesPaused: true });
    const blocked = await owner.req('POST', '/api/places/search', { category: 'Gym', state: 'Madhya Pradesh', city: 'Bhopal', limit: 2 });
    const blocked2 = await staff.req('GET', `/api/leads/${state.lead1}/live-contact`);
    const after = (await owner.req('GET', '/api/places/status')).body;
    check('9. pause blocks search and lookup with zero calls', blocked.body.code === 'PLACES_PAUSED' && blocked2.body.code === 'PLACES_PAUSED' && JSON.stringify(before.used ?? before.usage) === JSON.stringify(after.used ?? after.usage), `search ${blocked.body.code}, lookup ${blocked2.body.code}`);
    await owner.req('PUT', '/api/settings', { placesPaused: false });
    console.log(`      usage counter: ${JSON.stringify(after.used ?? after.usage ?? after).slice(0, 200)}`);
    const audit = ((await owner.req('GET', '/api/audit')).body.entries as any[]).map((e) => e.action);
    console.log(`      audit actions: ${[...new Set(audit)].join(', ')}`);
  }
  if (phase === 'confirm') {
    // Re-run the contact confirmation with another test number (WALK_PHONE).
    const phone = process.env.WALK_PHONE || '90000 00002';
    const pc = await staff.req('POST', `/api/leads/${state.lead1}/phone-check`, { phone });
    check('6. phone pre-check (new number)', pc.status === 200 && !pc.body.duplicateOf, JSON.stringify(pc.body));
    const conf = await staff.req('POST', `/api/leads/${state.lead1}/confirm`, { businessName: 'Staging Walk Cafe', contactPerson: 'Test Person', phone });
    check('6. confirm contact (typed values)', conf.status === 200, `status ${conf.status} ${conf.body.error ?? ''}`);
  }

  if (phase === 'c') {
    // The other roles and the money/goals/settings side.
    const admin = new Client('admin');
    const la = await admin.login('admin');
    check('1. admin (founder) signs in', la.status === 200, `status ${la.status}`);
    const today = istDate(new Date());
    const exp = await admin.req('POST', '/api/finance/expenses', { date: today, item: 'Staging walk test expense', amount: 123, paidBy: 'Company Fund', project: 'General' });
    check('10. founder adds an expense', exp.status === 201, `status ${exp.status} ${exp.body.error ?? ''}`);
    const fin = (await admin.req('GET', '/api/finance')).body;
    check('10. expense shows in the money summary', JSON.stringify(fin).includes('Staging walk test expense'));
    const goals = (await owner.req('GET', '/api/goals')).body.goals as { id: string; canChangeStatus: boolean; status: string; updatedAt: string; task: string }[];
    const mine = goals.find((g) => g.canChangeStatus && g.status !== 'Done');
    if (mine) {
      const tick = await owner.req('PATCH', `/api/goals/${mine.id}`, { status: 'Done', expectedUpdatedAt: mine.updatedAt });
      check('11. goal ticked by the person it is assigned to', tick.status === 200, `status ${tick.status} ${tick.body.error ?? ''}`);
    } else console.log('SKIP  11. no open goal assigned to the super admin');
    const s1 = await owner.req('PUT', '/api/settings', { commissionQualifiedFee: 250 });
    const s2 = await owner.req('PUT', '/api/settings', { commissionQualifiedFee: 200 });
    check('12. settings change (and back)', s1.status === 200 && s2.status === 200, `status ${s1.status}/${s2.status}`);
    const audit = ((await owner.req('GET', '/api/audit')).body.entries as any[]).map((e) => e.action);
    console.log(`      audit actions now include: ${[...new Set(audit)].filter((x) => /expense|goal|settings|finance/.test(x)).join(', ')}`);
  }
  console.log(`\n${failures ? `${failures} FAILURE(S)` : 'All checks passed.'}`);
  if (failures) process.exitCode = 1;
  void team;
}

main().catch((e) => {
  console.error('walk failed:', (e as Error).message);
  process.exitCode = 1;
});
