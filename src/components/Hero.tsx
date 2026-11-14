import { motion, useReducedMotion } from 'motion/react';
import { ArrowDown } from 'lucide-react';
import Waves from './Waves';
import DotLogo from './DotLogo';
import { Container, MagneticButton } from './ui';

const ease = [0.22, 1, 0.36, 1] as const;

function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  const reduced = useReducedMotion();
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span
        className="block"
        initial={reduced ? false : { y: '110%' }}
        animate={{ y: 0 }}
        transition={{ duration: 1.1, delay, ease }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default function Hero() {
  const reduced = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduced ? false : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay, ease },
  });

  return (
    <section id="top" className="relative flex min-h-[100svh] items-center overflow-hidden">
      <Waves />
      {/* Fade the canvas into the page at the edges */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--bg)_78%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />

      <Container className="relative grid items-center gap-8 pb-24 pt-32 lg:grid-cols-12">
        <div className="relative z-10 lg:col-span-7">
        <motion.p {...fade(0.1)} className="mb-8 text-sm text-fg-2">
          Digital studio — <span className="text-fg">Build · Grow · Manage</span>
        </motion.p>

        <h1 className="max-w-5xl text-[13vw] font-medium leading-[0.95] tracking-[-0.045em] text-fg sm:text-7xl md:text-8xl lg:text-[5.6rem] xl:text-[6.4rem]">
          <Line delay={0.2}>We build &amp; grow</Line>
          <Line delay={0.32}>
            your <span className="font-serif font-normal italic tracking-[-0.02em] text-brand">digital presence.</span>
          </Line>
        </h1>

        <motion.p {...fade(0.6)} className="mt-8 max-w-xl text-lg leading-relaxed text-fg-2">
          One team for your website, apps and marketing — designed, engineered and looked after so you can focus on the
          business.
        </motion.p>

        <motion.div {...fade(0.75)} className="mt-10 flex flex-col gap-3 sm:flex-row">
          <MagneticButton href="#contact">Start a project</MagneticButton>
          <MagneticButton href="#work" variant="ghost">
            See our work
          </MagneticButton>
        </motion.div>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.3 }}
          className="hidden lg:col-span-5 lg:block"
        >
          <DotLogo className="aspect-square w-full" />
        </motion.div>
      </Container>

      <motion.a
        href="#services"
        {...fade(1)}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs uppercase tracking-[0.18em] text-fg-3 transition-colors hover:text-fg sm:flex"
      >
        <ArrowDown className="h-3.5 w-3.5" /> Scroll
      </motion.a>
    </section>
  );
}
