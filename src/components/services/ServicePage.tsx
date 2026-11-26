// One service page (Figma: "Azumco site — detailed service pages"). Every
// service uses this template; the words come from services.ts.

import { Check, ExternalLink, Quote } from 'lucide-react';
import type { Service } from '../../serviceTypes';
import { SERVICES, GROUP_LABEL } from '../../services';
import { projects, site } from '../../content';
import { contactHref, serviceHref, servicesHref } from '../../links';
import { Container, Eyebrow, Reveal } from '../ui';
import { IconTile } from './icons';
import ServiceArt from './art';
import { Accent, Accordion, Band, CheckItem, CtaCard, PillLink, SectionHead } from './parts';

export default function ServicePage({ service: s }: { service: Service }) {
  const group = GROUP_LABEL[s.group];
  const paired = s.paired.slugs.map((slug) => SERVICES.find((x) => x.slug === slug)).filter((x): x is Service => Boolean(x));
  const quote = contactHref(s.slug);

  return (
    <>
      {/* Hero */}
      <section className="pb-20 pt-28 sm:pb-24 sm:pt-36">
        <Container>
          <nav aria-label="Breadcrumb" className="text-sm text-fg-3">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <li><a href={servicesHref} className="inline-flex min-h-6 items-center hover:text-fg">Services</a></li>
              <li aria-hidden="true">/</li>
              <li><a href={`${servicesHref}#${s.group}`} className="inline-flex min-h-6 items-center hover:text-fg">{group}</a></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-fg-2">{s.name}</li>
            </ol>
          </nav>

          {/* Above the fold: shown at once (no fade-in), so it paints with the HTML. */}
          <div className="mt-10 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="flex items-center gap-3">
                <IconTile icon={s.icon} size="sm" />
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-brand">{group}</span>
              </div>
              <h1 className="mt-7 text-5xl font-medium leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-7xl">
                <Accent h={s.title} block />
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-fg-2">{s.intro}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <PillLink href={quote}>Discuss your project</PillLink>
                <PillLink href="#how-it-works" variant="ghost">{s.secondaryCta}</PillLink>
              </div>
            </div>
            <div>
              <ServiceArt art={s.icon} />
            </div>
          </div>
        </Container>
      </section>

      {/* What's included */}
      <Band tone="raised" label={s.included.eyebrow}>
        <SectionHead eyebrow={s.included.eyebrow} heading={s.included.heading} sub={s.included.sub} />
        <ul className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {s.included.items.map((it, i) => (
            <li key={it.title} className="rounded-2xl border border-line bg-bg p-7">
              <p className="text-xs font-medium text-brand">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-3 text-xl font-medium tracking-[-0.01em] text-fg">{it.title}</h3>
              <p className="mt-3 leading-relaxed text-fg-2">{it.body}</p>
            </li>
          ))}
        </ul>
      </Band>

      {/* Is this for you? */}
      <Band label={s.who.eyebrow}>
        <SectionHead eyebrow={s.who.eyebrow} heading={s.who.heading} />
        <ul className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {s.who.quotes.map((q) => (
            <li key={q} className="rounded-2xl border border-line bg-bg-2 p-7">
              <Quote aria-hidden="true" className="h-6 w-6 text-brand" />
              <p className="mt-5 text-xl leading-snug text-fg">{q}</p>
            </li>
          ))}
        </ul>
      </Band>

      {/* How it works */}
      <Band id="how-it-works" tone="raised" label={s.steps.eyebrow}>
        <SectionHead eyebrow={s.steps.eyebrow} heading={s.steps.heading} sub={s.steps.sub} />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 lg:grid-cols-4">
          {s.steps.items.map((st, i) => (
            <li key={st.title} className="bg-bg p-7">
              <p className="text-xs font-medium text-brand">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-fg">{st.title}</h3>
              <p className="mt-3 leading-relaxed text-fg-2">{st.body}</p>
            </li>
          ))}
        </ol>
      </Band>

      {/* What you get / tools */}
      <Band label={s.get.eyebrow}>
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal className="rounded-2xl border border-line bg-bg-2 p-8">
            <Eyebrow>{s.get.eyebrow}</Eyebrow>
            <ul className="mt-6 space-y-4 text-fg">
              {s.get.items.map((g) => <CheckItem key={g} boxed>{g}</CheckItem>)}
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="rounded-2xl border border-line bg-bg-2 p-8">
            <Eyebrow>{s.tools.eyebrow}</Eyebrow>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {s.tools.items.map((t) => (
                <li key={t} className="rounded-full border border-line-2 px-4 py-2 text-sm text-fg">{t}</li>
              ))}
            </ul>
            {s.tools.note && <p className="mt-6 text-sm text-fg-3">{s.tools.note}</p>}
            {s.proof && (
              <p className="mt-6 flex gap-3 rounded-xl border border-brand/30 bg-brand/[0.06] p-4 text-sm leading-relaxed text-fg-2">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{s.proof}</span>
              </p>
            )}
          </Reveal>
        </div>
      </Band>

      {/* Related work (only where the service has it) */}
      {s.work && (
        <Band tone="raised" label={s.work.eyebrow}>
          <SectionHead eyebrow={s.work.eyebrow} heading={s.work.heading} sub={s.work.sub} />
          <ul className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {s.work.projects.map((w) => {
              const p = projects.find((x) => x.name === w.name);
              if (!p) return null;
              return (
                <li key={w.name}>
                  <a href={p.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-2xl border border-line bg-bg transition-colors hover:border-line-2">
                    <span className="block aspect-[5/3] overflow-hidden bg-bg-3">
                      <img src={p.image} alt={`${p.name} website`} loading="lazy" decoding="async" width="800" height="480" className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none" />
                    </span>
                    <span className="block p-6">
                      <span className="flex items-center gap-2 font-medium text-fg">{p.name}<ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-fg-3" /></span>
                      <span className="mt-1.5 block text-sm text-fg-2">{w.caption}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Band>
      )}

      {/* Pricing + FAQ */}
      <Band label="Pricing and questions">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-5">
            <div className="rounded-3xl border border-brand/40 bg-[linear-gradient(160deg,rgba(255,107,0,0.12),rgba(255,107,0,0.02))] p-8">
              <Eyebrow>{s.pricing.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-3xl font-medium leading-tight tracking-[-0.02em] text-fg">{s.pricing.heading}</h2>
              <ul className="mt-6 space-y-3.5 text-fg-2">
                {s.pricing.points.map((p) => <CheckItem key={p}>{p}</CheckItem>)}
              </ul>
              <PillLink href={quote} className="mt-8">{s.pricing.cta}</PillLink>
            </div>
          </Reveal>
          <div className="lg:col-span-7">
            <Eyebrow>{s.faqs.eyebrow}</Eyebrow>
            <div className="mt-5">
              <Accordion items={s.faqs.items} />
            </div>
          </div>
        </div>

        {paired.length > 0 && (
          <div className="mt-16">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-3">{s.paired.eyebrow}</p>
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {paired.map((p) => (
                <li key={p.slug}>
                  <a href={serviceHref(p.slug)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-2 px-5 text-sm text-fg transition-colors hover:border-brand">
                    {p.short}
                    <span aria-hidden="true" className="text-brand">→</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Band>

      {/* Closing call to action */}
      <section className="pb-24 sm:pb-32">
        <Container>
          <CtaCard eyebrow={s.cta.eyebrow} heading={s.cta.heading} body={s.cta.body}>
            <PillLink href={quote}>{s.cta.primary}</PillLink>
            <PillLink href={site.whatsapp} variant="ghost" external>{s.cta.secondary}</PillLink>
          </CtaCard>
        </Container>
      </section>
    </>
  );
}
