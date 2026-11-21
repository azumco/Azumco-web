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
