// /international, /india and the market pages (/uae …). Copy: regions.ts.

import { Clock, Mail, MessageCircle, Video } from 'lucide-react';
import { INDIA, INTERNATIONAL, type Market } from '../../regions';
import { SERVICES } from '../../services';
import { projects, site } from '../../content';
import { contactHref, serviceHref, servicesHref } from '../../links';
import { Container, Eyebrow, Reveal } from '../ui';
import { Accent, Accordion, Band, CheckItem, CtaCard, PillLink, SectionHead } from '../services/parts';

/** Above-the-fold intro: rendered without fade-in so it paints with the HTML. */
function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: { text: string; accent: string }; intro: string; children: React.ReactNode }) {
  return (
    <section className="pb-16 pt-28 sm:pb-24 sm:pt-36">
      <Container>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-6 max-w-5xl text-5xl font-medium leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-7xl">
          <Accent h={title} />
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-fg-2">{intro}</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">{children}</div>
      </Container>
    </section>
  );
}

function ServiceLinks() {
  return (
    <ul className="mt-8 flex flex-wrap gap-2.5">
      {SERVICES.map((s) => (
        <li key={s.slug}>
          <a href={serviceHref(s.slug)} className="inline-flex min-h-11 items-center rounded-full border border-line-2 px-4 text-sm text-fg transition-colors hover:border-brand">
            {s.name}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 lg:grid-cols-4">
      {items.map((st, i) => (
        <li key={st.title} className="bg-bg p-7">
          <p className="text-xs font-medium text-brand">{String(i + 1).padStart(2, '0')}</p>
          <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-fg">{st.title}</h3>
          <p className="mt-3 leading-relaxed text-fg-2">{st.body}</p>
        </li>
      ))}
    </ol>
  );
}

function Closing({ cta, interest }: { cta: { eyebrow: string; heading: { text: string; accent: string }; body: string; primary: string; secondary: string }; interest: string }) {
  return (
    <section className="pb-24 sm:pb-32">
      <Container>
        <CtaCard eyebrow={cta.eyebrow} heading={cta.heading} body={cta.body}>
          <PillLink href={contactHref(interest)}>{cta.primary}</PillLink>
          <PillLink href={site.whatsapp} variant="ghost" external>{cta.secondary}</PillLink>
        </CtaCard>
      </Container>
    </section>
  );
}

const CHANNEL_ICON = { Email: Mail, WhatsApp: MessageCircle, 'Video calls': Video } as Record<string, typeof Mail>;

export function International() {
  const t = INTERNATIONAL;
  return (
    <>
      <PageHero eyebrow={t.hero.eyebrow} title={t.hero.title} intro={t.hero.intro}>
        <PillLink href={contactHref('not-sure')}>{t.hero.primary}</PillLink>
        <PillLink href={servicesHref} variant="ghost">{t.hero.secondary}</PillLink>
      </PageHero>

      <Band tone="raised" label={t.steps.eyebrow}>
        <SectionHead eyebrow={t.steps.eyebrow} heading={t.steps.heading} sub={t.steps.sub} />
        <Steps items={t.steps.items} />
      </Band>

      <Band label={t.timezones.eyebrow}>
        <div className="grid gap-5 lg:grid-cols-2">
          <Reveal className="rounded-2xl border border-line bg-bg-2 p-8">
            <Eyebrow>{t.timezones.eyebrow}</Eyebrow>
            <h2 className="mt-5 text-3xl font-medium leading-tight tracking-[-0.02em] text-fg"><Accent h={t.timezones.heading} /></h2>
            <ul className="mt-6 space-y-3.5 text-fg-2">
              {t.timezones.points.map((p) => <CheckItem key={p}>{p}</CheckItem>)}
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="rounded-2xl border border-line bg-bg-2 p-8">
            <Eyebrow>{t.channels.eyebrow}</Eyebrow>
            <ul className="mt-6 space-y-3">
              {t.channels.items.map((c) => {
                const Icon = CHANNEL_ICON[c.label] ?? Clock;
                const inner = (
                  <>
                    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-xs uppercase tracking-[0.18em] text-fg-3">{c.label}</span>
                      <span className="block break-words text-fg">{c.value}</span>
                    </span>
                  </>
                );
                return (
                  <li key={c.label}>
                    {c.href ? (
                      <a href={c.href} {...(c.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})} className="flex min-h-14 items-center gap-4 rounded-xl p-1 transition-colors hover:bg-bg-3/50">{inner}</a>
                    ) : (
                      <div className="flex min-h-14 items-center gap-4 p-1">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
      </Band>

      <Band tone="raised" label="Quotes, payments and questions">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-5">
            <div className="rounded-3xl border border-brand/40 bg-[linear-gradient(160deg,rgba(255,107,0,0.12),rgba(255,107,0,0.02))] p-8">
              <Eyebrow>{t.quotes.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-3xl font-medium leading-tight tracking-[-0.02em] text-fg">{t.quotes.heading}</h2>
              <ul className="mt-6 space-y-3.5 text-fg-2">
                {t.quotes.points.map((p) => <CheckItem key={p}>{p}</CheckItem>)}
              </ul>
              <PillLink href={contactHref('not-sure')} className="mt-8">{t.quotes.cta}</PillLink>
            </div>
          </Reveal>
          <div className="lg:col-span-7">
            <Eyebrow>{t.faqs.eyebrow}</Eyebrow>
            <div className="mt-5"><Accordion items={t.faqs.items} /></div>
          </div>
        </div>
      </Band>

      <Band label="Services">
        <SectionHead eyebrow="What we do" heading={{ text: 'Everything we offer,', accent: 'anywhere.' }} sub="Every service works the same way for clients abroad." />
        <ServiceLinks />
      </Band>

      <Closing cta={t.cta} interest="not-sure" />
    </>
  );
}

export function India() {
  const t = INDIA;
  return (
    <>
      <PageHero eyebrow={t.hero.eyebrow} title={t.hero.title} intro={t.hero.intro}>
        <PillLink href={contactHref('not-sure')}>{t.hero.primary}</PillLink>
        <PillLink href={servicesHref} variant="ghost">{t.hero.secondary}</PillLink>
      </PageHero>

      <Band tone="raised" label={t.areas.eyebrow}>
        <SectionHead eyebrow={t.areas.eyebrow} heading={t.areas.heading} sub={t.areas.sub} />
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {t.areas.items.map((a) => (
            <li key={a} className="rounded-2xl border border-line bg-bg px-5 py-4 text-fg">{a}</li>
          ))}
        </ul>
      </Band>

      <Band label="Services">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <SectionHead eyebrow="What we do" heading={{ text: 'Services for', accent: 'Indian businesses.' }} />
            <ServiceLinks />
          </div>
          <div className="lg:col-span-7">
            <Eyebrow>{t.faqs.eyebrow}</Eyebrow>
            <div className="mt-5"><Accordion items={t.faqs.items} /></div>
          </div>
        </div>
      </Band>

      <Closing cta={t.cta} interest="not-sure" />
    </>
  );
}

/** One market (country) page. Only rendered for published markets (see regions.ts). */
export function MarketPage({ market: m }: { market: Market }) {
  return (
    <>
      <PageHero eyebrow={m.hero.eyebrow} title={m.hero.title} intro={m.hero.intro}>
        <PillLink href={contactHref('not-sure')}>Book a call</PillLink>
        <PillLink href={INTERNATIONAL.path} variant="ghost">How we work remotely</PillLink>
      </PageHero>

      <Band tone="raised" label="Who we serve">
        <SectionHead eyebrow="Who we serve" heading={m.serve.heading} sub={m.serve.intro} />
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {m.serve.items.map((it) => <li key={it} className="rounded-2xl border border-line bg-bg p-7 text-lg text-fg">{it}</li>)}
        </ul>
      </Band>

      <Band label="Work">
        <SectionHead eyebrow="Work" heading={{ text: 'Work for clients in', accent: `${m.name}.` }} />
        <ul className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {m.caseStudies.map((c) => {
            const p = projects.find((x) => x.name === c.name);
            const href = c.url ?? p?.url;
            return (
              <li key={c.name} className="rounded-2xl border border-line bg-bg-2 p-7">
                <h3 className="text-xl font-medium text-fg">{href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-brand">{c.name}</a> : c.name}</h3>
                <p className="mt-3 leading-relaxed text-fg-2">{c.summary}</p>
              </li>
            );
          })}
        </ul>
      </Band>

      <Band tone="raised" label="Time zones">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-5 rounded-2xl border border-line bg-bg p-8">
            <Eyebrow>Time zones</Eyebrow>
            <h2 className="mt-5 text-3xl font-medium leading-tight tracking-[-0.02em] text-fg"><Accent h={m.timezone.heading} /></h2>
            <ul className="mt-6 space-y-3.5 text-fg-2">{m.timezone.points.map((p) => <CheckItem key={p}>{p}</CheckItem>)}</ul>
          </Reveal>
          <div className="lg:col-span-7">
            <Eyebrow>Questions</Eyebrow>
            <div className="mt-5"><Accordion items={m.faqs} /></div>
          </div>
        </div>
      </Band>

      <Closing
        cta={{ eyebrow: 'Next step', heading: { text: "Let's talk about your", accent: 'project.' }, body: `Book a call at a time that suits you. We'll ask about your business and send a written proposal.`, primary: 'Book a call', secondary: 'WhatsApp us' }}
        interest="not-sure"
      />
    </>
  );
}

export function NotFound() {
  return (
    <section className="pb-28 pt-36 sm:pt-44">
      <Container>
        <p className="text-sm text-fg-3">404</p>
        <h1 className="mt-5 max-w-3xl text-5xl font-medium leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl">
          This page <span className="font-serif font-normal italic tracking-normal text-brand">doesn&apos;t exist.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-2">It may have moved, or the link may be wrong. These will get you back on track:</p>
        <ul className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            { href: servicesHref, label: 'Our services', sub: 'Websites, apps, marketing and care' },
            { href: '/work', label: 'Our work', sub: 'Live projects we built' },
            { href: contactHref(), label: 'Contact us', sub: 'Tell us what you need' },
          ].map((l) => (
            <li key={l.href}>
              <a href={l.href} className="block rounded-2xl border border-line bg-bg-2 p-6 transition-colors hover:border-brand">
                <span className="block text-lg font-medium text-fg">{l.label}</span>
                <span className="mt-1 block text-sm text-fg-2">{l.sub}</span>
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
