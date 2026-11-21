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
| Colours and fonts (design tokens) | `src/index.css` (`:root`) |
| Page sections | `src/components/` |
| Hero background (wavy lines) / 3D dotted logo | `src/components/Waves.tsx` / `src/components/DotLogo.tsx` |

Routes: `/` (home), `/terms`, `/privacy`, `/refund-policy`. `public/_redirects` makes these work on Netlify.

## Before going live

- Replace placeholder client names and stats in `src/content.ts`.

## Team area and server

The site also has a private team area at `/team` (entry: click the large outlined "AZUMCO" at the bottom of the footer). It is served by a small Express server in `server/` that stores its data in Google Sheets.

```bash
cp .env.example .env     # fill in values; for local work without Sheets set SHEETS_BACKEND=memory
npm run dev:server       # API on :8080 (in a second terminal: npm run dev, which proxies /api)
npm test                 # server tests
npm run build:all        # site + server bundle (dist/ and dist-server/)
npm start                # serve both, as on Render
```

Render (one Web Service): build `npm ci --include=dev && npm run build:all`, start `npm start`, health check `/api/health`.
