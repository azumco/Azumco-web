# Azumco Website

Marketing site for Azumco — built with React 19, Vite, Tailwind CSS v4, Motion and Lenis.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## Where things live

| What | Where |
|---|---|
| All page copy (services, projects, stats, FAQ, contact details) | `src/content.ts` |
| Terms, Privacy and Refund policy text | `src/legal.ts` |
| Colours and fonts (design tokens) | `src/index.css` (`:root`), utility mapping in `src/theme.css` |
| Page sections | `src/components/` |
| Hero background (wavy lines) / 3D dotted logo | `src/components/Waves.tsx` / `src/components/DotLogo.tsx` |

Routes: `/` (home), `/terms`, `/privacy`, `/refund-policy`. `public/_redirects` makes these work on Netlify.

## Before going live

- Replace placeholder client names and stats in `src/content.ts`.

## Team area and server

The site also has a private team area at `/team`. To reach it, click the large outlined "AZUMCO" at the bottom of the footer, or open `/team` directly. It is served by a small Express server in `server/` that keeps all its data in one Google Sheet. The team code loads only on `/team`, and the public pages are unchanged.

### Local development

```bash
cp .env.example .env     # fill in values (never commit .env)
npm run dev:server       # API on :8080 (set SHEETS_BACKEND=memory to work without Sheets)
npm run dev              # site on :3000, proxies /api to :8080
npm test                 # unit + acceptance tests (in-memory store, fake clock, mocked Google)
DEMO_DATA=true npm run dev:demo   # local demo on :8095 with fictitious data and mocked Google (refuses if a spreadsheet id is set)
npm run prod:data -- inspect      # list tabs and any demo/fictitious rows in the real spreadsheet (read-only)
npm run prod:data -- clean        # back up affected tabs (dated copies), then remove only those rows
npm run scan:secrets     # checks the real values in .env never appear in dist/, tracked files, git history (or log files you pass)
npm run test:live        # optional: real-Sheets check on temporary __test_ tabs (add -- --places for ONE real Places search)
npm run build:all        # site + server bundle (dist/ and dist-server/)
STAGING_MODE=true npm run staging -- inspect      # staging sheet: row counts (never touches production)
STAGING_MODE=true npm run staging:walk -- ...     # staging end-to-end walk over HTTP (see docs/RELEASE.md)
npm run prod:data -- snapshot <file>              # production: copy of every tab (secret columns redacted) + schema check
npm run reset-password -- <email>                  # locked-out super admin: local-only reset (see Locked out?)
npm start                # serve both, as on Render
```

### Google setup (once)

1. In Google Cloud, create a service account and download its JSON key. Base64-encode it into `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`, then delete the downloaded file:
   - PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json"))`
   - Linux: `base64 -w0 key.json`
2. Create one Google Sheet and share it with the service account's `client_email` as **Editor**. Put its id (the part of the URL between `/d/` and `/edit`) in `GOOGLE_SHEETS_SPREADSHEET_ID`.
3. Optional, for Find clients: enable **Places API (New)** and create an API key restricted to that API. Put it in `GOOGLE_PLACES_API_KEY`. Without it, Find clients turns itself off.

On the first start the server creates every tab and header itself, then inserts the seed expenses, the Zyvia project, the registration milestone and the goals, once.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` on Render (enables secure cookies) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | yes | |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | yes | |
| `SESSION_SECRET` | yes | 32+ random characters; changing it signs everyone out |
| `ALLOWED_EMAIL_DOMAIN` | no | default `azumco.com`; only this exact domain can sign in |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_NAME` | yes | email must be on the allowed domain |
| `SUPERADMIN_INITIAL_PASSWORD` | first start only | 12+ characters; remove after first sign-in |
| `TEAM_USERS` | yes | JSON: `[{"name":"…","email":"…","role":"admin"},{"name":"…","email":"…","role":"employee"}]`, all on the allowed domain |
| `GOOGLE_PLACES_API_KEY` | no | enables Find clients |
| `CRON_TOKEN` | optional | 32+ random characters; enables the manual/backup maintenance endpoint (404 without it) |
| `INTERNAL_SCHEDULER` | no | in-process maintenance sweep every 15 min; default on in production, off otherwise |
| `PORT` | no | Render sets it; default 8080 |
| `STAGING_MODE`, `STAGING_SPREADSHEET_ID`, `STAGING_ASSIGNMENT_MINUTES` | **never on Render** | local staging runs only; refused when `RENDER` is set or the staging id equals the production id |

Generate random secrets with: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

### Accounts: company domain only, no sign-up

- Only addresses on exactly `ALLOWED_EMAIL_DOMAIN` (default `azumco.com`) can sign in. The match is case-insensitive and ignores surrounding spaces. Subdomains and look-alikes such as `azumco.com.evil.com` or `azumco.co` are refused. A refused address gets the same response as a wrong password.
- There is **no registration**. Accounts are created at server start from `SUPERADMIN_EMAIL` and `TEAM_USERS`, or by the super admin in Settings. The server refuses to start if any of those emails is off-domain; the error names the variable, never the address.
- The only user-management API is super-admin only:
  - `GET /api/users`
  - `POST /api/users/:id/temp-password`: type a temporary password or leave it blank to generate one
  - `POST /api/users`: add a teammate (name, company email, role, job title, can receive leads)
  - `PATCH /api/users/:id`: role, active, job title or can receive leads, never email
- To add a person, use Settings → Team → Add teammate (or add them to `TEAM_USERS` and restart). They appear everywhere at once: assignment lists, calendar, commission, goals.
- Only people with **Can receive leads** switched on can be assigned leads and earn commission. Team members get it by default; founders do not.
- Sessions of any account whose email is off-domain are refused on every request and removed at start.

### First sign-in

1. Sign in at `/team` with `SUPERADMIN_EMAIL` and `SUPERADMIN_INITIAL_PASSWORD`. You must choose a new password straight away.
2. Remove `SUPERADMIN_INITIAL_PASSWORD` from the environment. After first use it is ignored, and the server logs a reminder while it is still set.
3. Go to Settings → Users. For each team member from `TEAM_USERS`, choose **Create password**. Share the one-time password privately. Each person picks their own at first sign-in.

### Locked out?

- **A teammate** forgot their password or is locked out: the super admin opens Settings → Team → **Create password** and shares the one-time password privately.
- **The super admin** is locked out (no one can issue a password in the app): on your own machine, in the project folder with the production `.env`, run in PowerShell or Windows Terminal:

  ```
  npm run reset-password -- name@azumco.com
  ```

  It shows the spreadsheet title and ID and the account it will change, and does nothing unless you type `yes`. It then asks for a new temporary password twice at a hidden prompt (12+ characters, never a command-line argument, never printed or logged). It stores the password hashed, forces a change at next sign-in, clears failed attempts and the 15-minute account lockout, signs that person out everywhere, and writes the audit entry "password reset via local CLI". It only accepts active accounts on the company domain. There is no HTTP route for this.
- After too many wrong attempts from one network, sign-in also pauses for up to 15 minutes per IP. That limit lives in the running server's memory: wait it out, or restart the service on Render.

### Render (one Web Service, free tier)

| Setting | Value |
|---|---|
| Runtime | Node 22 (pinned by `.node-version` and `engines`) |
| Build command | `npm ci --include=dev && npm run build:all` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Environment | the variables above, with `NODE_ENV=production` |

The server binds `0.0.0.0:$PORT`. A cold start takes 30–60 s. The public pages appear as soon as the instance is up, and the team area shows a "waking up" notice while it retries.

### Scheduling

The maintenance sweep (returning lapsed lead assignments and sending "expiring soon" notices) runs **inside the server**: once ~10 s after start-up as a catch-up, then every 15 minutes (`INTERNAL_SCHEDULER`, on by default in production). It only runs while the service is awake. A sleeping free instance does nothing until something wakes it, and the catch-up run then processes anything overdue. Expiry is also enforced on every read, so nobody can work a lapsed lead either way; the sweep only makes the "lead expired" notifications arrive on time when nobody is using the app.

The only external job needed is a free uptime monitor (e.g. UptimeRobot) that keeps the service awake:

| Job | Request | Every | Needed? |
|---|---|---|---|
| Keep warm | `GET https://<your-app>.onrender.com/api/health` (UptimeRobot) | 10 minutes | **yes** |
| Maintenance backup | `POST https://<your-app>.onrender.com/api/maintenance/run` with header `Authorization: Bearer <CRON_TOKEN>` (e.g. cron-job.org) | 15 minutes | optional |

The token-protected endpoint stays as a manual or backup trigger; running it alongside the in-process scheduler is safe (each expiry is recorded, notified and audited exactly once). If a scheduler cannot send headers, `?token=<CRON_TOKEN>` also works, but URLs can end up in logs, so prefer the header.

**Fallback if keep-warm pinging stops being viable:** move the public site to static hosting (Netlify or Cloudflare Pages, from `dist/`, using `public/_redirects`) so visitors never wait, and keep this service for `/team` and `/api` only.

### Data and Google's terms

- Every tab has `id`, `createdAt`, `updatedAt` and `updatedBy`. Columns are matched by header name, so you can reorder them in the sheet. Do not rename headers or edit ids.
- Find clients stores **only Google place IDs**, plus our own search inputs (category, city). Google's Maps Platform Terms (§3.2.3) do not allow storing names, addresses, phones or websites. The contact is fetched live whenever someone opens an unconfirmed lead. It is saved only after a team member reaches the business and types in what they confirmed.
- One hard monthly cap (IST calendar month) covers every paid Places call. The super admin can change it or pause all lookups in Settings.

### Milestone (founders only)

`/team/milestone` shows how much is still needed to register the company. The figures come from the expense summary:
- **Funds available:** cash after paying members. This already includes founder contributions, which count as company money.
- **Still needed:** unpaid line items minus funds available.
- **Per-founder shares:** the amount still needed ÷ 3, rounded up.

Marking an item paid records the matching expense under the project "Company registration". Undoing it deletes that expense. Admins can mark items paid and add contributions. Only the super admin can edit items and amounts, set the target, toggle GST or delete contributions.

### Real data only

The production spreadsheet holds only real data. On first start it gets these, each once and never duplicated:
- the team accounts
- the three real expenses
- the Zyvia project
- the registration milestone (the CS quote)
- the team goals
- the default settings

Leads, bookings, free slots, contributions and commission start empty.

Demo data exists only in `server/dev/demo.ts`. It runs only with `DEMO_DATA=true`, refuses to start when `GOOGLE_SHEETS_SPREADSHEET_ID` is set or `NODE_ENV=production`, and writes only to an in-memory store.

### Goals

Only the person a goal is **assigned to** can change its status, including marking it done. Everyone else gets 403, super admin included. Founders can still edit the title, dates, owner and support. Every status change is audited.

### Free slots

"Add my free slots" previews exactly what it will create. Preview and server use the same planner (`shared/slots.ts`). It merges overlapping time for the same founder instead of duplicating it, and refuses past times and reversed ranges.
