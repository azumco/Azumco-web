import { site } from '../content';
import { SERVICES } from '../services';
import { serviceHref, servicesHref } from '../links';
import { legalLinks } from '../legalLinks';
import { Logo } from './Nav';
import { Container } from './ui';

const GROUPS = [
  { key: 'build', label: 'Build' },
  { key: 'grow', label: 'Grow' },
  { key: 'manage', label: 'Manage' },
] as const;

export default function Footer({ home = true }: { home?: boolean }) {
  const link = 'inline-flex min-h-11 items-center text-fg-2 transition-colors hover:text-fg';
  return (
    <footer className="overflow-hidden border-t border-line pt-20">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo href={home ? '#top' : '/'} />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-fg-2">
              Websites, apps and marketing — built, grown and managed by one team.
            </p>
            <p className="mt-3 text-xs text-fg-3">
              Serving Ujjain, Indore, Bhopal &amp; businesses across Madhya Pradesh and India.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            {GROUPS.map((g) => (
              <div key={g.key}>
                <h3 className="text-xs uppercase tracking-[0.18em] text-fg-3">{g.label}</h3>
                <ul className="mt-3 text-sm">
                  {SERVICES.filter((s) => s.group === g.key).map((s) => (
                    <li key={s.slug}>
                      <a href={serviceHref(s.slug)} className={link}>{s.short}</a>
                    </li>
                  ))}
                  {g.key === 'manage' && (
                    <li>
                      <a href={`${servicesHref}#growth-partner`} className={link}>Growth partner</a>
                    </li>
                  )}
                </ul>
              </div>
            ))}
            <div>
              <h3 className="text-xs uppercase tracking-[0.18em] text-fg-3">Connect</h3>
              <ul className="mt-3 text-sm">
                <li><a href={`mailto:${site.email}`} className={link}>Email</a></li>
                <li><a href={site.whatsapp} target="_blank" rel="noreferrer" className={link}>WhatsApp</a></li>
                <li><a href={site.linkedin} target="_blank" rel="noreferrer" className={link}>LinkedIn</a></li>
                <li><a href={site.instagram} target="_blank" rel="noreferrer" className={link}>Instagram</a></li>
              </ul>
            </div>
          </nav>
        </div>

        {/* relative z-10: the big AZUMCO wordmark below overflows upward; keep these links on top of it. */}
        <div className="relative z-10 mt-16 flex flex-col gap-4 border-t border-line py-6 text-xs text-fg-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.legalName} All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {legalLinks.map((p) => (
              <a key={p.path} href={p.path} className="transition-colors hover:text-fg">
                {p.title}
              </a>
            ))}
          </div>
        </div>
      </Container>

      {/*
        Team entry. Deliberately not a link or button: no hover style, no
        cursor change, no focus stop and nothing for crawlers to follow — it
        looks and reads exactly as before. The team area also works at /team.
      */}
      <div
        aria-hidden="true"
        onClick={() => window.location.assign('/team')}
        className="select-none text-center text-[23vw] font-bold leading-[0.75] tracking-[-0.06em] text-transparent [-webkit-tap-highlight-color:transparent] [-webkit-text-stroke:1px_var(--line-2)] translate-y-[8%]"
      >
        AZUMCO
      </div>
    </footer>
  );
}
