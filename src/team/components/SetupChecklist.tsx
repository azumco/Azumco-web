// Founder Home: "Get ready" checklist. Your own items first (Meet link, free
// slots), then the team's (passwords, sign-ins, who receives leads, first
// leads assigned). Everything ticks itself off from live data. Hidden once
// all done; "Hide for now" hides it on this device until something changes.

import { useState } from 'react';
import { Check, ChevronRight, ListChecks, X } from 'lucide-react';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { ProgressBar, cx } from '../ui';
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

  return (
    <section className="mb-6 rounded-3xl border border-brand/40 bg-bg-2 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><ListChecks className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium">Get ready <span className="font-serif font-normal italic text-brand">for the first calls</span></h2>
          <p className="text-sm text-fg-2">{done} of {all.length} done. Everything here ticks itself off.</p>
        </div>
        <button type="button" onClick={hide} aria-label="Hide the checklist for now" title="Hide for now" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-3 hover:text-fg"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-4"><ProgressBar percent={(done / all.length) * 100} tone="good" label="Checklist progress" /></div>
      <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div>
          <p className="mb-1 px-2 text-[11px] uppercase tracking-[0.16em] text-fg-3">You</p>
          <ul>{mine.map((i) => <Row key={i.key} item={i} />)}</ul>
        </div>
        <div>
          <p className="mb-1 px-2 text-[11px] uppercase tracking-[0.16em] text-fg-3">The team</p>
          <ul>{team.map((i) => <Row key={i.key} item={i} />)}</ul>
        </div>
      </div>
    </section>
  );
}
