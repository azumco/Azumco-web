// Building blocks shared by the services hub and the service pages. All of
// them render on the server too (for the pre-rendered HTML).

import { useId, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, Minus, Plus } from 'lucide-react';
import type { AccentHeading } from '../../serviceTypes';
import { Container, Eyebrow, Reveal } from '../ui';

/** A full-width band; `tone="raised"` is the lighter alternate background. */
export function Band({ id, tone = 'base', className = '', children, label }: { id?: string; tone?: 'base' | 'raised'; className?: string; children: ReactNode; label?: string }) {
  return (
    <section id={id} aria-label={label} className={`scroll-mt-20 py-20 sm:py-28 ${tone === 'raised' ? 'border-y border-line bg-bg-2' : ''} ${className}`}>
      <Container>{children}</Container>
    </section>
  );
}

/** Text + italic serif accent (the site's heading style). */
export function Accent({ h, block }: { h: AccentHeading; block?: boolean }) {
  return (
    <>
      {h.text}
      {h.accent && (
        <>
          {' '}
          <span className={`font-serif font-normal italic tracking-normal text-brand ${block ? 'block' : ''}`}>{h.accent}</span>
        </>
      )}
    </>
  );
}

/** Eyebrow + heading on the left, an optional line of text on the right. */
export function SectionHead({ eyebrow, heading, sub, as: As = 'h2' }: { eyebrow: string; heading: AccentHeading; sub?: string; as?: 'h2' | 'h3' }) {
  return (
    <div className="grid gap-6 md:grid-cols-12 md:items-end">
      <Reveal className="md:col-span-7">
        <Eyebrow>{eyebrow}</Eyebrow>
        <As className="mt-5 text-4xl font-medium leading-[1.05] tracking-[-0.03em] text-fg sm:text-5xl">
          <Accent h={heading} />
        </As>
      </Reveal>
      {sub && (
        <Reveal delay={0.08} className="md:col-span-5">
          <p className="leading-relaxed text-fg-2 md:text-lg">{sub}</p>
        </Reveal>
      )}
    </div>
  );
}

/** Primary / ghost pill buttons (same look as the home page's buttons). */
export function PillLink({ href, children, variant = 'primary', external, className = '' }: { href: string; children: ReactNode; variant?: 'primary' | 'ghost'; external?: boolean; className?: string }) {
  const styles = variant === 'primary' ? 'bg-brand text-bg hover:bg-brand-2' : 'border border-line-2 text-fg hover:border-fg/40 hover:bg-white/[0.03]';
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors ${styles} ${className}`}
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </a>
  );
}

export function CheckItem({ children, boxed }: { children: ReactNode; boxed?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      {boxed ? (
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><Check className="h-3.5 w-3.5" /></span>
      ) : (
        <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      )}
      <span>{children}</span>
    </li>
  );
}

/** "Learn more →" style text link with an arrow. */
export function ArrowLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={`group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand ${className}`}>
      {children}
      <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </a>
  );
}

/** FAQ accordion: native buttons with aria-expanded; answers stay in the HTML (hidden) so they are crawlable. */
export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="border-t border-line">
      {items.map((f, i) => {
        const isOpen = open === i;
        const panel = `${base}-panel-${i}`;
        const btn = `${base}-btn-${i}`;
        return (
          <div key={f.q} className="border-b border-line">
            <h3>
              <button
                id={btn}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex min-h-16 w-full items-center justify-between gap-6 py-5 text-left text-lg text-fg"
              >
                <span>{f.q}</span>
                {isOpen ? <Minus aria-hidden="true" className="h-5 w-5 shrink-0 text-brand" /> : <Plus aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-3" />}
              </button>
            </h3>
            <div id={panel} role="region" aria-labelledby={btn} hidden={!isOpen}>
              <p className="max-w-2xl pb-6 leading-relaxed text-fg-2">{f.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The closing card with the orange glow. */
export function CtaCard({ eyebrow, heading, body, children }: { eyebrow: string; heading: AccentHeading; body: string; children: ReactNode }) {
  return (
    <Reveal>
      <div className="relative overflow-hidden rounded-3xl border border-line bg-bg-2 px-6 py-12 sm:px-14 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-32 h-[420px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,0,0.32),transparent)]" />
        <div className="relative">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-6 max-w-3xl text-4xl font-medium leading-[1.05] tracking-[-0.03em] text-fg sm:text-5xl">
            <Accent h={heading} />
          </h2>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-fg-2">{body}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">{children}</div>
        </div>
      </div>
    </Reveal>
  );
}
