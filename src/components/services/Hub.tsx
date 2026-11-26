// /services — the services hub (Figma: "Services hub"). Copy from services.ts.

import { ArrowRight } from 'lucide-react';
import type { ServiceGroup } from '../../serviceTypes';
import { HUB, SERVICES } from '../../services';
import { site } from '../../content';
import { contactHref, sectionHref, serviceHref } from '../../links';
import { Container, Reveal } from '../ui';
import { IconTile, SERVICE_ICON } from './icons';
import { Accent, ArrowLink, Band, CheckItem, CtaCard, PillLink, SectionHead } from './parts';

const GROUPS: ServiceGroup[] = ['build', 'grow', 'manage'];

function ServiceCard({ slug, wide }: { slug: string; wide?: boolean }) {
  const s = SERVICES.find((x) => x.slug === slug)!;
  return (
    <li className={`flex flex-col rounded-2xl border border-line bg-bg-2 p-7 sm:p-8 ${wide ? 'md:grid md:grid-cols-2 md:gap-10' : ''}`}>
      <div>
        <IconTile icon={s.icon} />
        <h3 className="mt-5 text-2xl font-medium tracking-[-0.02em] text-fg">
          <a href={serviceHref(s.slug)} className="hover:text-brand">{s.name}</a>
        </h3>
        <p className="mt-3 leading-relaxed text-fg-2">{s.hubSummary}</p>
      </div>
      <div className={wide ? 'mt-6 md:mt-0' : 'mt-6 flex flex-1 flex-col border-t border-line pt-6'}>
        <ul className="space-y-3 text-sm text-fg">
          {s.hubPoints.map((p) => <CheckItem key={p}>{p}</CheckItem>)}
        </ul>
        <ArrowLink href={serviceHref(s.slug)} className="mt-5">
          {HUB.learnMore}<span className="sr-only"> about {s.name}</span>
        </ArrowLink>
      </div>
    </li>
  );
}

export default function Hub() {
  return (
    <>
      {/* Hero + index */}
      <section className="pb-20 pt-28 sm:pb-28 sm:pt-36">
        <Container>
          {/* Above the fold: shown at once (no fade-in), so it paints with the HTML. */}
          <div>
            <p className="text-sm text-fg-3">{HUB.hero.kicker}</p>
            <h1 className="mt-6 max-w-5xl text-5xl font-medium leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-8xl">
              <Accent h={HUB.hero.title} />
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-fg-2">{HUB.hero.intro}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <PillLink href={contactHref('not-sure')}>{HUB.hero.primary}</PillLink>
              <PillLink href={sectionHref('work', false)} variant="ghost">{HUB.hero.secondary}</PillLink>
            </div>
          </div>

          <nav aria-label="All services" className="mt-16 grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map((g) => {
              const meta = HUB.groups[g];
              return (
                <Reveal key={g} className="rounded-2xl border border-line bg-bg-2 p-6">
                  <p className="flex items-baseline gap-3">
                    <span className="text-xs text-brand">{meta.number}</span>
                    <a href={`#${g}`} className="text-2xl font-medium tracking-[-0.02em] text-fg hover:text-brand">{meta.label}</a>
                    <span className="font-serif text-xl italic text-brand">{meta.tagline}</span>
                  </p>
                  <ul className="mt-4">
                    {SERVICES.filter((s) => s.group === g).map((s) => {
                      const Icon = SERVICE_ICON[s.icon];
                      return (
                        <li key={s.slug}>
                          <a href={serviceHref(s.slug)} className="group flex min-h-11 items-center gap-3 text-sm text-fg-2 transition-colors hover:text-fg">
                            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-3 group-hover:text-brand" />
                            <span className="flex-1">{s.name}</span>
                            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand motion-reduce:transition-none" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </Reveal>
              );
            })}
          </nav>
        </Container>
      </section>

      {/* One band per discipline */}
      {GROUPS.map((g, gi) => {
        const meta = HUB.groups[g];
        const list = SERVICES.filter((s) => s.group === g);
        return (
          <Band key={g} id={g} tone={gi === 1 ? 'raised' : 'base'} label={meta.label}>
            <SectionHead eyebrow={meta.eyebrow} heading={{ text: `${meta.label} —`, accent: meta.tagline }} sub={meta.sub} />
            <ul className={`mt-14 grid gap-5 ${g === 'build' ? 'md:grid-cols-2' : g === 'grow' ? 'md:grid-cols-2 lg:grid-cols-3' : ''}`}>
              {list.map((s) => <ServiceCard key={s.slug} slug={s.slug} wide={g === 'manage'} />)}
            </ul>
            {g === 'manage' && (
              <Reveal>
                <div id="growth-partner" className="mt-5 scroll-mt-24 flex flex-col gap-6 rounded-2xl border border-brand/40 bg-[linear-gradient(160deg,rgba(255,107,0,0.12),rgba(255,107,0,0.02))] p-7 sm:p-8 md:flex-row md:items-center md:justify-between">
                  <div className="max-w-3xl">
                    <span className="inline-flex rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-bg">{HUB.partner.badge}</span>
                    <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-fg">{HUB.partner.title}</h3>
                    <p className="mt-2 leading-relaxed text-fg-2">{HUB.partner.body}</p>
                  </div>
                  <PillLink href={contactHref('growth-partner')} className="shrink-0">{HUB.partner.cta}</PillLink>
                </div>
              </Reveal>
            )}
          </Band>
        );
      })}

      {/* Start with the problem */}
      <Band label={HUB.problems.eyebrow}>
        <SectionHead eyebrow={HUB.problems.eyebrow} heading={HUB.problems.heading} sub={HUB.problems.sub} />
        <ul className="mt-14 overflow-hidden rounded-2xl border border-line bg-bg-2">
          {HUB.problems.rows.map((r) => {
            const s = SERVICES.find((x) => x.slug === r.slug)!;
            const Icon = SERVICE_ICON[s.icon];
            return (
              <li key={r.quote} className="border-b border-line last:border-0">
                <a href={serviceHref(s.slug)} className="group flex flex-col gap-3 px-6 py-5 transition-colors hover:bg-bg-3/40 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                  <span className="text-lg text-fg">{r.quote}</span>
                  <span className="inline-flex min-h-9 shrink-0 items-center gap-2 self-start rounded-full bg-brand/12 px-3.5 text-xs font-medium text-brand sm:self-auto">
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    {s.name}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </Band>

      {/* Closing call to action */}
      <section className="pb-24 sm:pb-32">
        <Container>
          <CtaCard eyebrow={HUB.cta.eyebrow} heading={HUB.cta.heading} body={HUB.cta.body}>
            <PillLink href={contactHref('not-sure')}>{HUB.cta.primary}</PillLink>
            <PillLink href={site.whatsapp} variant="ghost" external>{HUB.cta.secondary}</PillLink>
          </CtaCard>
        </Container>
      </section>
    </>
  );
}
