import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Check } from 'lucide-react';
import { clients, stats, services, engagements, process, faqs } from '../content';
import { Container, Eyebrow, Heading, Reveal } from './ui';

/* ---------- Client logos (placeholder wordmarks) ---------- */
export function Clients() {
  const row = [...clients, ...clients];
  return (
    <section className="border-y border-line py-10" aria-label="Clients">
      <Container>
        <p className="mb-8 text-center text-xs uppercase tracking-[0.18em] text-fg-3">Trusted by teams who ship</p>
      </Container>
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="animate-marquee flex w-max gap-16 pr-16">
          {row.map((name, i) => (
            <span
              key={i}
              aria-hidden={i >= clients.length}
              className="whitespace-nowrap text-2xl font-bold tracking-[-0.03em] text-fg/30"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Numbers ---------- */
export function Stats() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <div className="grid gap-12 md:grid-cols-12">
          <Reveal className="md:col-span-5">
            <Eyebrow>Why Azumco</Eyebrow>
            <Heading className="mt-6" accent="shipped fast.">
              Built carefully,
            </Heading>
          </Reveal>
          <Reveal delay={0.1} className="md:col-span-6 md:col-start-7 md:pt-12">
            <p className="text-lg leading-relaxed text-fg-2">
              Most businesses split their digital presence across a developer, an ad agency and someone fixing plugins.
              We bring all three under one senior team — fewer handoffs, faster work, no finger-pointing.
            </p>
          </Reveal>
        </div>

        <div className="mt-20 grid grid-cols-2 gap-px overflow-hidden border-y border-line bg-line lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="bg-bg px-1 py-10 sm:px-6">
              <div className="text-4xl font-medium tracking-[-0.03em] text-fg sm:text-5xl">{s.value}</div>
              <div className="mt-2 text-sm text-fg-3">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Services ---------- */
export function Services() {
  const [open, setOpen] = useState<string | null>('build');
  return (
    <section id="services" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <div className="grid gap-8 md:grid-cols-12">
          <Reveal className="md:col-span-6">
            <Eyebrow>Services</Eyebrow>
            <Heading className="mt-6" accent="one team.">
              Three disciplines,
            </Heading>
          </Reveal>
          <Reveal delay={0.1} className="md:col-span-5 md:col-start-8 md:pt-12">
            <p className="text-lg leading-relaxed text-fg-2">
              Everything a business needs to look good, get found and keep running — from the first line of code to the
              monthly report.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 border-t border-line">
          {services.map((s, i) => {
            const isOpen = open === s.id;
            return (
              <div key={s.id} className="border-b border-line">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  className="group flex w-full items-center gap-6 py-8 text-left sm:gap-10"
                >
                  <span className="w-8 text-sm text-fg-3">0{i + 1}</span>
                  <span
                    className={`flex-1 text-4xl font-medium tracking-[-0.03em] transition-colors sm:text-6xl ${
                      isOpen ? 'text-fg' : 'text-fg/50 group-hover:text-fg'
                    }`}
                  >
                    {s.title}
                  </span>
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                      isOpen ? 'rotate-45 border-brand bg-brand text-white' : 'border-line-2 text-fg-2'
                    }`}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="grid gap-8 pb-10 sm:pl-[4.5rem] md:grid-cols-2">
                        <p className="max-w-md text-lg leading-relaxed text-fg-2">{s.summary}</p>
                        <ul className="grid gap-3">
                          {s.items.map((item) => (
                            <li key={item} className="flex items-center gap-3 text-fg">
                              <span className="h-1 w-1 rounded-full bg-brand" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Ways to work with us ---------- */
export function Engagements() {
  return (
    <section className="py-24 sm:py-32">
      <Container>
        <Reveal>
          <Eyebrow>Working together</Eyebrow>
          <Heading className="mt-6 max-w-3xl" accent="to start.">
            Three ways
          </Heading>
        </Reveal>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {engagements.map((e, i) => (
            <Reveal key={e.title} delay={i * 0.08}>
              <div
                className={`flex h-full flex-col rounded-2xl border p-8 transition-colors ${
                  e.featured ? 'border-brand/50 bg-brand/[0.06]' : 'border-line bg-bg-2 hover:border-line-2'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-medium tracking-[-0.02em] text-fg">{e.title}</h3>
                  {e.featured && (
                    <span className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">Most chosen</span>
                  )}
                </div>
                <p className="mt-4 leading-relaxed text-fg-2">{e.body}</p>
                <ul className="mt-8 space-y-3 border-t border-line pt-6">
                  {e.points.map((p) => (
                    <li key={p} className="flex items-center gap-3 text-sm text-fg">
                      <Check className="h-4 w-4 text-brand" />
                      {p}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className="mt-auto pt-10 text-sm font-medium text-fg underline decoration-line-2 underline-offset-8 transition-colors hover:text-brand hover:decoration-brand"
                >
                  Discuss on a call →
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Process ---------- */
export function Process() {
  return (
    <section id="process" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <div className="grid gap-8 md:grid-cols-12">
          <Reveal className="md:col-span-6">
            <Eyebrow>Process</Eyebrow>
            <Heading className="mt-6" accent="runs.">
              How a project
            </Heading>
          </Reveal>
          <Reveal delay={0.1} className="md:col-span-5 md:col-start-8 md:pt-12">
            <p className="text-lg leading-relaxed text-fg-2">
              Four clear steps from first call to launch — and beyond. You always know what’s happening and what’s next.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {process.map((p, i) => (
            <Reveal key={p.step} delay={i * 0.08} className="bg-bg">
              <div className="group flex h-full flex-col p-8 transition-colors hover:bg-bg-2">
                <span className="text-sm text-brand">{p.step}</span>
                <h3 className="mt-16 text-2xl font-medium tracking-[-0.02em] text-fg">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-fg-2">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- FAQ ---------- */
export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <div className="grid gap-12 md:grid-cols-12">
          <Reveal className="md:col-span-4">
            <Eyebrow>FAQ</Eyebrow>
            <Heading className="mt-6" accent="questions.">
              Common
            </Heading>
          </Reveal>
          <div className="border-t border-line md:col-span-7 md:col-start-6">
            {faqs.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.q} className="border-b border-line">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left"
                  >
                    <span className="text-lg text-fg">{f.q}</span>
                    <Plus
                      className={`h-5 w-5 shrink-0 transition-transform duration-300 ${
                        isOpen ? 'rotate-45 text-brand' : 'text-fg-3'
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-2xl pb-6 leading-relaxed text-fg-2">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
