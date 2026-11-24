# Team portal — release runbook

Branch: `feature/team-portal`. Everything below is done by a person; nothing here pushes or deploys on its own.

## 1. Pull request

**Title:** Team portal at /team (leads, Find clients, bookings, money, goals) on Google Sheets

**Description (paste into the PR):**

> Adds a private team area at `/team`, reached from the outlined AZUMCO wordmark in the footer. The public site is unchanged (same CSS except one tap-highlight rule; team code loads only on `/team`).
>
> - **Server:** Express 5 in `server/`, bundled to `dist-server/`. All data lives in one Google Sheet (18 tabs, created on first start). Sessions in Sheets, httpOnly + Secure + SameSite=Strict cookie, CSRF token, same-origin guard, rate limit and lockout, company-domain accounts only.
> - **Roles:** super admin, admin (founders), team member. Teammates are added in Settings and appear everywhere. Only people with "Can receive leads" can be assigned leads and earn commission.
> - **Find clients:** Google Places (New), one Text Search per search. Only place IDs are stored; contact details are fetched live and saved only after a team member confirms them on a call. One monthly cap and a pause switch cover every paid call.
> - **Leads:** assignment timer with lazy expiry, an in-process sweep every 15 minutes (plus a token-protected manual trigger), call log, follow-ups, confirm contact with duplicate-phone check.
> - **Bookings:** founders' free time, team members book discovery calls, no double booking.
> - **Money and goals:** expenses, Zyvia project, company registration milestone, commission (earned / paid / pending), team goals that only the assignee can tick off.
> - **Seeds:** real data only (team, three expenses, Zyvia, the CS quote, seven goals, settings), each once.
>
> Verified: 128 tests, both type-checks, `npm ci --include=dev && npm run build:all` from a clean clone, `npm audit` clean, secret scan clean (history, `dist/`, `dist-server/`), staging end-to-end run with 2 real Places calls, production first-run check (seeds only; second start writes nothing).

## 2. Push and merge

1. `git push -u origin feature/team-portal`
2. Open the PR into `main` with the description above. Merge when happy.
3. `bun.lock` is kept as instructed but is out of date; the source of truth is `package-lock.json` (npm).

## 3. Render (one Web Service, free tier)

| Setting | Value |
|---|---|
| Runtime | Node 22 (from `.node-version` / `engines`) |
| Branch | `main` |
| Build command | `npm ci --include=dev && npm run build:all` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Auto-deploy | on (or deploy by hand from the dashboard) |

### Environment variables (names only — values live in your password manager / local `.env`)

| Variable | Set on Render? | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | yes | the production sheet |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | yes | |
| `SESSION_SECRET` | yes | 32+ chars; changing it signs everyone out |
| `SUPERADMIN_EMAIL` | yes | |
| `SUPERADMIN_NAME` | yes | |
| `TEAM_USERS` | yes | same JSON as local |
| `ALLOWED_EMAIL_DOMAIN` | optional | default `azumco.com` |
| `GOOGLE_PLACES_API_KEY` | yes | the rotated key, restricted to Places API (New) |
| `CRON_TOKEN` | optional | 32+ chars; enables the manual/backup maintenance endpoint (404 without it) |
| `INTERNAL_SCHEDULER` | no | leave unset: the sweep runs in-process by default in production. `false` turns it off |
| `SUPERADMIN_INITIAL_PASSWORD` | **no** | the production super admin already exists (created on the first-run check); its password is the value in your local `.env`. The server ignores this variable now. |
| `STAGING_MODE`, `STAGING_SPREADSHEET_ID`, `STAGING_ASSIGNMENT_MINUTES` | **never** | the server refuses to start with staging mode on Render |
| `PORT`, `RENDER` | no | Render sets them |

## 4. Schedulers

The maintenance sweep (returning lapsed lead assignments and sending "expiring soon" notices) runs **inside the server**: once ~10 s after start-up as a catch-up, then every 15 minutes (`INTERNAL_SCHEDULER`, on by default in production). It only runs while the service is awake. A sleeping free instance does nothing until something wakes it, and the catch-up run then processes anything overdue. Expiry is also enforced on every read, so nobody can work a lapsed lead either way; the sweep only makes the "lead expired" notifications arrive on time when nobody is using the app.

| Job | Request | Every | Needed? |
|---|---|---|---|
| Keep warm (UptimeRobot, free) | `GET https://<app>.onrender.com/api/health` | 10 minutes | **yes, the only external job** |
| Maintenance backup (e.g. cron-job.org) | `POST https://<app>.onrender.com/api/maintenance/run` with header `Authorization: Bearer <CRON_TOKEN>` | 15 minutes | optional |

## 5. First sign-in and passwords

1. Open `https://<app>.onrender.com/team`. Sign in as the super admin with the initial password from your local `.env`. You must choose a new password at once.
2. Remove `SUPERADMIN_INITIAL_PASSWORD` from your local `.env` too.
3. Settings → Team: for each teammate choose **Create password**, share it privately (not in a group chat). Each person sets their own on first sign-in.
4. Settings → Team: set job titles. Check "Can receive leads" is on only for the people who should get leads.

## Locked out?

- **A teammate** forgot their password or is locked out: the super admin opens Settings → Team → **Create password** and shares the one-time password privately.
- **The super admin** is locked out (no one can issue a password in the app): on your own machine, in the project folder with the production `.env`, run in PowerShell or Windows Terminal:

  ```
  npm run reset-password -- name@azumco.com
  ```

  It shows the spreadsheet title and ID and the account it will change, and does nothing unless you type `yes`. It then asks for a new temporary password twice at a hidden prompt (12+ characters, never a command-line argument, never printed or logged). It stores the password hashed, forces a change at next sign-in, clears failed attempts and the 15-minute account lockout, signs that person out everywhere, and writes the audit entry "password reset via local CLI". It only accepts active accounts on the company domain. There is no HTTP route for this.
- After too many wrong attempts from one network, sign-in also pauses for up to 15 minutes per IP. That limit lives in the running server's memory: wait it out, or restart the service on Render.

## 6. Rollback

Render dashboard → the service → **Events / Deploys** → pick the previous successful deploy → **Rollback** (or **Manual Deploy → Deploy a specific commit** with the previous commit hash). Data is in the Sheet and is not touched by a rollback. To roll back the code in git instead: `git revert <merge-commit>` and push.

## 7. Ten-minute smoke check after deploy

| # | Check | Expected |
|---|---|---|
| 1 | `GET /api/health` | `{"ok":true}` quickly |
| 2 | Home page `/` | public site as before, no `noindex` header |
| 3 | `/team` response headers | `X-Robots-Tag: noindex…` |
| 4 | Footer → outlined AZUMCO | opens `/team` sign-in |
| 5 | Super admin sign-in | forced password change, then Home with "Good morning/afternoon/evening, {first name}" (IST) |
| 6 | Browser dev tools → cookie `azumco_sid` | HttpOnly, Secure, SameSite=Strict, path `/api` |
| 7 | Settings → Team | 4 people with the right roles; "Can receive leads" on only for the team member |
| 8 | Money / Milestone | three expenses, Zyvia ₹8,000 / ₹4,000, the CS quote items |
| 9 | Goals | seven goals; only the assignee can mark one done |
| 10 | Find clients → status | usage 0 of the cap; do **not** search unless you mean to (each search is billed) |
| 11 | `POST /api/maintenance/run` without the token | 401 |
| 12 | Render logs, ~10 s after start | `scheduler: run complete` with `reason: startup` (then every 15 min while awake) |
| 13 | Team member sign-in on a phone | Queue with bottom tabs, greeting with first name |

## 8. Staging (local only)

`STAGING_MODE=true` with a separate `STAGING_SPREADSHEET_ID` points a local production build at the staging sheet. `STAGING_ASSIGNMENT_MINUTES` shortens the lead timer there for testing; it is refused without staging mode and staging mode is refused on Render.

```bash
npm run build:all
STAGING_MODE=true STAGING_ASSIGNMENT_MINUTES=3 NODE_ENV=production PORT=8090 npm run start:local
STAGING_MODE=true npm run staging -- accounts <file>    # random test passwords, written to <file> only
STAGING_MODE=true npm run staging:walk -- http://localhost:8090 <file> <needles> a   # steps 1–7 (2 real Places calls)
STAGING_MODE=true npm run staging:walk -- http://localhost:8090 <file> <needles> b   # steps 8–9, after the timer
STAGING_MODE=true npm run staging -- grep <needles>     # proves no Google content was stored
```

## 9. Move the data to Supabase Postgres (cutover runbook — do this yourself)

The app can store its data in Google Sheets (today) or in Supabase Postgres. The switch is one environment variable, `DATA_BACKEND`; the default stays `sheets`, so merging this changes nothing until you switch.

### What the Postgres setup is
- **Connection:** `DATABASE_URL` = the Supabase **Session pooler** connection string (Project → Connect → Session pooler). Port 5432 on `*.pooler.supabase.com`. Not the transaction pooler (6543), not the direct connection.
- **No Supabase client library, no anon or service-role key.** Keep the Data API **disabled** (Project Settings → Data API). The app only uses `DATABASE_URL`.
- **Security in depth:** Row Level Security is ON for every table with NO policies, so nothing is readable through any API role. The app connects as the table owner, which RLS does not restrict.
- **TLS:** always encrypted. To also verify the server's identity, download the CA certificate (Project Settings → Database → SSL Configuration → Download certificate), base64 it on one line, and set `DATABASE_CA_CERT`. Without it the link is encrypted but a man-in-the-middle could impersonate the server; with the session pooler on Supabase's network that risk is low, but setting it is recommended.
- **Schema:** tables live in `public` (or `DB_SCHEMA`). Migrations run automatically at start and with `npm run db:migrate`.
- **Free tier:** the project pauses after a quiet week. The in-process scheduler queries the database every 15 minutes while the service is awake, and UptimeRobot keeps the service awake, so it should never count as idle. Free projects have **no automatic backups**: run `npm run db:backup` regularly (weekly, and before any risky change).

### Environment variables to add on Render (names only)
| Variable | Value |
|---|---|
| `DATA_BACKEND` | `postgres` |
| `DATABASE_URL` | the Session pooler string (contains the database password) |
| `DATABASE_CA_CERT` | optional, recommended (base64 of the Supabase CA certificate) |

Keep all the existing variables (the Google ones are still used for Places and for rollback). Do NOT set `DB_SCHEMA` on Render (production uses `public`).

### Order of steps (about 15 minutes)
1. **Pick a quiet time.** Tell the team: "The team area pauses for 15 minutes at HH:MM; don't save anything until I say so."
2. **Back up the Sheet** (File → Make a copy) so you have a frozen copy.
3. On your machine, with the production values in `.env` and `DATA_BACKEND` unset:
   1. `npm run db:import-from-sheets -- --dry-run` — read the per-table summary. Expect 0 skipped; "adjusted" means a reference to a deleted lead was cleared (harmless).
   2. `npm run db:import-from-sheets` — imports, then runs the verification. Every line must say PASS.
   3. Run it once more: every table must show `inserted 0` (idempotent).
   4. `npm run db:backup` — your first Postgres backup.
4. **Render → Environment:** add `DATA_BACKEND=postgres`, `DATABASE_URL` (and `DATABASE_CA_CERT`). Save → this redeploys.
5. Watch the deploy log for `data backend {"backend":"postgres"…}` and `bootstrap complete`. Migrations run automatically (already applied by the import, so "already up to date").
6. **Smoke test immediately** (section 7). Everyone must sign in again (sessions are not copied).
7. Tell the team they can carry on.

### Rollback
Set `DATA_BACKEND=sheets` on Render and redeploy. The app goes back to the Sheet **as it was at cutover**: anything written after the switch (calls, bookings, expenses, …) exists only in Postgres and will NOT be in the Sheet. That is why the cutover must happen at a quiet time and be smoke-tested at once — if anything is wrong, roll back before people start working.

A reverse export (Postgres → Sheet) is feasible but not built: it would need to rewrite every tab and re-check the Sheet's own constraints, and it is only useful after people have already worked on Postgres. If you ever need it, the backup JSON (`npm run db:backup`) has every row in the same field names as the Sheet columns, so it can be pasted or scripted back.

### Backups and restore
- `npm run db:backup` → `backups/public-<time>/<Tab>.json` + `manifest.json` (row counts). The folder is git-ignored. The files include password hashes: keep them private (e.g. an encrypted drive), never in the repo or chat.
- Restore into an EMPTY schema or project: `npm run db:restore -- backups/public-<time>` (add `--schema <name>` to restore beside the live data and compare first). It migrates, inserts every row with its original id and timestamps, and runs the same verification.

### Rotating the database password
Supabase → Project Settings → Database → Reset database password. Copy the new Session pooler string, update `DATABASE_URL` on Render (redeploys) and in your local `.env`. Old connections drop; the app reconnects with the new one.

### Staging on Postgres (local only)
`DATA_BACKEND=postgres DB_SCHEMA=staging STAGING_MODE=true NODE_ENV=production npm run start:local` uses the `staging` schema of the same project (refused on Render, refused with `DB_SCHEMA=public`). Load it with `npm run db:import-from-sheets -- --staging --schema staging`.

### Performance (measured on staging data, from a laptop in India to Supabase; ~90 ms per round trip)
| Endpoint | Sheets cold | Sheets warm | Postgres cold | Postgres warm |
|---|---|---|---|---|
| Login | 4543 | 3147 | 2715 | 1916 |
| Founder Home | 1460 | 5 | 1005 | 4 |
| Leads | 7 | 4 | 8 | 3 |
| Find clients (status) | 5 | 2 | 2 | 1 |
| Calendar (slots + bookings) | 402 | 8 | 95 | 3 |
| Money | 6 | 3 | 3 | 3 |
| Team Queue | 4 | 3 | 3 | 3 |
| Log a call (write) | 1997 | 2037 | 878 | 898 |

Milliseconds; "cold" is the first request after start, "warm" the median of 5. Writes are 2× faster; reads are served from a short cache on both. From Render in the same region as the Supabase project every database round trip drops to a few ms, so pick the Supabase region closest to the Render region. Login time is mostly the deliberate bcrypt cost.

**Caching on Postgres:** each server keeps a 5-second per-table read cache that it drops the moment it writes that table (Sheets used 30 s). Reads inside a write transaction always go to the database. Only another process's writes (e.g. during a deploy overlap) can appear up to 5 s late.

## 10. Check against Google (team-added leads)

- **Where:** founders: Leads → Google check. Team members: "Google check" in the sidebar, or "Google check" on My leads (phone). Leads from Find clients show "From Find clients" and are refused by the server.
- **Who:** founders can check any lead a person added. A team member can check only the leads they added; leads a founder gave them show the result read-only. Find clients leads are never checked.
- **7-day rule (everyone):** a lead costs at most one Google call every 7 days, whoever checked it last (`leads.gc_last_call_at`). The exception is an edited search straight after "pick a match" / "not on Google", which those screens offer (it still costs a call).
- **Team members' allowance:** default 100 checks a month (Settings → Google Places → "Checks per team member"), or a number per person (Settings → Team → the person; founders can also use `PUT /api/team/:id/lead-check-limit`, audited as `users.lead_check_limit`). Usage is a stored counter per person (`users.lead_check_month/lead_check_used`), reserved before the call and given back if the call fails; it resets on the 1st (IST). The global monthly cap and the pause switch apply on top. Migration `004_lead_check_usage.sql` (additive).
- **Cost:** a check is 1 Text Search (Enterprise) call. Choosing among the candidates it returned, saving choices and "Mark as not on Google" cost nothing. "Show Google's details" / "Check again" on a past check is 1 call. All calls count against the monthly cap and stop when paused.
- **Stored:** only the place ID, status, per-field result codes, candidate place IDs and who/when (`leads.gc_*`). Google's values are never stored, except a value a founder confirmed with the business and saved ("Use Google's" / "Add to lead" need the tick; the server enforces it). Every save is audited (`lead.google_apply`).
- **Migration:** `002_lead_check.sql` adds `area`, `origin` and `gc_*` columns (additive, idempotent) and sets `origin` from the place ID. It runs automatically at start. On Sheets the same columns are appended to the Leads header at start, so the Sheets rollback keeps working; rows with a blank `origin` are read as Find clients if they have a place ID.
- **Rollback:** redeploy the previous commit in Render (the extra columns are ignored by older code), or `git revert` the merge and push.
