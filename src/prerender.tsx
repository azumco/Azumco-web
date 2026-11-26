// Build-time only (vite build --ssr): renders every public page to HTML so
// each URL is served with its own content and meta tags, without JavaScript.
// Never shipped to the browser. See scripts/prerender.mjs.

import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { getRoute, NOT_FOUND, ORIGIN, PUBLIC_PATHS, type Route } from './siteRoutes';
import { MARKETS, marketMissing } from './regions';

export { ORIGIN, PUBLIC_PATHS };

const html = (r: Route) => ({ html: renderToString(<StrictMode>{r.element}</StrictMode>), head: r.head, status: r.status });

export function render(path: string) {
  const r = getRoute(path);
  if (!r) throw new Error(`No page for ${path}`);
  return html(r);
}

export const renderNotFound = () => html(NOT_FOUND());

/** Market pages that are NOT published yet, and why (printed in the build log). */
export const unpublishedMarkets = () => MARKETS.map((m) => ({ path: m.path, missing: marketMissing(m) })).filter((m) => m.missing.length);
