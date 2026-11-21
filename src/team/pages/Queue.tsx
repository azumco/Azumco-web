// Team member home: leads waiting for a first call, soonest expiry first.

import { AlertCircle } from 'lucide-react';
import { formatInr } from '../../../shared/time';
import { useApi, useServerNow } from '../hooks';
import { navigate } from '../router';
import { Async, Countdown, Empty, Segmented } from '../ui';
import Workspace, { LeadRow } from '../components/Workspace';
import { shortLabel } from './LeadDetail';
import { firstName, istGreeting, type Lead, type LeadsResponse, type TeamUser } from '../types';

interface Me {
  stats: { contacted: number; qualified: number };
  earnings: { earned: number };
}

const THREE_HOURS = 3 * 3_600_000;
export const isFollowUp = (l: Lead) => l.followUp !== 'none';

export function Greeting({ user, line }: { user: TeamUser; line: string }) {
  return (
    <>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em]">
        {istGreeting()}, <span className="font-serif font-normal italic tracking-normal text-brand">{firstName(user.name)}</span>
      </h1>
      <p className="mt-1 text-fg-2">{line}</p>
    </>
  );
}

export default function Queue({ user }: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const me = useApi<Me>('/dashboard/me');
  const now = useServerNow(state.data?.serverNow);

  return (
    <Async state={state} label="Loading your leads…">
      {({ leads }) => {
        const toCall = leads
          .filter((l) => !l.contacted && (!l.expiresAt || Date.parse(l.expiresAt) > now))
          .sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity));
        const followUps = leads.filter(isFollowUp).length;
        const soon = toCall.filter((l) => l.timerRunning && l.expiresAt && Date.parse(l.expiresAt) - now <= THREE_HOURS).length;
        const header = (
          <div className="mb-4">
            <Greeting user={user} line={toCall.length ? `${toCall.length} lead${toCall.length === 1 ? ' is' : 's are'} waiting for your call.` : 'No new leads waiting right now.'} />
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
            <Segmented className="mt-4" options={[{ value: 'call', label: `To call · ${toCall.length}` }, { value: 'followups', label: `Follow-ups · ${followUps}` }]} value="call" onChange={(v) => v === 'followups' && navigate('/team/followups')} />
          </div>
        );
        return (
          <Workspace
            user={user}
            leads={toCall}
            header={header}
            onChanged={() => void state.reload()}
            renderList={(selected, open) =>
              toCall.length === 0 ? (
                <Empty title="Your queue is clear">New leads assigned to you will appear here.</Empty>
              ) : (
                <ul className="space-y-2">
                  {toCall.map((l) => (
                    <LeadRow
                      key={l.id}
                      title={shortLabel(l)}
                      sub={l.needsLiveLookup ? 'Google lead' : [l.city, l.source].filter(Boolean).join(' · ') || '—'}
                      right={<Countdown expiresAt={l.timerRunning ? l.expiresAt : null} now={now} />}
                      selected={selected === l.id}
                      onOpen={() => open(l.id)}
                    />
                  ))}
                </ul>
              )
            }
          />
        );
      }}
    </Async>
  );
}
