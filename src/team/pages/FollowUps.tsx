// Team member follow-ups: Today / This week / Overdue, with live counts.
// Laptop: the list beside a detail panel (due banner, contact, call history,
// actions). "Log this call" swaps the panel to the Log a call form.

import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarCheck, Clock, MessageCircle, Phone } from 'lucide-react';
import { addDays } from '../../../shared/slots';
import { formatDate, istDate } from '../../../shared/time';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Button, ChoiceChip, StatusPill, Tag, cx } from '../ui';
import Workspace, { DetailPanel, LeadRow, useSelection } from '../components/Workspace';
import { LeadPanel, LiveContact, shortLabel } from './LeadDetail';
import { leadSubline } from './Leads';
import type { CallEntry, Lead, LeadsResponse, TeamUser } from '../types';

type Chip = 'today' | 'week' | 'overdue';
const EMPTY: Record<Chip, [string, string]> = {
  today: ['Nothing due today', 'Follow-ups you set when logging a call show up here on the day.'],
  week: ['Nothing else this week', 'Upcoming follow-ups for the next seven days show up here.'],
  overdue: ['Nothing overdue', "You're on top of every follow-up."],
};
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
const dayLabel = (d: string) => `${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${formatDate(d).slice(0, 6)}`;

function dueText(date: string, today: string) {
  if (date === today) return 'Follow-up due today';
  if (date < today) return `Follow-up overdue since ${dayLabel(date)}`;
  return `Follow-up due ${dayLabel(date)}`;
}

/** Dot colour for a call outcome in the history. */
const outcomeDot = (o: string) => (/interested|booked/i.test(o) && !/not interested/i.test(o) ? 'bg-good' : /not interested|wrong/i.test(o) ? 'bg-bad' : 'bg-fg-3');

function FollowUpDetail({ id, user, today, onChanged }: { id: string; user: TeamUser; today: string; onChanged: () => void }) {
  const state = useApi<{ lead: Lead; calls: CallEntry[] }>(`/leads/${id}`);
  const [logging, setLogging] = useState(false);
  useEffect(() => setLogging(false), [id]);

  if (logging) {
    return (
      <div>
        <button type="button" onClick={() => setLogging(false)} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-fg-2 hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Back to the follow-up
        </button>
        <LeadPanel id={id} user={user} embedded onChanged={() => { onChanged(); void state.reload(); }} />
      </div>
    );
  }

  return (
    <Async state={state} label="Loading follow-up…">
      {({ lead, calls }) => {
        const overdue = lead.followUpDate < today;
        return (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-medium tracking-[-0.02em]">{shortLabel(lead)}</h2>
                <p className="text-xs text-fg-3">{leadSubline(lead)}</p>
              </div>
              <StatusPill status={lead.status} />
            </div>

            {lead.followUpDate && (
              <div className={cx('flex items-start gap-3 rounded-2xl border px-4 py-3', overdue ? 'border-bad/40 bg-bad/10' : 'border-brand/40 bg-brand/10')}>
                <Clock className={cx('mt-0.5 h-4 w-4 shrink-0', overdue ? 'text-bad' : 'text-brand')} />
                <div className="min-w-0">
                  <p className="font-medium">{dueText(lead.followUpDate, today)}</p>
                  <p className="text-xs text-fg-2">{[lead.nextStep && `Next step: ${lead.nextStep.toLowerCase()}`, lead.lastNote].filter(Boolean).join(' · ') || 'No next step noted'}</p>
                </div>
              </div>
            )}

            {lead.needsLiveLookup ? (
              <LiveContact lead={lead} auto wide />
            ) : (
              <div className="rounded-3xl bg-bg-3/40 p-5 @min-[480px]:flex @min-[480px]:items-center @min-[480px]:justify-between @min-[480px]:gap-6">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">{lead.phoneSource === 'outreach_confirmed' ? 'Confirmed contact' : 'Contact'}</p>
                  <p className="mt-2 truncate text-xl font-medium">{lead.contactPerson || lead.businessName || shortLabel(lead)}</p>
                  {lead.phone ? <p className="mt-1 text-lg tabular-nums">{lead.phone}</p> : <p className="mt-1 text-sm text-fg-3">No phone number saved.</p>}
                </div>
                {lead.phone && (
                  <div className="mt-4 grid grid-cols-2 gap-2 @min-[480px]:mt-0 @min-[480px]:w-44 @min-[480px]:shrink-0 @min-[480px]:grid-cols-1">
                    <a href={`tel:${lead.phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand text-sm font-medium text-bg"><Phone className="h-4 w-4" /> Call now</a>
                    <a href={waLink(lead.phone)} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-2 text-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                  </div>
                )}
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium">Call history</h3>
              {calls.length === 0 ? (
                <p className="mt-2 text-sm text-fg-3">No calls logged yet.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {calls.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', outcomeDot(c.outcome))} />
                      <span className="min-w-0">
                        <span className="block text-sm text-fg">{c.outcome}</span>
                        <span className="block text-xs text-fg-3">{[formatDate(c.at).slice(0, 6), c.note].filter(Boolean).join(' · ')}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="grid gap-3 @min-[480px]:grid-cols-2">
              <Button onClick={() => setLogging(true)}>Log this call</Button>
              <Button variant="secondary" onClick={() => navigate(`/team/book?lead=${lead.id}`)}><CalendarCheck className="h-4 w-4" /> Book discovery call</Button>
            </div>
          </div>
        );
      }}
    </Async>
  );
}

export default function FollowUps({ user }: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const [chip, setChip] = useState<Chip>('today');
  const today = istDate();
  const weekEnd = addDays(today, 7);
  const withDate = (state.data?.leads ?? []).filter((l) => l.followUpDate && l.status !== 'Won' && l.status !== 'Lost');
  const groups: Record<Chip, Lead[]> = {
    today: withDate.filter((l) => l.followUpDate === today),
    week: withDate.filter((l) => l.followUpDate > today && l.followUpDate < weekEnd),
    overdue: withDate.filter((l) => l.followUpDate < today),
  };
  const list = [...groups[chip]].sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  const sel = useSelection(list.map((l) => l.id));

  return (
    <Async state={state} label="Loading follow-ups…">
      {() => {
        const total = groups.today.length + groups.week.length + groups.overdue.length;
        const [emptyTitle, emptyText] = EMPTY[chip];
        const header = (
          <div className="mb-6">
            <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
              Your <span className="font-serif font-normal italic tracking-normal text-brand">follow-ups</span>
            </h1>
            <p className="mt-1 text-fg-2">
              {groups.today.length ? `${groups.today.length} ${groups.today.length === 1 ? 'person' : 'people'} to get back to today.` : total ? `${total} ${total === 1 ? 'person' : 'people'} to get back to.` : 'Nobody to get back to right now.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ChoiceChip on={chip === 'today'} onClick={() => setChip('today')}>Today · {groups.today.length}</ChoiceChip>
              <ChoiceChip on={chip === 'week'} onClick={() => setChip('week')}>This week · {groups.week.length}</ChoiceChip>
              <ChoiceChip on={chip === 'overdue'} onClick={() => setChip('overdue')}>Overdue · {groups.overdue.length}</ChoiceChip>
            </div>
          </div>
        );
        const emptyCard = (
          <div className="rounded-3xl border border-line bg-bg-2 px-6 py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-3 text-fg-3"><CalendarCheck className="h-5 w-5" /></span>
            <p className="mt-4 font-medium">{emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-fg-3">{emptyText}</p>
          </div>
        );
        return (
          <Workspace
            header={header}
            list={
              list.length === 0 ? emptyCard : (
                <ul className="space-y-3">
                  {list.map((l) => (
                    <LeadRow
                      key={l.id}
                      title={shortLabel(l)}
                      sub={[l.nextStep, l.lastNote].filter(Boolean).join(' · ') || 'No next step noted'}
                      right={l.followUpDate === today ? <Tag tone="brand" dot={false}>Today</Tag> : l.followUpDate < today ? <Tag tone="bad" dot={false}>{dayLabel(l.followUpDate)}</Tag> : <Tag dot={false}>{dayLabel(l.followUpDate)}</Tag>}
                      selected={sel.current === l.id}
                      onOpen={() => sel.open(l.id)}
                    />
                  ))}
                </ul>
              )
            }
            detail={sel.current ? <DetailPanel><FollowUpDetail id={sel.current} user={user} today={today} onChanged={() => void state.reload()} /></DetailPanel> : null}
            empty={
              <section className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-line-2 px-6 text-center">
                <p className="font-medium">Pick a follow-up</p>
                <p className="mt-1 max-w-xs text-sm text-fg-3">{list.length ? 'Choose someone on the left to see their history.' : 'When you have follow-ups, the details show up here.'}</p>
              </section>
            }
          />
        );
      }}
    </Async>
  );
}
