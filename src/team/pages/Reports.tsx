// Founders: the detailed breakdowns that used to sit on the dashboard.

import { useApi } from '../hooks';
import { Async, Card, PageTitle } from '../ui';

interface Data {
  breakdowns: Record<'rating' | 'status' | 'outcome' | 'source' | 'addedBy', Record<string, number>>;
  expiredByAssignee: Record<string, number>;
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Card>
      <h2 className="text-sm font-medium">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-fg-3">No data yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map(([k, v]) => (
            <li key={k}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate text-fg-2">{k}</span>
                <span className="tabular-nums">{v}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-bg-3">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Reports() {
  const state = useApi<Data>('/dashboard/founder');
  return (
    <div>
      <PageTitle title="Detailed" accent="reports" subtitle="Where leads come from and how calls go." />
      <Async state={state}>
        {(d) => (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Breakdown title="By source" data={d.breakdowns.source} />
            <Breakdown title="By rating" data={d.breakdowns.rating} />
            <Breakdown title="By call outcome" data={d.breakdowns.outcome} />
            <Breakdown title="By status" data={d.breakdowns.status} />
            <Breakdown title="By who added" data={d.breakdowns.addedBy} />
            <Breakdown title="Expired assignments" data={d.expiredByAssignee} />
          </div>
        )}
      </Async>
    </div>
  );
}
