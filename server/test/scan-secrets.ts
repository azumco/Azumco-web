// Searches for the ACTUAL secret values (from the environment) in the build
// output, every tracked file, the full git history and any log files passed
// as arguments. Prints counts per secret NAME only — never a value.
//
//   npm run scan:secrets -- [log files…]

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const NAMES = ['SESSION_SECRET', 'SUPERADMIN_INITIAL_PASSWORD', 'GOOGLE_PLACES_API_KEY', 'CRON_TOKEN', 'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64'] as const;

const secrets: { name: string; value: string }[] = [];
for (const name of NAMES) {
  const v = process.env[name];
  if (v && v.length >= 8) secrets.push({ name, value: v });
}
// The private key inside the service-account JSON, as a distinctive slice of its body.
try {
  const json = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ?? '', 'base64').toString('utf8'));
  const body = String(json.private_key ?? '').replace(/-----[^-]+-----/g, '').replace(/\s|\\n/g, '');
  if (body.length > 100) secrets.push({ name: 'service account private_key', value: body.slice(40, 100) });
} catch {
  /* no service account configured */
}

if (!secrets.length) {
  console.log('SKIPPED: no secrets in the environment to scan for.');
  process.exit(0);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sources: { label: string; text: () => string }[] = [
  { label: 'dist/ (browser bundle)', text: () => walk('dist').map((f) => readFileSync(f, 'latin1')).join('\n') },
  { label: 'dist-server/', text: () => walk('dist-server').map((f) => readFileSync(f, 'utf8')).join('\n') },
  {
    label: 'tracked files',
    text: () =>
      execFileSync('git', ['ls-files'], { encoding: 'utf8' })
        .split('\n')
        .filter((f) => f && existsSync(f))
        .map((f) => readFileSync(f, 'latin1'))
        .join('\n'),
  },
  { label: 'git history (all branches)', text: () => execFileSync('git', ['log', '-p', '--all'], { encoding: 'utf8', maxBuffer: 1 << 30 }) },
  ...process.argv.slice(2).map((f) => ({ label: `log: ${path.basename(f)}`, text: () => (existsSync(f) ? readFileSync(f, 'utf8') : '') })),
];

let found = 0;
for (const s of sources) {
  const text = s.text();
  const hits = secrets.filter((x) => text.includes(x.value)).map((x) => x.name);
  found += hits.length;
  console.log(`${hits.length ? 'FOUND' : 'clean'}  ${s.label}${hits.length ? `  → ${hits.join(', ')}` : ''}`);
}
console.log(`\nChecked ${secrets.length} secret value(s) across ${sources.length} source(s): ${found ? `${found} hit(s)` : 'none found'}.`);
if (found) process.exitCode = 1;
