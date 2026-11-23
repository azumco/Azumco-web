import { nav, services, site } from '../content';
import { legalLinks } from '../legalLinks';
import { Logo } from './Nav';
import { Container } from './ui';

export default function Footer() {
  // On sub-pages, section links need to point back to the home page
  const base = typeof window !== 'undefined' && window.location.pathname !== '/' ? '/' : '';
  return (
    <footer className="overflow-hidden border-t border-line pt-20">
      <Container>
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <Logo href={base || '#top'} />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-fg-2">
              Websites, apps and marketing — built, grown and managed by one team.
            </p>
            <p className="mt-3 text-xs text-fg-3">
              Serving Ujjain, Indore, Bhopal &amp; businesses across Madhya Pradesh and India.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
            <div>
              <h3 className="text-xs uppercase tracking-[0.18em] text-fg-3">Studio</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {nav.map((n) => (
                  <li key={n.href}>
                    <a href={base + n.href} className="text-fg-2 transition-colors hover:text-fg">
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-[0.18em] text-fg-3">Services</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {services.map((s) => (
                  <li key={s.id}>
                    <a href={base + '#services'} className="text-fg-2 transition-colors hover:text-fg">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-[0.18em] text-fg-3">Connect</h3>
              <ul className="mt-5 space-y-3 text-sm">
                <li>
                  <a href={`mailto:${site.email}`} className="text-fg-2 transition-colors hover:text-fg">
                    Email
                  </a>
                </li>
                <li>
                  <a href={site.whatsapp} target="_blank" rel="noreferrer" className="text-fg-2 transition-colors hover:text-fg">
                    WhatsApp
                  </a>
                </li>
                <li>
                  <a href={site.linkedin} target="_blank" rel="noreferrer" className="text-fg-2 transition-colors hover:text-fg">
                    LinkedIn
                  </a>
                </li>
                <li>
                  <a href={site.instagram} target="_blank" rel="noreferrer" className="text-fg-2 transition-colors hover:text-fg">
                    Instagram
                  </a>
                </li>
              </ul>
            </div>
          </div>
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
