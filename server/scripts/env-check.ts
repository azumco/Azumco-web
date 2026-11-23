// Reports which environment variables are set and whether they validate —
// names and verdicts only, never values.
//
//   npm run env:check

import { loadConfig } from '../config.ts';

const NAMES = [
  'NODE_ENV', 'DATA_BACKEND', 'DATABASE_URL', 'DB_SCHEMA', 'GOOGLE_SHEETS_SPREADSHEET_ID', 'STAGING_SPREADSHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64', 'SESSION_SECRET',
  'ALLOWED_EMAIL_DOMAIN', 'SUPERADMIN_EMAIL', 'SUPERADMIN_NAME', 'SUPERADMIN_INITIAL_PASSWORD', 'TEAM_USERS', 'GOOGLE_PLACES_API_KEY', 'CRON_TOKEN',
];

for (const n of NAMES) console.log(`${n.padEnd(36)} ${process.env[n] ? 'set' : 'EMPTY'}`);

const ids = [process.env.GOOGLE_SHEETS_SPREADSHEET_ID, process.env.STAGING_SPREADSHEET_ID];
if (ids[0] && ids[1]) console.log(`staging id differs from production id: ${ids[0] !== ids[1] ? 'yes' : 'NO — same spreadsheet!'}`);

try {
  const c = loadConfig({ ...process.env, SHEETS_BACKEND: 'google' });
  console.log(`config: valid · ${c.teamUsers.length} TEAM_USERS entr${c.teamUsers.length === 1 ? 'y' : 'ies'} · roles ${c.teamUsers.map((u) => u.role).join(', ')}`);
} catch (e) {
  console.log((e as Error).message);
}
