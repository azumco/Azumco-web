// The public site's frame: cursor, nav, footer, WhatsApp button and smooth
// scrolling. The home page, the services hub and every service page use it.
// Safe to render on the server (window is only touched in effects).

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import { MessageCircle } from 'lucide-react';
import Nav from './Nav';
import Footer from './Footer';
import Cursor from './Cursor';
import { site } from '../content';

export default function SiteShell({ children, home = false, current }: { children: ReactNode; home?: boolean; current?: 'services' }) {
  // Smooth scrolling (skipped for reduced-motion users)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: { offset: -72 }, lerp: 0.1 });
    return () => lenis.destroy();
  }, []);

  // Arriving with "#section" from another page: scroll there once the page
  // (and the loader, if it is showing) has settled.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let tries = 0;
    const go = () => {
      const el = document.getElementById(id);
      const locked = document.documentElement.classList.contains('az-lock');
      if (el && !locked) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
      if (++tries < 40) setTimeout(go, 100);
    };
    const t = setTimeout(go, 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-bg text-fg">
      <Cursor />
      <Nav home={home} current={current} />
      <main>{children}</main>
      <Footer home={home} />

      <a
        href={site.whatsapp}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-line-2 bg-bg-2/90 text-fg backdrop-blur transition-colors hover:border-brand hover:bg-brand hover:text-bg"
      >
        <MessageCircle className="h-5 w-5" />
      </a>
    </div>
  );
}
