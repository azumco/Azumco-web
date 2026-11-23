// Local password recovery (e.g. a locked-out super admin). Runs only on your
// machine with the credentials in .env; there is no HTTP route for this.
//
//   npm run reset-password -- name@azumco.com
//
// 1. Shows the spreadsheet title and id it will change; type "yes" to go on.
// 2. Asks for a new temporary password twice at a hidden prompt (12+ chars).
//    It is never taken from the command line and never printed or logged.
// 3. Stores it hashed, forces a change at next sign-in, clears failed attempts
//    and lockout, ends every session of that user, and writes an audit entry.

import { createInterface } from 'node:readline';
import { loadConfig } from '../config.ts';
import { Db } from '../sheets/db.ts';
import { GoogleSheetsBackend, parseServiceAccount } from '../sheets/google.ts';
import { CLI_MIN_PASSWORD_LENGTH, ResetRefused, findResettableUser, resetPasswordLocal } from '../auth/local-reset.ts';

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}

/** Read a line without echoing it. Ctrl+C aborts. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.stdout.write('\nAborted. Nothing was changed.\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const email = process.argv[2];
  if (!email || process.argv.length > 3) {
    console.log('Usage: npm run reset-password -- name@azumco.com   (the password is asked for, never passed as an argument)');
    process.exitCode = 1;
    return;
  }
  if (!process.stdin.isTTY) {
    console.log('This needs an interactive terminal (PowerShell, cmd or Windows Terminal) so the password can be typed hidden.');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  if (config.SHEETS_BACKEND === 'memory' || !config.activeSpreadsheetId) {
    console.log('No spreadsheet configured (SHEETS_BACKEND=memory or no spreadsheet id). Nothing to reset.');
    process.exitCode = 1;
    return;
  }
  const backend = new GoogleSheetsBackend(config.activeSpreadsheetId, parseServiceAccount(config.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!));
  const db = new Db(backend);

  const title = await backend.spreadsheetTitle();
  const user = await findResettableUser(db, email, config.ALLOWED_EMAIL_DOMAIN);

  console.log('');
  console.log(`Spreadsheet:  ${title}${config.STAGING_MODE === 'true' ? '   (STAGING)' : ''}`);
  console.log(`ID:           ${config.activeSpreadsheetId}`);
  console.log(`Account:      ${user.name} <${user.email}> (${user.role})`);
  console.log('This sets a temporary password, clears any lockout and signs this person out everywhere.');
  if ((await ask('Type "yes" to continue: ')).trim().toLowerCase() !== 'yes') {
    console.log('Aborted. Nothing was changed.');
    return;
  }

  const first = await askHidden(`New temporary password (${CLI_MIN_PASSWORD_LENGTH}+ characters, hidden): `);
  if (first.length < CLI_MIN_PASSWORD_LENGTH) {
    console.log(`Too short: at least ${CLI_MIN_PASSWORD_LENGTH} characters. Nothing was changed.`);
    process.exitCode = 1;
    return;
  }
  const second = await askHidden('Type it again: ');
  if (first !== second) {
    console.log('The two entries do not match. Nothing was changed.');
    process.exitCode = 1;
    return;
  }

  const done = await resetPasswordLocal(db, email, first, config.ALLOWED_EMAIL_DOMAIN);
  console.log('');
  console.log(`Done. ${done.name} can sign in at /team with the temporary password and must choose a new one straight away.`);
  console.log(`Failed attempts and lockout cleared; ${done.sessionsEnded} session(s) ended. Audit entry written.`);
}

main().catch((err) => {
  console.error(err instanceof ResetRefused ? `Refused: ${err.message} Nothing was changed.` : `reset-password failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
