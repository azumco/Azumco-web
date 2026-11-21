// Team area root: session, sign-in gate, forced password change, and the two
// shells — founders get a left sidebar (a menu at ≤768px), the employee gets a
// mobile-first layout with a bottom tab bar. Hiding things here is convenience
// only; every rule is enforced again by the API.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Bell, CalendarDays, Clock, Home as HomeIcon, IndianRupee, List, LogOut, Menu, Search, Settings as SettingsIcon, Target, Users as UsersIcon, Wallet, X } from 'lucide-react';
import { api, setCsrf } from './api';
import { navigate, usePath } from './router';
import { Avatar, Loading, WakingBanner, cx } from './ui';
import { isFounder, type Role, type Session, type TeamUser } from './types';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Home from './pages/Home';
import Reports from './pages/Reports';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import FindClients from './pages/FindClients';
import Calendar from './pages/Calendar';
import Book from './pages/Book';
import Money from './pages/Money';
import Goals from './pages/Goals';
import Settings from './pages/Settings';
import Queue from './pages/Queue';
import Earnings from './pages/Earnings';
import Notifications from './pages/Notifications';
import './team.css';

export type { Role, Session, TeamUser };

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

const link = (path: string) => ({
  href: path,
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(path);
  },
});

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super admin', admin: 'Founder', employee: 'Team' };

const FOUNDER_NAV = [
  { path: '/team', label: 'Home', icon: HomeIcon },
  { path: '/team/leads', label: 'Leads', icon: UsersIcon },
  { path: '/team/find', label: 'Find clients', icon: Search },
  { path: '/team/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/team/money', label: 'Money', icon: Wallet },
  { path: '/team/goals', label: 'Goals', icon: Target },
  { path: '/team/settings', label: 'Settings', icon: SettingsIcon, superOnly: true },
];

const EMPLOYEE_TABS = [
  { path: '/team', label: 'Queue', icon: List },
  { path: '/team/followups', label: 'Follow-ups', icon: Clock },
  { path: '/team/book', label: 'Book', icon: CalendarDays },
  { path: '/team/earnings', label: 'Earnings', icon: IndianRupee },
];

function founderPage(path: string, user: TeamUser): ReactNode {
  const lead = /^\/team\/leads\/([^/]+)$/.exec(path);
  if (lead) return <LeadDetail id={lead[1]} user={user} />;
  switch (path) {
    case '/team': return <Home user={user} />;
    case '/team/reports': return <Reports />;
    case '/team/leads': return <Leads />;
    case '/team/find': return <FindClients />;
    case '/team/calendar': return <Calendar user={user} />;
    case '/team/book': return <Book user={user} />;
    case '/team/money':
    case '/team/milestone':
    case '/team/expenses': return <Money user={user} />;
    case '/team/goals': return <Goals user={user} />;
    case '/team/settings': return user.role === 'super_admin' ? <Settings me={user} /> : null;
    case '/team/notifications': return <Notifications />;
    default: return null;
  }
}

function employeePage(path: string, user: TeamUser): ReactNode {
  const lead = /^\/team\/leads\/([^/]+)$/.exec(path);
  if (lead) return <LeadDetail id={lead[1]} user={user} />;
  switch (path) {
    case '/team': return <Queue user={user} mode="call" />;
    case '/team/followups': return <Queue user={user} mode="followups" />;
    case '/team/book': return <Book user={user} />;
    case '/team/earnings': return <Earnings />;
    case '/team/goals': return <Goals user={user} />;
    case '/team/notifications': return <Notifications />;
    default: return null;
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

function useUnread(path: string) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ unread: number }>('GET', '/notifications').then((r) => alive && setUnread(r.unread)).catch(() => undefined);
    void load();
    const id = setInterval(load, 120_000); // no per-second polling
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path]);
  return unread;
}

function Wordmark() {
  return (
    <a {...link('/team')} className="flex items-center gap-2.5" aria-label="Azumco team home">
      <span className="h-2.5 w-2.5 rounded-full bg-brand" />
      <span className="text-lg font-bold tracking-[-0.02em] text-fg">Azumco</span>
      <span className="rounded-full border border-line-2 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-fg-3">Team</span>
    </a>
  );
}

function BellLink({ unread }: { unread: number }) {
  return (
    <a
      {...link('/team/notifications')}
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg"
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-medium text-bg">{unread > 9 ? '9+' : unread}</span>}
    </a>
  );
}

function FounderShell({ user, path, onSignOut, children }: { user: TeamUser; path: string; onSignOut: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const unread = useUnread(path);
  useEffect(() => setOpen(false), [path]);
  const items = FOUNDER_NAV.filter((n) => !n.superOnly || user.role === 'super_admin');
  const active = (p: string) => (p === '/team' ? path === '/team' : path === p || path.startsWith(`${p}/`) || (p === '/team/money' && (path === '/team/milestone' || path === '/team/expenses')));

  const nav = (
    <nav aria-label="Team" className="flex flex-col gap-1">
      {items.map((n) => (
        <a
          key={n.path}
          {...link(n.path)}
          aria-current={active(n.path) ? 'page' : undefined}
          className={cx('flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] transition-colors', active(n.path) ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg')}
        >
          <n.icon className={cx('h-4.5 w-4.5', active(n.path) && 'text-brand')} />
          {n.label}
        </a>
      ))}
    </nav>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg-2 p-3">
      <Avatar name={user.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{user.name}</p>
        <p className="text-xs text-fg-3">{ROLE_LABEL[user.role]}</p>
      </div>
      <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-3 hover:text-fg">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="min-[769px]:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-line px-4 py-7 min-[769px]:flex">
        <div>
          <div className="mb-8 pl-2">
            <Wordmark />
          </div>
          {nav}
        </div>
        <div className="space-y-2">
          <a {...link('/team/notifications')} className="flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm text-fg-2 hover:text-fg">
            <Bell className="h-4 w-4" /> Notifications {unread > 0 && <span className="ml-auto rounded-full bg-brand px-2 text-xs text-bg">{unread}</span>}
          </a>
          {userCard}
        </div>
      </aside>

      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-line bg-bg/90 px-5 backdrop-blur-xl min-[769px]:hidden">
        <Wordmark />
        <div className="flex items-center gap-2">
          <BellLink unread={unread} />
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>
      {open && (
        <div className="border-b border-line bg-bg px-5 py-4 min-[769px]:hidden">
          {nav}
          <div className="mt-4">{userCard}</div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-5 pb-20 pt-8 sm:px-8 min-[769px]:px-10 min-[769px]:pt-11">
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}

function EmployeeShell({ path, onSignOut, children }: { path: string; onSignOut: () => void; children: ReactNode }) {
  const unread = useUnread(path);
  const active = (p: string) => (p === '/team' ? path === '/team' : path === p);
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <Wordmark />
          <nav aria-label="Workspace" className="hidden items-center gap-1 md:flex">
            {[...EMPLOYEE_TABS, { path: '/team/goals', label: 'Goals', icon: Target }].map((t) => (
              <a key={t.path} {...link(t.path)} aria-current={active(t.path) ? 'page' : undefined} className={cx('inline-flex min-h-11 items-center rounded-full px-3 text-sm', active(t.path) ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg')}>
                {t.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a {...link('/team/goals')} aria-label="Goals" className={cx('inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 md:hidden', active('/team/goals') ? 'text-fg' : 'text-fg-2')}>
              <Target className="h-4 w-4" />
            </a>
            <BellLink unread={unread} />
            <button type="button" onClick={onSignOut} aria-label="Sign out" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pt-6">{children}</main>
      <nav aria-label="Workspace tabs" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-4">
          {EMPLOYEE_TABS.map((t) => (
            <a key={t.path} {...link(t.path)} aria-current={active(t.path) ? 'page' : undefined} className={cx('flex min-h-16 flex-col items-center justify-center gap-1 text-[11px]', active(t.path) ? 'text-brand' : 'text-fg-2')}>
              <t.icon className="h-5 w-5" />
              {t.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

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
      .catch(() => accept(null));
  }, [accept]);

  const signOut = async () => {
    await api('POST', '/auth/logout').catch(() => undefined);
    accept(null);
    navigate('/team');
  };

  let body: ReactNode;
  if (session === undefined) body = <Loading />;
  else if (session === null) body = <Login onSignedIn={accept} />;
  else if (session.user.mustChangePassword) {
    body = (
      <div className="mx-auto max-w-md px-5 py-16">
        <ChangePassword forced onChanged={accept} />
      </div>
    );
  } else if (isFounder(session.user)) {
    body = (
      <FounderShell user={session.user} path={path} onSignOut={signOut}>
        {founderPage(path, session.user) ?? <NotFound />}
      </FounderShell>
    );
  } else {
    body = (
      <EmployeeShell path={path} onSignOut={signOut}>
        {employeePage(path, session.user) ?? <NotFound />}
      </EmployeeShell>
    );
  }

  return (
    <div className="team-root min-h-screen bg-bg text-fg">
      <WakingBanner />
      {body}
    </div>
  );
}
