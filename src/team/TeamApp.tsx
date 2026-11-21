// Team area root: session, sign-in gate, forced password change, and the
// two shells. Founder and team-member navigation never mix.
//
// Breakpoints (both roles):
//   < 768px     mobile: top bar + bottom tab bar
//   768–1023px  top bar + menu
//   ≥ 1024px    left sidebar
//
// Hiding things here is convenience only; every rule is enforced by the API.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bell, CalendarDays, Clock, Home as HomeIcon, IndianRupee, List, LogOut, Menu, MoreHorizontal, Search, Settings as SettingsIcon, Target,
  Users as UsersIcon, Wallet, X,
} from 'lucide-react';
import { api, setCsrf } from './api';
import { navigate, usePath } from './router';
import { Avatar, Loading, WakingBanner, colourTone, cx } from './ui';
import { isFounder, type LeadsResponse, type Role, type Session, type TeamUser } from './types';
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
import MyGoals from './pages/MyGoals';
import Settings from './pages/Settings';
import Queue from './pages/Queue';
import FollowUps from './pages/FollowUps';
import Earnings from './pages/Earnings';
import Notifications from './pages/Notifications';
import More from './pages/More';
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

export const link = (path: string) => ({
  href: path,
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(path);
  },
});

export const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super admin', admin: 'Founder', employee: 'Team member' };

type NavItem = { path: string; label: string; icon: typeof Bell; superOnly?: boolean; count?: number };

const FOUNDER_NAV: NavItem[] = [
  { path: '/team', label: 'Home', icon: HomeIcon },
  { path: '/team/leads', label: 'Leads', icon: UsersIcon },
  { path: '/team/find', label: 'Find clients', icon: Search },
  { path: '/team/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/team/money', label: 'Money', icon: Wallet },
  { path: '/team/goals', label: 'Goals', icon: Target },
  { path: '/team/settings', label: 'Settings', icon: SettingsIcon, superOnly: true },
];
const FOUNDER_TABS: NavItem[] = [
  { path: '/team', label: 'Home', icon: HomeIcon },
  { path: '/team/leads', label: 'Leads', icon: UsersIcon },
  { path: '/team/find', label: 'Find', icon: Search },
  { path: '/team/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/team/more', label: 'More', icon: MoreHorizontal },
];
const MEMBER_NAV: NavItem[] = [
  { path: '/team', label: 'Queue', icon: List },
  { path: '/team/followups', label: 'Follow-ups', icon: Clock },
  { path: '/team/book', label: 'Book', icon: CalendarDays },
  { path: '/team/goals', label: 'Goals', icon: Target },
  { path: '/team/earnings', label: 'Earnings', icon: IndianRupee },
];

function founderPage(path: string, user: TeamUser, unread: number, onSignOut: () => void): ReactNode {
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
    case '/team/more': return <More user={user} unread={unread} onSignOut={onSignOut} />;
    default: return null;
  }
}

function memberPage(path: string, user: TeamUser): ReactNode {
  const lead = /^\/team\/leads\/([^/]+)$/.exec(path);
  if (lead) return <LeadDetail id={lead[1]} user={user} />;
  switch (path) {
    case '/team': return <Queue user={user} />;
    case '/team/followups': return <FollowUps user={user} />;
    case '/team/book': return <Book user={user} />;
    case '/team/earnings': return <Earnings />;
    case '/team/goals': return <MyGoals user={user} />;
    case '/team/notifications': return <Notifications />;
    default: return null;
  }
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-fg-2">That page is not available.</p>
      <a {...link('/team')} className="mt-4 inline-flex min-h-11 items-center text-sm text-brand">Go to your home page</a>
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

/** Queue / follow-up counts for the team member's sidebar. */
function useMemberCounts(path: string) {
  const [counts, setCounts] = useState({ queue: 0, followUps: 0 });
  useEffect(() => {
    let alive = true;
    api<LeadsResponse>('GET', '/leads')
      .then((r) => {
        if (!alive) return;
        const now = Date.parse(r.serverNow);
        setCounts({
          queue: r.leads.filter((l) => !l.contacted && (!l.expiresAt || Date.parse(l.expiresAt) > now)).length,
          followUps: r.leads.filter((l) => l.followUp === 'today' || l.followUp === 'overdue').length,
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path]);
  return counts;
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
    <a {...link('/team/notifications')} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg">
      <Bell className="h-4 w-4" />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-medium text-bg">{unread > 9 ? '9+' : unread}</span>}
    </a>
  );
}

function Shell({ user, path, onSignOut, nav, tabs, unread, children }: { user: TeamUser; path: string; onSignOut: () => void; nav: NavItem[]; tabs: NavItem[]; unread: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const founder = isFounder(user);
  const active = (p: string) =>
    p === '/team' ? path === '/team' : path === p || path.startsWith(`${p}/`) || (p === '/team/money' && ['/team/milestone', '/team/expenses'].includes(path)) || (p === '/team/more' && ['/team/money', '/team/goals', '/team/settings', '/team/notifications'].includes(path));

  const navList = (
    <nav aria-label="Team" className="flex flex-col gap-1">
      {nav.map((n) => (
        <a key={n.path} {...link(n.path)} aria-current={active(n.path) ? 'page' : undefined} className={cx('flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] transition-colors', active(n.path) ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg')}>
          <n.icon className={cx('h-4.5 w-4.5', active(n.path) && 'text-brand')} />
          <span className="flex-1">{n.label}</span>
          {n.count !== undefined && n.count > 0 && (
            <span className={cx('min-w-6 rounded-full px-2 text-center text-xs tabular-nums', active(n.path) ? 'bg-brand text-bg' : 'bg-bg-3 text-fg-2')}>{n.count}</span>
          )}
        </a>
      ))}
    </nav>
  );

  const userCard = (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg-2 p-3">
      <Avatar name={user.name} tone={founder ? 'brand' : 'violet'} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{user.name}</p>
        <p className="truncate text-xs text-fg-3">{user.jobTitle || ROLE_LABEL[user.role]}</p>
      </div>
      <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-3 hover:text-fg">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="lg:flex">
      {/* ≥1024: sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-line px-4 py-7 lg:flex">
        <div>
          <div className="mb-8 pl-2"><Wordmark /></div>
          {navList}
        </div>
        <div className="space-y-2">
          <a {...link('/team/notifications')} className="flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm text-fg-2 hover:text-fg">
            <Bell className="h-4 w-4" /> Notifications {unread > 0 && <span className="ml-auto rounded-full bg-brand px-2 text-xs text-bg">{unread}</span>}
          </a>
          {userCard}
        </div>
      </aside>

      {/* <1024: top bar (menu button only at 768–1023) */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-line bg-bg/90 px-5 backdrop-blur-xl lg:hidden">
        <Wordmark />
        <div className="flex items-center gap-2">
          <BellLink unread={unread} />
          {founder && (
            <a {...link('/team/more')} aria-label="Your account" className="md:hidden">
              <Avatar name={user.name} tone={colourTone('brand')} />
            </a>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} className="hidden h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg md:inline-flex">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>
      {open && (
        <div className="hidden border-b border-line bg-bg px-5 py-4 md:block lg:hidden">
          {navList}
          <div className="mt-4">{userCard}</div>
        </div>
      )}

      <main className={cx('min-w-0 flex-1 px-5 pt-6 sm:px-8 md:pt-8 lg:px-10 lg:pt-11', 'pb-28 md:pb-20')}>
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>

      {/* <768: bottom tab bar */}
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((t) => (
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

function FounderShell({ user, path, onSignOut }: { user: TeamUser; path: string; onSignOut: () => void }) {
  const unread = useUnread(path);
  const nav = FOUNDER_NAV.filter((n) => !n.superOnly || user.role === 'super_admin');
  return (
    <Shell user={user} path={path} onSignOut={onSignOut} nav={nav} tabs={FOUNDER_TABS} unread={unread}>
      {founderPage(path, user, unread, onSignOut) ?? <NotFound />}
    </Shell>
  );
}

function MemberShell({ user, path, onSignOut }: { user: TeamUser; path: string; onSignOut: () => void }) {
  const unread = useUnread(path);
  const counts = useMemberCounts(path);
  const nav = MEMBER_NAV.map((n) => (n.path === '/team' ? { ...n, count: counts.queue } : n.path === '/team/followups' ? { ...n, count: counts.followUps } : n));
  return (
    <Shell user={user} path={path} onSignOut={onSignOut} nav={nav} tabs={MEMBER_NAV} unread={unread}>
      {memberPage(path, user) ?? <NotFound />}
    </Shell>
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
  if (session === undefined) body = <Loading label="Starting up…" />;
  else if (session === null) body = <Login onSignedIn={accept} />;
  else if (session.user.mustChangePassword) {
    body = (
      <div className="mx-auto max-w-md px-5 py-16">
        <ChangePassword forced onChanged={accept} />
      </div>
    );
  } else if (isFounder(session.user)) body = <FounderShell user={session.user} path={path} onSignOut={signOut} />;
  else body = <MemberShell user={session.user} path={path} onSignOut={signOut} />;

  return (
    <div className="team-root min-h-screen bg-bg text-fg">
      <WakingBanner />
      {body}
    </div>
  );
}
