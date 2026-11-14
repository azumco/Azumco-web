import { useEffect } from 'react';
import Lenis from 'lenis';
import { MessageCircle } from 'lucide-react';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Work from './components/Work';
import Contact from './components/Contact';
import Footer from './components/Footer';
import Cursor from './components/Cursor';
import { Clients, Stats, Services, Engagements, Process, FAQ } from './components/Sections';
import { site } from './content';

export default function App() {
  // Smooth scrolling (skipped for reduced-motion users)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: { offset: -72 }, lerp: 0.1 });
    return () => lenis.destroy();
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-bg text-fg">
      <Cursor />
      <Nav />
      <main>
        <Hero />
        <Clients />
        <Stats />
        <Services />
        <Work />
        <Engagements />
        <Process />
        <FAQ />
        <Contact />
      </main>
      <Footer />

      <a
        href={site.whatsapp}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-line-2 bg-bg-2/90 text-fg backdrop-blur transition-colors hover:border-brand hover:bg-brand hover:text-white"
      >
        <MessageCircle className="h-5 w-5" />
      </a>
    </div>
  );
}
