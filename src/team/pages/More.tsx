// Founders on phones: account card, the pages that don't fit the tab bar, and sign out.

import { Bell, ChevronRight, LogOut, Settings as SettingsIcon, Target, Wallet } from 'lucide-react';
import { navigate } from '../router';
import { Avatar, Tag } from '../ui';
import type { TeamUser } from '../types';

const ROLE = { super_admin: 'Super admin', admin: 'Founder', employee: 'Team member' } as const;

export default function More({ user, unread, onSignOut }: { user: TeamUser; unread: number; onSignOut: () => void }) {
  const items = [
    { path: '/team/money', label: 'Money', sub: 'Founders only', icon: Wallet },
    { path: '/team/goals', label: 'Goals', sub: 'Team goals', icon: Target },
    ...(user.role === 'super_admin' ? [{ path: '/team/settings', label: 'Settings', sub: 'Super admin', icon: SettingsIcon }] : []),
    { path: '/team/notifications', label: 'Notifications', sub: unread ? `${unread} unread` : 'All caught up', icon: Bell },
  ];
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[2.2rem] font-medium tracking-[-0.035em]">More</h1>
      <div className="mt-5 flex items-center gap-4 rounded-3xl border border-line bg-bg-2 p-5">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-sm text-fg-3">{user.email}</p>
          {user.jobTitle && <p className="truncate text-xs text-fg-3">{user.jobTitle}</p>}
        </div>
        <Tag tone="brand">{ROLE[user.role]}</Tag>
      </div>
      <ul className="mt-4 overflow-hidden rounded-3xl border border-line bg-bg-2">
        {items.map((i) => (
          <li key={i.path} className="border-b border-line last:border-0">
            <a
              href={i.path}
              onClick={(e) => {
                e.preventDefault();
                navigate(i.path);
              }}
              className="flex min-h-16 items-center gap-4 px-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-3 text-fg-2"><i.icon className="h-4 w-4" /></span>
              <span className="flex-1">
                <span className="block font-medium">{i.label}</span>
                <span className="block text-xs text-fg-3">{i.sub}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-fg-3" />
            </a>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onSignOut} className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-3xl border border-bad/40 px-5 text-bad">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
