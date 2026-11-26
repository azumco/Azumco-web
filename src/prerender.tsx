// Build-time only (vite build --ssr): renders the services pages to HTML so
// each URL is served with its own content and meta tags. Never shipped to the
// browser. See scripts/prerender.mjs.

import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { SERVICE_PATHS, serviceRoute, ORIGIN } from './serviceRoutes';

export { SERVICE_PATHS, ORIGIN };

export function render(path: string) {
  const route = serviceRoute(path);
  if (!route) throw new Error(`No page for ${path}`);
  return { html: renderToString(<StrictMode>{route.element}</StrictMode>), head: route.head };
}
