import { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import Waves from './Waves';
import DotLogo from './DotLogo';
import { Container, MagneticButton } from './ui';

// The entrance animation is plain CSS (index.css → .hero-rise / .hero-fade),
// so the pre-rendered headline paints straight away, before any JavaScript,
// and reduced-motion users get no animation.
function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <span className="hero-rise block" style={{ animationDelay: `${delay}s` }}>
        {children}
      </span>
    </span>
  );
}

const fade = (delay: number) => ({ className: 'hero-fade', style: { animationDelay: `${delay}s` } });

/** The canvas effects start after the page has loaded and gone idle, so they never compete with the first paint. */
function useAfterLoad() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idle = 0;
    let t = 0;
    const start = () => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(() => setReady(true), { timeout: 2500 });
      else t = window.setTimeout(() => setReady(true), 600);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      window.clearTimeout(t);
      (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idle);
    };
  }, []);
  return ready;
}

export default function Hero() {
  const effects = useAfterLoad();

  return (
    <section id="top" className="relative flex min-h-[100svh] items-center overflow-hidden">
      {effects && <Waves />}
      {/* Fade the canvas into the page at the edges */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--bg)_78%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />

      <Container className="relative grid items-center gap-8 pb-24 pt-32 lg:grid-cols-12">
        <div className="relative z-10 lg:col-span-7">
        <p {...fade(0.1)} className={`${fade(0.1).className} mb-8 text-sm text-fg-2`}>
          Remote-first digital studio — <span className="text-fg">Build · Grow · Manage</span>
        </p>

        <h1 className="max-w-5xl text-[13vw] font-medium leading-[0.95] tracking-[-0.045em] text-fg sm:text-7xl md:text-8xl lg:text-[5.6rem] xl:text-[6.4rem]">
          <Line delay={0.2}>We build &amp; grow</Line>
          <Line delay={0.32}>
            your <span className="font-serif font-normal italic tracking-[-0.02em] text-brand">digital presence.</span>
          </Line>
        </h1>

        <p {...fade(0.6)} className={`${fade(0.6).className} mt-8 max-w-xl text-lg leading-relaxed text-fg-2`}>
          One team for your website, apps and marketing — designed, built and looked after from India, for clients
          worldwide.
        </p>

        <div {...fade(0.75)} className={`${fade(0.75).className} mt-10 flex flex-col gap-3 sm:flex-row`}>
          <MagneticButton href="#contact">Start a project</MagneticButton>
          <MagneticButton href="#work" variant="ghost">
            See our work
          </MagneticButton>
        </div>
        </div>

        {/* Reserves its square from the first paint (no layout shift); the dots appear once the page is idle. */}
        <div className="hidden lg:col-span-5 lg:block">
          {effects ? <DotLogo className="hero-fade aspect-square w-full" /> : <div className="aspect-square w-full" aria-hidden="true" />}
        </div>
      </Container>

      <a
        href="#services"
        style={fade(1).style}
        className="hero-fade absolute bottom-8 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs uppercase tracking-[0.18em] text-fg-3 transition-colors hover:text-fg sm:flex"
      >
        <ArrowDown className="h-3.5 w-3.5" /> Scroll
      </a>
    </section>
  );
}
