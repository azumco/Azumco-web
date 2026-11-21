// Founder dashboard: pipeline totals, follow-ups, breakdowns, Places usage,
// expired assignments and commission.

import { formatInr } from '../../../shared/time';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Breakdown, Card, PageHeader, Stat } from '../ui';
import type { PlacesUsage } from '../types';

interface Founder {
  totals: { leads: number; contacted: number; callsBooked: number; qualified: number; won: number; lost: number; winRate: number | null };
  followUps: { overdue: number; dueToday: number };
  unclaimed: number;
  breakdowns: Record<'rating' | 'status' | 'outcome' | 'source' | 'addedBy', Record<string, number>>;
  places: PlacesUsage;
  expiredByAssignee: Record<string, number>;
  commission: { userId: string; name: string; earned: number; paid: number; pending: number }[];
  milestone: { id: string; name: string; target: number; stillNeeded: number; sharePerFounder: number; percent: number; fullyFunded: boolean } | null;
}

const go = (path: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(path);
};

export default function Dashboard() {
  const state = useApi<Founder>('/dashboard/founder');
  return (
    <div>
      <PageHeader eyebrow="Overview" title="Founder" accent="dashboard" />
      <Async state={state} label="Loading numbers…">
        {(d) => (
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Leads" value={d.totals.leads} />
              <Stat label="Contacted" value={d.totals.contacted} />
              <Stat label="Calls booked" value={d.totals.callsBooked} />
              <Stat label="Qualified" value={d.totals.qualified} />
              <Stat label="Won" value={d.totals.won} accent />
              <Stat label="Win rate" value={d.totals.winRate === null ? '—' : `${d.totals.winRate}%`} hint="Won ÷ (won + lost)" />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <a href="/team/leads" onClick={go('/team/leads')} className="block">
                <Stat label="Follow-ups overdue" value={d.followUps.overdue} accent={d.followUps.overdue > 0} />
              </a>
              <a href="/team/leads" onClick={go('/team/leads')} className="block">
                <Stat label="Follow-ups due today" value={d.followUps.dueToday} />
              </a>
              <a href="/team/leads" onClick={go('/team/leads')} className="block">
                <Stat label="Unclaimed leads" value={d.unclaimed} />
              </a>
            </div>

            {d.milestone && (
              <a href="/team/milestone" onClick={go('/team/milestone')} className="block">
                <Card className="hover:border-line-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium">{d.milestone.name}</h3>
                    <span className="text-sm tabular-nums text-fg-2">{d.milestone.percent}% funded</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-bg-3">
                    <div className="h-1.5 rounded-full bg-brand" style={{ width: `${d.milestone.percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-fg-3">
                    {d.milestone.fullyFunded
                      ? 'Fully funded'
                      : `${formatInr(d.milestone.stillNeeded)} still needed of ${formatInr(d.milestone.target)} · ${formatInr(d.milestone.sharePerFounder)} per founder`}
                  </p>
                </Card>
              </a>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <h3 className="text-sm font-medium">Google Places this month</h3>
                <p className="mt-3 text-3xl font-medium tracking-[-0.03em]">
                  {d.places.used} <span className="text-lg text-fg-3">/ {d.places.cap}</span>
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-bg-3">
                  <div className="h-1.5 rounded-full bg-brand" style={{ width: `${d.places.cap ? Math.min(100, (d.places.used / d.places.cap) * 100) : 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-fg-3">
                  {d.places.searches} searches · {d.places.lookups} contact lookups{d.places.paused && ' · paused'}
                </p>
              </Card>
              <Card>
                <h3 className="text-sm font-medium">Commission</h3>
                {d.commission.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-3">No employees yet.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {d.commission.map((c) => (
                      <li key={c.userId} className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
                        <span className="text-fg">{c.name}</span>
                        <span className="text-right tabular-nums text-fg">{formatInr(c.earned)} earned</span>
                        <span className="text-xs text-fg-3">paid {formatInr(c.paid)}</span>
                        <span className={`text-right text-xs tabular-nums ${c.pending ? 'text-brand-2' : 'text-fg-3'}`}>{formatInr(c.pending)} pending</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Breakdown title="By status" data={d.breakdowns.status} />
              <Breakdown title="By rating" data={d.breakdowns.rating} />
              <Breakdown title="By call outcome" data={d.breakdowns.outcome} />
              <Breakdown title="By source" data={d.breakdowns.source} />
              <Breakdown title="By who added" data={d.breakdowns.addedBy} />
              <Breakdown title="Expired assignments" data={d.expiredByAssignee} />
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}
