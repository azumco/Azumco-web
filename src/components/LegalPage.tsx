import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { legalPages, LEGAL, type Block } from '../legal';
import type { LegalKey } from '../legalLinks';
import { Logo } from './Nav';
import Footer from './Footer';
import { Container } from './ui';

function renderBlock(block: Block, i: number) {
  if (typeof block === 'string') return <p key={i}>{block}</p>;
  if ('h' in block)
    return (
      <h3 key={i} className="pt-2 text-base font-medium text-fg">
        {block.h}
      </h3>
    );
  return (
    <ul key={i} className="space-y-2.5">
      {block.list.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-brand" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LegalPage({ page }: { page: LegalKey }) {
  const { title, intro, sections } = legalPages[page];

  // The <title> comes with the pre-rendered page (siteRoutes.tsx).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <div className="site min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
        <Container className="flex h-18 items-center justify-between">
          <Logo href="/" />
          <a href="/" className="inline-flex items-center gap-2 text-sm text-fg-2 transition-colors hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </a>
        </Container>
      </header>

      <main>
        <Container className="pb-24 pt-16 sm:pt-24">
          <div className="max-w-3xl">
            <p className="text-sm text-fg-3">Effective {LEGAL.effectiveDate}</p>
            <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-6xl">{title}</h1>
            <p className="mt-5 text-lg text-fg-2">{intro}</p>
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-12">
            <nav className="hidden lg:col-span-3 lg:block" aria-label="On this page">
              <ol className="sticky top-28 space-y-2.5 text-sm">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-fg-3 transition-colors hover:text-fg">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className="space-y-14 lg:col-span-8 lg:col-start-5">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-28">
                  <h2 className="text-2xl font-medium tracking-[-0.02em]">
                    <span className="mr-3 text-brand">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                  </h2>
                  <div className="mt-5 space-y-4 leading-relaxed text-fg-2">{s.body.map(renderBlock)}</div>
                </section>
              ))}
            </article>
          </div>
        </Container>
      </main>

      <Footer home={false} />
    </div>
  );
}
