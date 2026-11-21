// Team area root: session check, sign-in gate, forced password change, and
// role-aware navigation. Hiding things here is convenience only — every rule
// is enforced again by the API.
//
// Founders: top navigation on desktop, a menu sheet on phones.
// Employees: the same top bar on desktop; a bottom tab bar at ≤768px
// (Queue, Follow-ups, Book, Earnings).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bell, BookOpen, CalendarDays, CalendarPlus, LayoutDashboard, ListChecks, LogOut, Menu, Search, Settings as SettingsIcon,
  Target, Users as UsersIcon, Wallet, X,
} from 'lucide-react';
import { Logo } from '../components/Nav';
import { Container } from '../components/ui';
import { api, setCsrf } from './api';
import { navigate, usePath } from './router';
import { Loading, WakingBanner } from './ui';
import { isFounder, type Role, type Session, type TeamUser } from './types';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import FindClients from './pages/FindClients';
import Calendar from './pages/Calendar';
import Book from './pages/Book';
import Expenses from './pages/Expenses';
import Goals from './pages/Goals';
import Settings from './pages/Settings';
import Queue from './pages/Queue';
import FollowUps from './pages/FollowUps';
import Earnings from './pages/Earnings';
import Notifications from './pages/Notifications';
import './team.css';

export type { Role, Session, TeamUser };

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

interface NavItem {
  path: string;
  label: string;
  icon: typeof Bell;
  roles: Role[];
  /** Shown in the employee bottom tab bar on phones. */
  tab?: boolean;
}

const ALL: Role[] = ['super_admin', 'admin', 'employee'];
const FOUNDERS: Role[] = ['super_admin', 'admin'];

const NAV: NavItem[] = [
  { path: '/team', label: 'Dashboard', icon: LayoutDashboard, roles: FOUNDERS },
  { path: '/team/leads', label: 'Leads', icon: UsersIcon, roles: FOUNDERS },
  { path: '/team/find', label: 'Find clients', icon: Search, roles: FOUNDERS },
  { path: '/team/calendar', label: 'Calendar', icon: CalendarDays, roles: FOUNDERS },
  { path: '/team/expenses', label: 'Expenses', icon: Wallet, roles: FOUNDERS },
  { path: '/team/goals', label: 'Goals', icon: Target, roles: ALL },
  { path: '/team/settings', label: 'Settings', icon: SettingsIcon, roles: ['super_admin'] },
  { path: '/team', label: 'Queue', icon: ListChecks, roles: ['employee'], tab: true },
  { path: '/team/followups', label: 'Follow-ups', icon: BookOpen, roles: ['employee'], tab: true },
  { path: '/team/book', label: 'Book', icon: CalendarPlus, roles: ['employee'], tab: true },
  { path: '/team/earnings', label: 'Earnings', icon: Wallet, roles: ['employee'], tab: true },
];

function link(path: string) {
  return {
    href: path,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(path);
    },
  };
}

function page(path: string, user: TeamUser): ReactNode {
  const founder = isFounder(user);
  const leadMatch = /^\/team\/leads\/([^/]+)$/.exec(path);
  if (leadMatch) return <LeadDetail id={leadMatch[1]} user={user} />;
  switch (path) {
    case '/team':
      return founder ? <Dashboard /> : <Queue />;
    case '/team/leads':
      return founder ? <Leads user={user} /> : <Queue />;
    case '/team/find':
      return founder ? <FindClients /> : null;
    case '/team/calendar':
      return founder ? <Calendar user={user} /> : null;
    case '/team/book':
      return <Book user={user} />;
    case '/team/expenses':
      return founder ? <Expenses /> : null;
    case '/team/goals':
      return <Goals user={user} />;
    case '/team/settings':
      return user.role === 'super_admin' ? <Settings me={user} /> : null;
    case '/team/followups':
      return <FollowUps />;
    case '/team/earnings':
      return <Earnings />;
    case '/team/notifications':
      return <Notifications />;
    default:
      return null;
  }
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-fg-2">That page is not available.</p>
      <a {...link('/team')} className="mt-4 inline-flex min-h-11 items-center text-sm text-brand">
        Go to your home page
      </a>
    </div>
  );
}

function Bellbutton({ path }: { path: string }) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    // Refreshed on navigation and every two minutes — no per-second polling.
    let alive = true;
    const load = () =>
      api<{ unread: number }>('GET', '/notifications')
        .then((r) => alive && setUnread(r.unread))
        .catch(() => undefined);
    void load();
    const id = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path]);
  return (
    <a
      {...link('/team/notifications')}
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg-2 transition-colors hover:text-fg"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-medium text-bg">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </a>
  );
}

export default function TeamApp() {
  useNoIndex();
  const path = usePath();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => setMenuOpen(false), [path]);

  const signOut = async () => {
    await api('POST', '/auth/logout').catch(() => undefined);
    accept(null);
    navigate('/team');
  };

  const user = session && !session.user.mustChangePassword ? session.user : null;
  const allowed = user ? NAV.filter((n) => n.roles.includes(user.role)) : [];
  // Employees: their four workspace tabs first, then Goals.
  const items = [...allowed.filter((n) => n.tab), ...allowed.filter((n) => !n.tab)];
  const employee = user?.role === 'employee';
  const isActive = (p: string) => (p === '/team' ? path === '/team' : path === p || path.startsWith(`${p}/`));

  let content: ReactNode;
  if (session === undefined) content = <Loading />;
  else if (session === null) content = <Login onSignedIn={accept} />;
  else if (session.user.mustChangePassword) content = <ChangePassword forced onChanged={accept} />;
  else content = page(path, session.user) ?? <NotFound />;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <WakingBanner />
      <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-xl">
        <Container className="flex h-16 items-center justify-between gap-3 sm:h-18">
          <Logo href="/team" />
          {user && (
            <>
              <nav className={`hidden items-center gap-1 ${employee ? 'md:flex' : 'lg:flex'}`} aria-label="Team">
                {items.map((n) => (
                  <a
                    key={n.label}
                    {...link(n.path)}
                    aria-current={isActive(n.path) ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-sm transition-colors ${
                      isActive(n.path) ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg'
                    }`}
                  >
                    {n.label}
                  </a>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <Bellbutton path={path} />
                {!employee && (
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg lg:hidden"
                    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={menuOpen}
                  >
                    {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                  </button>
                )}
                {employee && (
                  <a
                    {...link('/team/goals')}
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 md:hidden ${isActive('/team/goals') ? 'text-fg' : 'text-fg-2'}`}
                    aria-label="Goals"
                  >
                    <Target className="h-4 w-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={signOut}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg-2 transition-colors hover:text-fg"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </Container>
        {user && !employee && menuOpen && (
          <nav className="border-t border-line lg:hidden" aria-label="Team menu">
            <Container className="grid grid-cols-2 gap-2 py-4 sm:grid-cols-3">
              {items.map((n) => (
                <a
                  key={n.label}
                  {...link(n.path)}
                  aria-current={isActive(n.path) ? 'page' : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl border px-4 text-sm ${
                    isActive(n.path) ? 'border-brand/50 bg-bg-3 text-fg' : 'border-line text-fg-2'
                  }`}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </a>
              ))}
            </Container>
          </nav>
        )}
      </header>

      <main>
        <Container className={`pt-8 sm:pt-12 ${employee ? 'pb-28 md:pb-24' : 'pb-24'}`}>{content}</Container>
      </main>

      {user && employee && (
        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
          aria-label="Workspace"
        >
          <div className="grid grid-cols-4">
            {items
              .filter((n) => n.tab)
              .map((n) => (
                <a
                  key={n.label}
                  {...link(n.path)}
                  aria-current={isActive(n.path) ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${isActive(n.path) ? 'text-brand' : 'text-fg-2'}`}
                >
                  <n.icon className="h-5 w-5" />
                  {n.label}
                </a>
              ))}
          </div>
        </nav>
      )}
    </div>
  );
}
