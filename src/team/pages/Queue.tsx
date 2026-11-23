// Team member home: leads waiting for a first call, soonest expiry first.
// Laptop: header with stats, a 400px list and the Log a call panel beside it.
// Phone: the list; a lead opens its own page.

import { AlertTriangle, ArrowRight, Inbox } from 'lucide-react';
import { formatInr } from '../../../shared/time';
import { useApi, useServerNow } from '../hooks';
import { navigate } from '../router';
import { Async, Countdown, Segmented, cx } from '../ui';
import Workspace, { DetailPanel, LeadRow, useSelection } from '../components/Workspace';
import AddOwnLead from '../components/AddOwnLead';
import { LeadPanel, shortLabel } from './LeadDetail';
import { firstName, istGreeting, type Lead, type LeadsResponse, type TeamUser } from '../types';

interface Me {
  stats: { contacted: number; qualified: number; calls: number; booked: number };
  earnings: { earned: number };
}

const THREE_HOURS = 3 * 3_600_000;
export const isFollowUp = (l: Lead) => l.followUp !== 'none';

/** "SATURDAY, 21 NOVEMBER" in India time. */
export function todayEyebrow(now = new Date()) {
  const part = (o: Intl.DateTimeFormatOptions) => now.toLocaleDateString('en-GB', { ...o, timeZone: 'Asia/Kolkata' });
  return `${part({ weekday: 'long' })}, ${part({ day: 'numeric' })} ${part({ month: 'long' })}`;
}

export function Greeting({ user, line }: { user: TeamUser; line: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-fg-3">{todayEyebrow()}</p>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
        {istGreeting()}, <span className="font-serif font-normal italic tracking-normal text-brand">{firstName(user.name)}</span>
      </h1>
      <p className="mt-1 text-fg-2">{line}</p>
    </div>
  );
}

function Stats({ me }: { me: Me | null }) {
  const items: [string | number, string][] = [
    [me?.stats.contacted ?? '–', 'contacted'],
    [me?.stats.qualified ?? '–', 'qualified'],
    [me ? formatInr(me.earnings.earned) : '–', 'earned'],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 min-[1100px]:flex min-[1100px]:gap-3">
      {items.map(([v, l]) => (
        <div key={l} className="rounded-2xl border border-line bg-bg-2 p-3 min-[1100px]:min-w-24 min-[1100px]:px-5 min-[1100px]:py-4">
          <p className="truncate text-xl font-medium tabular-nums">{v}</p>
          <p className="text-xs text-fg-3">{l}</p>
        </div>
      ))}
    </div>
  );
}

/** "You're all caught up": three tips and the running totals. */
export function CaughtUp({ me, compact }: { me: Me | null; compact?: boolean }) {
  const tips = [
    ['Founders assign leads', compact ? 'They show up with a countdown.' : 'They show up here with a countdown timer.'],
    ['Call within the timer', compact ? 'Otherwise the lead goes back.' : "A lead you haven't called in time goes back to the founders."],
    ['Log every call', compact ? 'Even a no-answer counts.' : 'Even a no-answer counts, and it stops the timer.'],
  ];
  const totals: [string | number, string][] = [
    [me?.stats.calls ?? '–', compact ? 'calls' : 'calls logged'],
    [me?.stats.booked ?? '–', compact ? 'booked' : 'calls booked'],
    [me ? formatInr(me.earnings.earned) : '–', 'earned'],
  ];
  return (
    <div className="space-y-3">
      <section className="rounded-3xl border border-line bg-bg-2 px-5 py-8 text-center sm:px-8 sm:py-10">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-brand"><Inbox className="h-6 w-6" /></span>
        <h2 className="mt-6 text-3xl font-medium tracking-[-0.03em]">
          You're all <span className="font-serif font-normal italic tracking-normal text-brand">caught up</span>
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-fg-2">You'll get a notification when the founders send you new leads.</p>
        <ol className={cx('mt-7 text-left', compact ? 'space-y-3 rounded-2xl bg-bg-3/60 p-4' : 'grid gap-3 @min-[560px]:grid-cols-3')}>
          {tips.map(([t, d], i) => (
            <li key={t} className={cx(compact ? 'flex gap-3' : 'rounded-2xl bg-bg-3/60 p-5')}>
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs text-brand">{i + 1}</span>
              <span className={cx('block', !compact && 'mt-3')}>
                <span className="block text-sm font-medium text-fg">{t}</span>
                <span className="block text-xs text-fg-3">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        {!compact && <Totals totals={totals} />}
      </section>
      {compact && <Totals totals={totals} compact />}
    </div>
  );
}

function Totals({ totals, compact }: { totals: [string | number, string][]; compact?: boolean }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line px-5 py-4 text-left', compact ? 'justify-between bg-bg-2' : 'mt-3')}>
      {/* Running totals from your record (all time). */}
      <span className="text-[11px] uppercase tracking-[0.18em] text-fg-3">So far</span>
      <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {totals.map(([v, l]) => (
          <span key={l} className={cx('flex items-baseline gap-2', compact && 'flex-col items-center gap-0')}>
            <span className="text-lg font-medium tabular-nums text-fg">{v}</span>
            <span className="text-xs text-fg-3">{l}</span>
          </span>
        ))}
      </span>
      {!compact && (
        <a href="/team/earnings" onClick={(e) => { e.preventDefault(); navigate('/team/earnings'); }} className="ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand">
          See earnings <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export default function Queue({ user }: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const me = useApi<Me>('/dashboard/me');
  const now = useServerNow(state.data?.serverNow);
  const leads = state.data?.leads ?? [];
  const toCall = leads
    .filter((l) => !l.contacted && (!l.expiresAt || Date.parse(l.expiresAt) > now))
    .sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity));
  const sel = useSelection(toCall.map((l) => l.id));

  return (
    <Async state={state} label="Loading your leads…">
      {() => {
        const followUps = leads.filter(isFollowUp).length;
        const expiring = toCall.filter((l) => l.timerRunning && l.expiresAt && Date.parse(l.expiresAt) - now <= THREE_HOURS);
        const reload = () => {
          void state.reload();
          void me.reload();
        };

        const header = (
          <div className="mb-6 space-y-5">
            <div className="flex flex-col gap-5 min-[1100px]:flex-row min-[1100px]:items-end min-[1100px]:justify-between">
              <div>
                <Greeting user={user} line={toCall.length ? `${toCall.length} lead${toCall.length === 1 ? ' is' : 's are'} waiting for your call.` : 'Nothing is waiting for you right now.'} />
                <AddOwnLead className="mt-4" />
              </div>
              <Stats me={me.data} />
            </div>
            {expiring.length > 0 && (
              <div role="status" className="flex items-center gap-3 rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-bad" />
                <span className="flex-1">
                  {expiring.length} lead{expiring.length === 1 ? '' : 's'} disappear{expiring.length === 1 ? 's' : ''} in under 3 hours<span className="hidden min-[1100px]:inline">. Call {expiring.length === 1 ? 'it' : 'them'} first.</span>
                </span>
                <button type="button" onClick={() => sel.open(expiring[0].id)} className="hidden min-h-11 shrink-0 items-center gap-1.5 font-medium text-brand min-[1100px]:inline-flex">
                  Open the first one <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        );

        const segmented = (
          <Segmented className="mb-3" options={[{ value: 'call', label: `To call · ${toCall.length}` }, { value: 'followups', label: `Follow-ups · ${followUps}` }, { value: 'history', label: 'History' }]} value="call" onChange={(v) => (v === 'followups' ? navigate('/team/followups') : v === 'history' && navigate('/team/history'))} />
        );

        // Phones and tablets with nothing to call: the designed panel instead of the list.
        if (toCall.length === 0 && !sel.wide) {
          return (
            <div>
              {header}
              <CaughtUp me={me.data} compact />
            </div>
          );
        }

        return (
          <Workspace
            header={header}
            list={
              <>
                {segmented}
                {toCall.length === 0 ? (
                  <div className="rounded-3xl border border-line bg-bg-2 px-6 py-8 text-center">
                    <p className="font-medium">Nothing to call</p>
                    <p className="mt-1 text-sm text-fg-3">New leads from the founders appear here.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {toCall.map((l) => (
                      <LeadRow
                        key={l.id}
                        title={shortLabel(l)}
                        sub={l.booking ? l.nextAction : l.needsLiveLookup ? 'Google lead' : [l.city, l.source].filter(Boolean).join(' · ') || '—'}
                        right={<Countdown expiresAt={l.timerRunning ? l.expiresAt : null} now={now} />}
                        selected={sel.current === l.id}
                        onOpen={() => sel.open(l.id)}
                      />
                    ))}
                  </ul>
                )}
              </>
            }
            detail={sel.current ? <DetailPanel><LeadPanel key={sel.current} id={sel.current} user={user} embedded onChanged={reload} /></DetailPanel> : null}
            empty={<div className="@container"><CaughtUp me={me.data} /></div>}
          />
        );
      }}
    </Async>
  );
}
