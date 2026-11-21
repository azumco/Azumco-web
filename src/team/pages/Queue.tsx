// Employee home. "To call" (assigned, not yet contacted, soonest expiry first)
// and "Follow-ups" (due or overdue first) share this layout; the Follow-ups
// tab opens it in follow-up mode.

import { AlertCircle, ChevronRight, Store } from 'lucide-react';
import { formatDate, formatInr } from '../../../shared/time';
import { useApi, useServerNow } from '../hooks';
import { navigate } from '../router';
import { Async, Countdown, Empty, Segmented, Tag } from '../ui';
import type { Lead, LeadsResponse, TeamUser } from '../types';

interface Me {
  stats: { contacted: number; qualified: number; won: number };
  earnings: { earned: number };
}

const THREE_HOURS = 3 * 3_600_000;

function Row({ l, now, followUp }: { l: Lead; now: number; followUp?: boolean }) {
  const sub = l.needsLiveLookup ? 'Google lead' : [l.city, l.source].filter(Boolean).join(' · ');
  return (
    <li>
      <a
        href={`/team/leads/${l.id}`}
        onClick={(e) => {
          e.preventDefault();
          navigate(`/team/leads/${l.id}`);
        }}
        className="flex items-center gap-4 rounded-3xl border border-line bg-bg-2 p-4 hover:border-line-2"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-3 text-fg-3"><Store className="h-4.5 w-4.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{l.label.replace(/ · Google lead$/, '')}</span>
          <span className="block truncate text-xs text-fg-3">{sub || '—'}</span>
        </span>
        {followUp ? (
          l.followUp === 'overdue' ? <Tag tone="bad">Overdue · {formatDate(l.followUpDate).slice(0, 6)}</Tag> : l.followUp === 'today' ? <Tag tone="warn">Today</Tag> : <Tag>{formatDate(l.followUpDate).slice(0, 6)}</Tag>
        ) : (
          <Countdown expiresAt={l.timerRunning ? l.expiresAt : null} now={now} />
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-3" />
      </a>
    </li>
  );
}

export default function Queue({ user, mode }: { user: TeamUser; mode: 'call' | 'followups' }) {
  const state = useApi<LeadsResponse>('/leads');
  const me = useApi<Me>('/dashboard/me');
  const now = useServerNow(state.data?.serverNow);

  return (
    <div>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em]">
        Hi <span className="font-serif font-normal italic tracking-normal text-brand">{user.name.split(' ')[0]}</span>
      </h1>
      <Async state={state} label="Loading your leads…">
        {({ leads }) => {
          const toCall = leads
            .filter((l) => !l.contacted && (!l.expiresAt || Date.parse(l.expiresAt) > now))
            .sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity));
          const followUps = leads
            .filter((l) => l.followUp !== 'none')
            .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
          const soon = toCall.filter((l) => l.timerRunning && l.expiresAt && Date.parse(l.expiresAt) - now <= THREE_HOURS).length;
          const list = mode === 'call' ? toCall : followUps;
          return (
            <>
              <p className="mt-1 text-fg-2">
                {toCall.length ? `${toCall.length} lead${toCall.length === 1 ? ' is' : 's are'} waiting for your call.` : 'No new leads waiting right now.'}
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[
                  [me.data?.stats.contacted ?? '–', 'contacted'],
                  [me.data?.stats.qualified ?? '–', 'qualified'],
                  [me.data ? formatInr(me.data.earnings.earned) : '–', 'earned'],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-2xl border border-line bg-bg-2 p-3">
                    <p className="text-xl font-medium tabular-nums">{v}</p>
                    <p className="text-xs text-fg-3">{l}</p>
                  </div>
                ))}
              </div>
              {soon > 0 && (
                <div role="status" className="mt-4 flex items-center gap-3 rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 text-bad" />
                  {soon} lead{soon === 1 ? '' : 's'} disappear{soon === 1 ? 's' : ''} in under 3 hours
                </div>
              )}
              <Segmented
                className="mt-4"
                options={[{ value: 'call', label: `To call · ${toCall.length}` }, { value: 'followups', label: `Follow-ups · ${followUps.length}` }]}
                value={mode}
                onChange={(v) => navigate(v === 'call' ? '/team' : '/team/followups')}
              />
              <ul className="mt-4 space-y-2">
                {list.length === 0 ? (
                  <Empty title={mode === 'call' ? 'Your queue is clear' : 'No follow-ups'}>
                    {mode === 'call' ? 'New leads assigned to you will appear here.' : 'Pick a follow-up date when you log a call and it shows here.'}
                  </Empty>
                ) : (
                  list.map((l) => <Row key={l.id} l={l} now={now} followUp={mode === 'followups'} />)
                )}
              </ul>
            </>
          );
        }}
      </Async>
    </div>
  );
}
