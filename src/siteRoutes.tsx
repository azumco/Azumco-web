// Every public page: what it renders, its <head> tags, structured data and
// HTTP status. Used by the browser entry (main.tsx) AND the build-time
// pre-renderer (prerender.tsx), so crawlers and visitors get the same page.
// The team portal (/team) is not here and is never pre-rendered or indexed.

import type { ReactElement } from 'react';
import App from './App';
import SiteShell from './components/SiteShell';
import Cursor from './components/Cursor';
import LegalPage from './components/LegalPage';
import Hub from './components/services/Hub';
import ServicePage from './components/services/ServicePage';
import Work from './components/Work';
import Contact from './components/Contact';
import { India, International, MarketPage, NotFound } from './components/pages/Regions';
import { GROUP_LABEL, HUB, SERVICES } from './services';
import { INDIA, INTERNATIONAL, PUBLISHED_MARKETS } from './regions';
import { legalLinks } from './legalLinks';
import { site } from './content';

export const ORIGIN = 'https://azumco.com';
const LOGO = `${ORIGIN}/icon-512.png`;
const ORG_ID = `${ORIGIN}/#organization`;

export interface Head {
  title: string;
  description: string;
  /** Path used for the canonical URL and og:url. */
  path: string;
  jsonLd: Record<string, unknown>[];
  /** noindex pages (the 404) are never in the sitemap. */
  noindex?: boolean;
}

export interface Route {
  element: ReactElement;
  head: Head;
  status: 200 | 404;
}

// ─── Structured data shared by every page ───────────────────────────────────

export const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORG_ID,
  name: site.legalName,
  url: `${ORIGIN}/`,
  logo: LOGO,
  email: site.email,
  description: 'A remote-first digital studio from India: websites, apps, marketing and website care for clients worldwide.',
  sameAs: [site.linkedin, site.instagram],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'sales',
    email: site.email,
    telephone: site.phone.replace(/\s+/g, '-'),
    areaServed: 'Worldwide',
    availableLanguage: ['English'],
  },
};

export const WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${ORIGIN}/#website`,
  url: `${ORIGIN}/`,
  name: site.name,
  publisher: { '@id': ORG_ID },
  inLanguage: 'en',
};

function crumbs(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${ORIGIN}${it.path}` })),
  };
}
const HOME = { name: 'Home', path: '/' };

function page(element: ReactElement, head: Omit<Head, 'jsonLd'> & { jsonLd?: Record<string, unknown>[] }, status: 200 | 404 = 200): Route {
  return { element, status, head: { ...head, jsonLd: [ORGANIZATION, WEBSITE, ...(head.jsonLd ?? [])] } };
}

// ─── The pages ──────────────────────────────────────────────────────────────

const STATIC: Record<string, () => Route> = {
  '/': () =>
    page(<App />, {
      title: 'Azumco — websites, apps & marketing for clients worldwide',
      description:
        'Azumco is a remote-first digital studio from India. We build websites, apps and custom software, and run SEO, social media and ads for clients worldwide.',
      path: '/',
    }),
  '/services': () =>
    page(<SiteShell current="services"><Hub /></SiteShell>, {
      title: HUB.seo.title,
      description: HUB.seo.description,
      path: '/services',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `${site.name} services`,
          itemListElement: SERVICES.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, url: `${ORIGIN}/services/${s.slug}` })),
        },
        crumbs([HOME, { name: 'Services', path: '/services' }]),
      ],
    }),
  '/work': () =>
    page(
      <SiteShell>
        <Work page />
        <Contact />
      </SiteShell>,
      {
        title: 'Work — live websites and products built by Azumco',
        description:
          'Live websites and products Azumco designed and built: Risoniq AI, Infra Nest IT Solutions and EBS Media. See the projects and visit them online.',
        path: '/work',
        jsonLd: [crumbs([HOME, { name: 'Work', path: '/work' }])],
      },
    ),
  [INTERNATIONAL.path]: () =>
    page(<SiteShell><International /></SiteShell>, {
      title: INTERNATIONAL.seo.title,
      description: INTERNATIONAL.seo.description,
      path: INTERNATIONAL.path,
      jsonLd: [crumbs([HOME, { name: 'Work with us from anywhere', path: INTERNATIONAL.path }])],
    }),
  [INDIA.path]: () =>
    page(<SiteShell><India /></SiteShell>, {
      title: INDIA.seo.title,
      description: INDIA.seo.description,
      path: INDIA.path,
      jsonLd: [crumbs([HOME, { name: 'India', path: INDIA.path }])],
    }),
};

const LEGAL_HEAD: Record<(typeof legalLinks)[number]['key'], { title: string; description: string }> = {
  terms: {
    title: 'Terms & Conditions — how Azumco projects work',
    description: 'The terms for working with Azumco: proposals and scope, payment terms, revisions, timelines, ownership of the work, support after launch and confidentiality.',
  },
  privacy: {
    title: 'Privacy Policy — how Azumco handles your information',
    description: 'What information Azumco collects through this website and its contact form, how it is used and protected, and the choices you have about it.',
  },
  refund: {
    title: 'Refund & Cancellation Policy — Azumco',
    description: 'When Azumco refunds payments, how project and monthly-plan cancellations work, and what happens to advances, milestones and work already done.',
  },
};

for (const l of legalLinks) {
  STATIC[l.path] = () =>
    page(<><Cursor /><LegalPage page={l.key} /></>, {
      title: LEGAL_HEAD[l.key].title,
      description: LEGAL_HEAD[l.key].description,
      path: l.path,
      jsonLd: [crumbs([HOME, { name: l.title, path: l.path }])],
    });
}

for (const m of PUBLISHED_MARKETS) {
  STATIC[m.path] = () =>
    page(<SiteShell><MarketPage market={m} /></SiteShell>, {
      title: m.seo.title,
      description: m.seo.description,
      path: m.path,
      jsonLd: [crumbs([HOME, { name: m.hero.eyebrow, path: m.path }])],
    });
}

function serviceRoute(slug: string): Route | null {
  const s = SERVICES.find((x) => x.slug === slug);
  if (!s) return null;
  const path = `/services/${s.slug}`;
  return page(<SiteShell current="services"><ServicePage service={s} /></SiteShell>, {
    title: s.seo.title,
    description: s.seo.description,
    path,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: s.name,
        serviceType: s.name,
        description: s.intro,
        url: `${ORIGIN}${path}`,
        provider: { '@id': ORG_ID },
        areaServed: 'Worldwide',
        category: GROUP_LABEL[s.group],
      },
      crumbs([HOME, { name: 'Services', path: '/services' }, { name: s.name, path }]),
    ],
  });
}

export const NOT_FOUND: () => Route = () =>
  page(<SiteShell><NotFound /></SiteShell>, { title: 'Page not found | Azumco', description: 'This page does not exist. See our services, our work, or get in touch.', path: '/404', noindex: true }, 404);

/** Every indexable public path (for pre-rendering and the sitemap). */
export const PUBLIC_PATHS: string[] = [...Object.keys(STATIC), ...SERVICES.map((s) => `/services/${s.slug}`)];

/** The page for a path, or null (→ 404). Trailing slashes are ignored. */
export function getRoute(path: string): Route | null {
  const clean = path.replace(/\/+$/, '') || '/';
  if (STATIC[clean]) return STATIC[clean]();
  const m = /^\/services\/([a-z0-9-]+)$/.exec(clean);
  return m ? serviceRoute(m[1]) : null;
}
