import { ArrowUpRight } from 'lucide-react';
import { projects, type Project } from '../content';
import { Container, Eyebrow, Heading, Reveal } from './ui';

function Cover({ project }: { project: Project }) {
  return (
    <img
      src={project.image}
      alt={`${project.name} website`}
      className="absolute inset-0 h-full w-full object-cover object-left-top"
      loading="lazy"
      decoding="async"
    />
  );
}

function Card({ project, large }: { project: Project; large?: boolean }) {
  const Tag = project.url ? 'a' : 'div';
  return (
    <Tag
      {...(project.url ? { href: project.url, target: '_blank', rel: 'noreferrer' } : {})}
      data-cursor={project.url ? 'Visit' : 'Live'}
      className="group block"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-line bg-bg-2 ${
          large ? 'aspect-[4/3] md:aspect-[16/8]' : 'aspect-[4/3]'
        }`}
      >
        <div className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]">
          <Cover project={project} />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-medium tracking-[-0.02em] text-fg">
            {project.name}
            {project.url && <ArrowUpRight className="h-4 w-4 text-fg-3 transition-colors group-hover:text-brand" />}
          </h3>
          <p className="mt-1 text-sm text-fg-2">{project.tagline}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:max-w-[45%] sm:justify-end">
          {project.tags.map((t) => (
            <span key={t} className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-3">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Tag>
  );
}

export default function Work() {
  const [first, ...rest] = projects;

  return (
    <section id="work" className="relative scroll-mt-20 py-24 sm:py-32">
      <Container>
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <Eyebrow>Selected work</Eyebrow>
            <Heading className="mt-6" accent="in production.">
              Recent projects,
            </Heading>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-sm text-fg-2">Live products we designed and built for clients across services, SaaS and marketing.</p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-x-6 gap-y-16 md:grid-cols-2">
          <Reveal className="md:col-span-2">
            <Card project={first} large />
          </Reveal>
          {rest.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.1}>
              <Card project={p} />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
