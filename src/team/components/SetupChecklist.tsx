// Founder Home: a slim "Get ready" bar (progress + next step; tap to see the rest). Your own items first (Meet link, free
// slots), then the team's (passwords, sign-ins, who receives leads, first
// leads assigned). Everything ticks itself off from live data. Hidden once
// all done; "Hide for now" hides it on this device until something changes.

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { cx } from '../ui';
import { firstName, type TeamUser } from '../types';

interface Checklist {
  me: { meetLink: boolean; freeSlots: boolean };
  founders: { id: string; name: string; meetLink: boolean; freeSlots: boolean; signedIn: boolean }[];
  members: { id: string; name: string; canReceiveLeads: boolean; signedIn: boolean; hasPassword: boolean }[];
  team: { memberCanReceiveLeads: boolean; membersHavePassword: boolean; membersSignedIn: boolean; leadsAssigned: boolean; placesEnabled: boolean };
}

interface Item { key: string; done: boolean; title: string; detail: string; href?: string }

function Row({ item }: { item: Item }) {
  const body = (
    <>
      <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', item.done ? 'border-good bg-good/15 text-good' : 'border-line-2 text-transparent')}>
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-sm', item.done ? 'text-fg-3 line-through' : 'text-fg')}>{item.title}</span>
        {!item.done && <span className="block text-xs text-fg-3">{item.detail}</span>}
      </span>
      {item.href && !item.done && <ChevronRight className="h-4 w-4 shrink-0 text-fg-3" />}
    </>
  );
  return (
    <li>
      {item.href && !item.done ? (
        <a href={item.href} onClick={(e) => { e.preventDefault(); navigate(item.href!); }} className="flex min-h-12 items-center gap-3 rounded-2xl px-2 py-2 hover:bg-bg-3/60">{body}</a>
      ) : (
        <div className="flex min-h-12 items-center gap-3 px-2 py-2">{body}</div>
      )}
    </li>
  );
}

export default function SetupChecklist({ user }: { user: TeamUser }) {
  const state = useApi<Checklist>('/setup-checklist');
  const superAdmin = user.role === 'super_admin';
  const d = state.data;
  const signature = d ? JSON.stringify(d) : '';
  const [hidden, setHidden] = useState(() => localStorage.getItem('azumco.checklist.hidden') ?? '');
  const [open, setOpen] = useState(false);
  if (!d) return null;

  const names = (list: { name: string }[]) => list.map((x) => firstName(x.name)).join(', ');
  const othersNoLink = d.founders.filter((f) => f.id !== user.id && !f.meetLink);
  const othersNoSlots = d.founders.filter((f) => f.id !== user.id && !f.freeSlots);
  const noPassword = d.members.filter((m) => !m.hasPassword);
  const notSignedIn = d.members.filter((m) => m.hasPassword && !m.signedIn);

  const mine: Item[] = [
    { key: 'meet', done: d.me.meetLink, title: 'Add your Google Meet link', detail: 'Every call booked with you uses it. You let the client in when you join.', href: '/team/calendar' },
    { key: 'slots', done: d.me.freeSlots, title: 'Add your free time slots', detail: 'Team members can only book calls into these. Add the next two weeks.', href: '/team/calendar' },
  ];
  const team: Item[] = [
    { key: 'founders-meet', done: othersNoLink.length === 0, title: 'Every founder has a Meet link', detail: `Still missing: ${names(othersNoLink)}.` },
    { key: 'founders-slots', done: othersNoSlots.length === 0, title: 'Every founder has free slots', detail: `No free time in the next 2 weeks: ${names(othersNoSlots)}.` },
    {
      key: 'passwords', done: d.team.membersHavePassword, title: 'Team members have a password',
      detail: d.members.length ? `Create one in Settings → Team for: ${names(noPassword)}.` : 'Add your team member in Settings → Team.',
      href: superAdmin ? '/team/settings' : undefined,
    },
    { key: 'signed-in', done: d.team.membersSignedIn, title: 'Team members have signed in once', detail: notSignedIn.length ? `Waiting for: ${names(notSignedIn)}. They choose their own password on first sign-in.` : 'They choose their own password on first sign-in.' },
    { key: 'receive', done: d.team.memberCanReceiveLeads, title: 'Someone can receive leads', detail: 'Turn on “Can receive leads” for the caller in Settings → Team.', href: superAdmin ? '/team/settings' : undefined },
    { key: 'leads', done: d.team.leadsAssigned, title: 'Assign the first leads', detail: d.team.placesEnabled ? 'Find businesses on Google, or add leads by hand, and assign them.' : 'Add leads by hand and assign them (Google search is off).', href: d.team.placesEnabled ? '/team/find' : '/team/leads?add=1' },
  ];
  const all = [...mine, ...team];
  const done = all.filter((i) => i.done).length;
  if (done === all.length || hidden === signature) return null;

  const hide = () => {
    localStorage.setItem('azumco.checklist.hidden', signature);
    setHidden(signature);
  };
  const todo = all.filter((i) => !i.done);
  const next = todo[0];
  const pct = Math.round((done / all.length) * 100);

  // One slim bar: progress ring, the next step, expand for the rest.
  return (
    <section className="mb-6 rounded-3xl border border-line bg-bg-2">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden="true">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-bg-3" />
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-brand" strokeDasharray={`${(pct / 100) * 94.2} 94.2`} />
            </svg>
            <span className="text-[11px] font-medium tabular-nums">{done}/{all.length}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Get ready for the first calls</span>
            <span className="block truncate text-xs text-fg-3">Next: {next.title}</span>
          </span>
          <ChevronDown className={cx('h-4 w-4 shrink-0 text-fg-3 transition-transform', open && 'rotate-180')} />
        </button>
        <button type="button" onClick={hide} aria-label="Hide the checklist for now" title="Hide for now" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-3 hover:text-fg"><X className="h-4 w-4" /></button>
      </div>
      {open && (
        <div className="border-t border-line px-2 pb-2 pt-1 sm:px-3">
          <ul>{todo.map((i) => <Row key={i.key} item={i} />)}</ul>
          <p className="px-2 pb-1 pt-1 text-xs text-fg-3">{done} done · ticks itself off · disappears when everything is ready</p>
        </div>
      )}
    </section>
  );
}
