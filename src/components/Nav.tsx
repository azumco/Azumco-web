import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import logo from '../logo-mark.png';
import { nav } from '../content';
import { contactHref, sectionHref } from '../links';
import { Container } from './ui';

export function Logo({ href = '#top', lazy = false }: { href?: string; lazy?: boolean }) {
  return (
    <a href={href} className="flex items-center gap-2.5" aria-label="Azumco — home">
      <img src={logo} alt="" width={32} height={32} loading={lazy ? 'lazy' : undefined} className="h-8 w-8 object-contain" />
      <span className="text-lg font-bold tracking-[-0.02em] text-fg">Azumco</span>
    </a>
  );
}

/** Nav links: "Services" is its own page; the rest are sections of the home page. */
const navHref = (href: string, home: boolean) =>
  href === '#work' && !home ? '/work' : href.startsWith('#') ? sectionHref(href.slice(1), home) : href;

export default function Nav({ home = true, current }: { home?: boolean; current?: 'services' }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? 'border-b border-line bg-bg/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <Container className="flex h-18 items-center justify-between">
        <Logo href={home ? '#top' : '/'} />

        <nav className="hidden items-center gap-9 md:flex" aria-label="Main">
          {nav.map((item) => (
            <a
              key={item.href}
              href={navHref(item.href, home)}
              aria-current={current === 'services' && item.href === '/services' ? 'page' : undefined}
              className={`text-sm transition-colors hover:text-fg ${current === 'services' && item.href === '/services' ? 'text-fg' : 'text-fg-2'}`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={contactHref(undefined, home)}
            className="hidden min-h-10 items-center rounded-full bg-fg px-5 text-sm font-medium text-bg transition-colors hover:bg-brand hover:text-bg sm:inline-flex"
          >
            Book a call
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden md:hidden"
            aria-label="Mobile"
          >
            <Container className="flex flex-col gap-1 pb-6 pt-2">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={navHref(item.href, home)}
                  onClick={() => setOpen(false)}
                  className="border-b border-line py-4 text-2xl font-medium tracking-tight text-fg"
                >
                  {item.label}
                </a>
              ))}
              <a
                href={contactHref(undefined, home)}
                onClick={() => setOpen(false)}
                className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-brand text-sm font-medium text-bg"
              >
                Book a call
              </a>
            </Container>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
