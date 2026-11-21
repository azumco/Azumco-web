// Employee: assigned leads not yet contacted, soonest expiry first.

import { AlertTriangle } from 'lucide-react';
import { useApi, useServerNow } from '../hooks';
import { Async, Empty, PageHeader } from '../ui';
import LeadCard from '../components/LeadCard';
import type { LeadsResponse } from '../types';

const THREE_HOURS = 3 * 3_600_000;

export default function Queue() {
  const state = useApi<LeadsResponse>('/leads');
  const now = useServerNow(state.data?.serverNow);

  return (
    <div>
      <PageHeader eyebrow="Your workspace" title="My" accent="queue" />
      <Async state={state} label="Loading your leads…">
        {({ leads }) => {
          // Leads whose deadline has passed on the client clock are dropped
          // immediately; the server refuses them anyway.
          const queue = leads
            .filter((l) => !l.contacted && (!l.expiresAt || Date.parse(l.expiresAt) > now))
            .sort((a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity));
          const working = leads.filter((l) => l.contacted && l.status !== 'Won' && l.status !== 'Lost');
          const soon = queue.filter((l) => l.timerRunning && l.expiresAt && Date.parse(l.expiresAt) - now <= THREE_HOURS).length;
          return (
            <div className="space-y-4">
              {soon > 0 && (
                <div role="status" className="flex items-start gap-3 rounded-3xl border border-brand bg-brand/10 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                  <p className="text-sm text-fg">
                    <span className="font-medium">
                      {soon} lead{soon === 1 ? '' : 's'} expire{soon === 1 ? 's' : ''} in the next 3 hours.
                    </span>{' '}
                    Log a call to keep {soon === 1 ? 'it' : 'them'}.
                  </p>
                </div>
              )}
              {queue.length === 0 ? (
                <Empty title="Your queue is clear">New leads assigned to you will appear here.</Empty>
              ) : (
                queue.map((l) => <LeadCard key={l.id} lead={l} now={now} />)
              )}
              {working.length > 0 && (
                <section className="space-y-3 pt-6">
                  <h2 className="text-xs uppercase tracking-[0.18em] text-fg-3">In progress · {working.length}</h2>
                  {working.map((l) => (
                    <LeadCard key={l.id} lead={l} now={now} />
                  ))}
                </section>
              )}
            </div>
          );
        }}
      </Async>
    </div>
  );
}
