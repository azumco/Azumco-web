// Team area root: session check, sign-in gate, forced password change, and
// role-aware pages. UI hiding here is convenience only — every rule is
// enforced again by the API.

import { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { Logo } from '../components/Nav';
import { Container } from '../components/ui';
import { api, setCsrf } from './api';
import { navigate, usePath } from './router';
import { Loading, WakingBanner } from './ui';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Home from './pages/Home';
import Users from './pages/Users';
import './team.css';

export type Role = 'super_admin' | 'admin' | 'employee';

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface Session {
  user: TeamUser;
  csrfToken: string;
}

/** Keep crawlers out of the team area even if a URL leaks (the server sends X-Robots-Tag too). */
function useNoIndex() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Team | Azumco';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = meta?.content;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow, noarchive';
    return () => {
      document.title = previousTitle;
      if (previous !== undefined) meta!.content = previous;
    };
  }, []);
}

const PAGES: { path: string; label: string; roles: Role[] }[] = [
  { path: '/team', label: 'Home', roles: ['super_admin', 'admin', 'employee'] },
  { path: '/team/users', label: 'Users', roles: ['super_admin'] },
];

export default function TeamApp() {
  useNoIndex();
  const path = usePath();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const accept = useCallback((s: Session | null) => {
    setCsrf(s?.csrfToken ?? '');
    setSession(s);
  }, []);

  useEffect(() => {
    api<Session>('GET', '/auth/me')
      .then(accept)
      // 401 = not signed in. Anything else after the wake-up retries also lands on sign-in.
      .catch(() => accept(null));
  }, [accept]);

  const signOut = async () => {
    await api('POST', '/auth/logout').catch(() => undefined);
    accept(null);
    navigate('/team');
  };

  let content;
  if (session === undefined) content = <Loading />;
  else if (session === null) content = <Login onSignedIn={accept} />;
  else if (session.user.mustChangePassword) content = <ChangePassword forced onChanged={accept} />;
  else {
    const page = PAGES.find((p) => p.path === path);
    const allowed = page && page.roles.includes(session.user.role);
    content =
      !allowed ? (
        <Home user={session.user} />
      ) : path === '/team/users' ? (
        <Users me={session.user} />
      ) : (
        <Home user={session.user} />
      );
  }

  const nav = session ? PAGES.filter((p) => p.roles.includes(session.user.role)) : [];

  return (
    <div className="min-h-screen bg-bg text-fg">
      <WakingBanner />
      <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
        <Container className="flex h-18 items-center justify-between gap-4">
          <Logo href="/team" />
          {session && !session.user.mustChangePassword && (
            <div className="flex items-center gap-1 sm:gap-3">
              <nav className="flex items-center gap-1 sm:gap-2" aria-label="Team">
                {nav.map((p) => (
                  <a
                    key={p.path}
                    href={p.path}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(p.path);
                    }}
                    aria-current={path === p.path ? 'page' : undefined}
                    className={`rounded-full px-3 py-2 text-sm transition-colors ${
                      path === p.path ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg'
                    }`}
                  >
                    {p.label}
                  </a>
                ))}
              </nav>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-2 text-fg-2 transition-colors hover:text-fg"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </Container>
      </header>
      <main>
        <Container className="pb-24 pt-10 sm:pt-16">{content}</Container>
      </main>
    </div>
  );
}
