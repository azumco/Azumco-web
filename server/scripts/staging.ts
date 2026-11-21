// Staging helpers. Refuse to run unless STAGING_MODE=true and the staging
// spreadsheet differs from production. Never touch the production sheet.
//
//   npm run staging -- accounts <file>   set random test passwords for every staging
//                                         account; written to <file>, never printed
//   npm run staging -- inspect           row counts per tab + non-Places lead columns
//   npm run staging -- grep <file>       look for the strings in <file> (one per line)
//                                         in every staging tab; prints counts only

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../config.ts';
import { Db } from '../sheets/db.ts';
import { GoogleSheetsBackend, parseServiceAccount } from '../sheets/google.ts';
import { hashPassword } from '../auth/passwords.ts';
import { TABS, type TabName } from '../sheets/schema.ts';

async function main() {
  const config = loadConfig();
  if (config.STAGING_MODE !== 'true' || !config.STAGING_SPREADSHEET_ID || config.STAGING_SPREADSHEET_ID === config.GOOGLE_SHEETS_SPREADSHEET_ID) {
    console.error('Refusing: STAGING_MODE=true with a separate STAGING_SPREADSHEET_ID is required.');
    process.exit(1);
  }
  const backend = new GoogleSheetsBackend(config.STAGING_SPREADSHEET_ID, parseServiceAccount(config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!), {
    retries: 8,
    baseDelayMs: 2000,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 30_000))),
  });
  const db = new Db(backend);
  const [mode, arg] = process.argv.slice(2);

  if (mode === 'accounts') {
    if (!arg) throw new Error('Give an output file.');
    const [users] = await db.loadFresh(['Users']);
    const lines: string[] = [];
    const changes: { id: string; patch: Record<string, string> }[] = [];
    for (const u of users.rows) {
      const pw = `stg-${randomBytes(9).toString('base64url')}`;
      changes.push({ id: u.id, patch: { passwordHash: await hashPassword(pw), mustChangePassword: 'FALSE', failedAttempts: '0', lockedUntil: '' } });
      lines.push(`${u.role}\t${u.email}\t${pw}`);
    }
    await db.exclusive(() => db.updateManyUnqueued('Users', changes, 'staging-script'));
    writeFileSync(arg, lines.join('\n') + '\n');
    console.log(`Set staging test passwords for ${changes.length} account(s); written to the file given (not printed).`);
    return;
  }

  if (mode === 'inspect') {
    const names = Object.keys(TABS) as TabName[];
    const states = await db.loadFresh(names);
    names.forEach((n, i) => console.log(`${n.padEnd(15)} ${states[i].rows.length} row(s)`));
    const leads = states[names.indexOf('Leads')].rows;
    console.log('\nLeads (non-Places columns):');
    for (const l of leads) {
      console.log(
        JSON.stringify({
          placeId: l.placeId ? `${l.placeId.slice(0, 6)}…` : '',
          category: l.category, state: l.state, city: l.city, searchedAt: l.searchedAt, addedBy: l.addedBy ? 'set' : '',
          businessName: l.businessName, phone: l.phone, phoneSource: l.phoneSource, websiteOrInstagram: l.websiteOrInstagram,
          contactPerson: l.contactPerson, assignedTo: l.assignedTo ? 'set' : '', status: l.status, callHappened: l.callHappened,
          dealValue: l.dealValue, clientPaid: l.clientPaid, commissionPaid: l.commissionPaid,
        }),
      );
    }
    return;
  }

  if (mode === 'grep') {
    const needles = readFileSync(arg, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s.length >= 4);
    const names = Object.keys(TABS) as TabName[];
    const grids = await backend.readTabs(names);
    const text = JSON.stringify(grids);
    const hits = needles.filter((n) => text.includes(n));
    console.log(`Checked ${needles.length} string(s) across ${names.length} staging tab(s): ${hits.length} found.`);
    if (hits.length) process.exitCode = 1;
    return;
  }

  console.log('Usage: accounts <file> | inspect | grep <file>');
}

main().catch((e) => {
  console.error('staging script failed:', (e as Error).message);
  process.exitCode = 1;
});
