import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import Cursor from './components/Cursor.tsx';
import type { LegalKey } from './legalLinks.ts';
import './index.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isTeam ? (
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <TeamApp />
      </Suspense>
    ) : legal ? (
      <Suspense fallback={<div className="min-h-screen bg-bg" />}>
        <Cursor />
        <LegalPage page={legal} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
