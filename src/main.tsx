import { StrictMode, Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import Cursor from './components/Cursor.tsx';
import type { LegalKey } from './legalLinks.ts';
import './index.css';
import { loaderReady } from './loader.ts';
import { serviceRoute } from './serviceRoutes.tsx';
import SiteShell from './components/SiteShell.tsx';

/** Rendered with the page's content: tells the logo loader the page is ready. */
function LoaderReady() {
  useEffect(() => loaderReady(), []);
  return null;
}

// Legal pages are loaded on demand so they don't add weight to the home page.
const LegalPage = lazy(() => import('./components/LegalPage.tsx'));

const routes: Record<string, LegalKey> = {
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/refund-policy': 'refund',
};

// Team area: its own lazy chunk (and stylesheet), never loaded by public pages.
const TeamApp = lazy(() => import('./team/TeamApp.tsx'));

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const legal = routes[path];
const isTeam = path === '/team' || path.startsWith('/team/');
// /services and /services/<slug> (pre-rendered at build time; rendered again here).
const service = !isTeam && (path === '/services' || path.startsWith('/services/')) ? serviceRoute(path) : null;
const unknownService = !isTeam && path.startsWith('/services/') && !service;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isTeam ? (
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <TeamApp />
      </Suspense>
    ) : service ? (
      <>
        {service.element}
        <LoaderReady />
      </>
    ) : unknownService ? (
      <>
        <SiteShell current="services">
          <section className="mx-auto max-w-3xl px-5 pb-32 pt-40 text-center">
            <h1 className="text-4xl font-medium tracking-[-0.03em] text-fg sm:text-5xl">This service page doesn&apos;t exist.</h1>
            <p className="mt-5 text-fg-2">It may have moved. All our services are listed on one page.</p>
            <a href="/services" className="mt-8 inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-sm font-medium text-bg">See all services</a>
          </section>
        </SiteShell>
        <LoaderReady />
      </>
    ) : legal ? (
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <Cursor />
        <LegalPage page={legal} />
        <LoaderReady />
      </Suspense>
    ) : (
      <>
        <App />
        <LoaderReady />
      </>
    )}
  </StrictMode>,
);
