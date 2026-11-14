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
