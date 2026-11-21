// Employee: her own numbers only (the API computes them from her leads).

import { formatInr } from '../../../shared/time';
import { useApi } from '../hooks';
import { Async, Card, PageHeader, Stat } from '../ui';

interface Me {
  stats: { calls: number; booked: number; qualified: number; won: number };
  queue: number;
  followUps: { overdue: number; dueToday: number };
  earnings: { earned: number; paid: number; pending: number };
}

export default function Earnings() {
  const state = useApi<Me>('/dashboard/me');
  return (
    <div>
      <PageHeader eyebrow="Your workspace" title="My" accent="earnings" />
      <Async state={state}>
        {(d) => (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Earned" value={formatInr(d.earnings.earned)} accent />
              <Stat label="Paid" value={formatInr(d.earnings.paid)} />
              <Stat label="Pending" value={formatInr(d.earnings.pending)} />
            </div>
            <section>
              <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">My stats</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Calls" value={d.stats.calls} />
                <Stat label="Booked" value={d.stats.booked} />
                <Stat label="Qualified" value={d.stats.qualified} />
                <Stat label="Won" value={d.stats.won} />
              </div>
            </section>
            <Card>
              <p className="text-sm text-fg-2">
                You earn a fee for every lead whose discovery call happens, plus a share of the deal once it is won and the
                client has paid. Founders mark commission as paid.
              </p>
            </Card>
          </div>
        )}
      </Async>
    </div>
  );
}
