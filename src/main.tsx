import { StrictMode, Suspense, lazy, useEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './index.css';
import { loaderReady } from './loader.ts';
import { getRoute, NOT_FOUND } from './siteRoutes.tsx';

/** Rendered with the page's content: tells the logo loader the page is ready. */
function LoaderReady() {
  useEffect(() => loaderReady(), []);
  return null;
}

// Team area: its own lazy chunk (and stylesheet), never loaded by public pages.
const TeamApp = lazy(() => import('./team/TeamApp.tsx'));

const path = window.location.pathname;
const isTeam = path === '/team' || path.startsWith('/team/');

// Public pages are pre-rendered at build time (scripts/prerender.mjs); the
// same route table renders them here, so the page the visitor gets is the one
// crawlers saw. Unknown paths get the 404 page (the server also sends 404).
const route = isTeam ? null : getRoute(path) ?? NOT_FOUND();
if (route && route.status === 404) document.title = route.head.title;

const container = document.getElementById('root')!;
const app = (
  <StrictMode>
    {isTeam ? (
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <TeamApp />
      </Suspense>
    ) : (
      <>
        {route!.element}
        <LoaderReady />
      </>
    )}
  </StrictMode>
);

// Pre-rendered pages already have their HTML: hydrate it (no flash, no second
// entrance animation). Everything else (team portal, client-side 404) renders fresh.
if (!isTeam && container.hasChildNodes() && route && route.status === 200) {
  hydrateRoot(container, app, { onRecoverableError: () => undefined });
} else {
  createRoot(container).render(app);
}
