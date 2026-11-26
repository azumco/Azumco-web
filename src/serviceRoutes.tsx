// /services and /services/<slug>: which page to render and its <head> tags.
// Used by the browser entry (main.tsx) and by the build-time pre-renderer
// (prerender.tsx), so both produce exactly the same page and meta tags.

import type { ReactElement } from 'react';
import SiteShell from './components/SiteShell';
import Hub from './components/services/Hub';
import ServicePage from './components/services/ServicePage';
import { GROUP_LABEL, HUB, SERVICES } from './services';
import { site } from './content';

export const ORIGIN = 'https://azumco.com';

export interface Head {
  title: string;
  description: string;
  path: string;
  /** JSON-LD objects for this page. */
  jsonLd: Record<string, unknown>[];
}

const org = { '@id': `${ORIGIN}/#organization` };

function crumbs(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${ORIGIN}${it.path}` })),
  };
}

export const SERVICE_PATHS = ['/services', ...SERVICES.map((s) => `/services/${s.slug}`)];

export function serviceRoute(path: string): { element: ReactElement; head: Head } | null {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/services') {
    return {
      element: <SiteShell current="services"><Hub /></SiteShell>,
      head: {
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
          crumbs([{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }]),
        ],
      },
    };
  }
  const m = /^\/services\/([a-z0-9-]+)$/.exec(clean);
  const s = m ? SERVICES.find((x) => x.slug === m[1]) : undefined;
  if (!s) return null;
  return {
    element: <SiteShell current="services"><ServicePage service={s} /></SiteShell>,
    head: {
      title: s.seo.title,
      description: s.seo.description,
      path: `/services/${s.slug}`,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: s.name,
          serviceType: s.name,
          description: s.intro,
          url: `${ORIGIN}/services/${s.slug}`,
          provider: { ...org, '@type': 'Organization', name: site.name },
          areaServed: [{ '@type': 'City', name: 'Ujjain' }, { '@type': 'State', name: 'Madhya Pradesh' }, { '@type': 'Country', name: 'India' }],
          category: GROUP_LABEL[s.group],
        },
        crumbs([{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }, { name: s.name, path: `/services/${s.slug}` }]),
      ],
    },
  };
}
