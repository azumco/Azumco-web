# Public site: rendering, SEO and markets

## How pages are rendered

Every public page is **pre-rendered at build time** (`npm run build` →
`vite build`, `vite build --ssr src/prerender.tsx`, `node scripts/prerender.mjs`):

- `src/siteRoutes.tsx` is the one list of public pages: what each renders, its
  title, description, canonical path, JSON-LD and status. The browser entry
  (`src/main.tsx`) and the pre-renderer both use it.
- `dist/<path>/index.html` holds each page's full HTML and meta tags; the
  browser then hydrates it (same look and behaviour, no flash).
- `dist/404.html` is served with a real **404** for unknown paths.
- `dist/shell.html` is the plain app shell, used only by the team portal (`/team`).
- `dist/sitemap.xml` is generated from the public routes (with `lastmod`).

The Express server (`server/app.ts`) serves those files, 301s trailing slashes
and `/index.html` to the clean URL, and 301s any `*.onrender.com` host to
`https://azumco.com` (the team portal and the API are left alone).

## Trust switches

`src/content.ts → show` hides the client-logo strip and the stats row. Turn one
on only when every entry in it is a verified client name / number.

## Adding a market page (a country)

1. Add an entry to `MARKETS` in `src/regions.ts` (copy the UAE entry).
2. Fill it with honest, specific content: who you serve there, **at least one
   real case study or client reference in that market**, how you work across the
   time zone, and three or more questions specific to that market.
3. `npm run build`. The build log says `market /<path> NOT published — missing: …`
   until the entry passes `marketMissing()`. Once it does, the page is built,
   linked in the footer and added to the sitemap automatically.

No office or address in another country, ever: Azumco works remotely from India.

## hreflang

Not used. All pages are English and market pages are not translations of each
other. Add `hreflang` (with `x-default`) only when a translated version of a page
exists — for example an Arabic `/uae` — on both versions, pointing at each other.
