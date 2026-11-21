// Founder Home: only what needs action today, the four numbers, the pipeline,
// upcoming calls, Google usage, and the milestone + commission column.

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatDate, formatInr, istDate } from '../../../shared/time';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Avatar, Button, Card, CardHeader, ProgressBar, Stat, cx } from '../ui';
import type { PlacesUsage, TeamUser } from '../types';

interface Founder {
  needs: { followUpsToday: number; firstFollowUpLeadId: string | null; overdue: number; unclaimed: number; callsThisWeek: number; nextCallDate: string | null };
  pipeline: Record<'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Won' | 'Lost', number>;
  upcoming: { id: string; date: string; start: string; mode: string; founder: string; lead: string; leadId: string }[];
  callsBookedThisWeek: number;
  lastWon: string;
  totals: { leads: number; contacted: number; won: number; lost: number; winRate: number | null };
  places: PlacesUsage;
  commission: { userId: string; name: string; earned: number; paid: number; pending: number; contacted: number; qualified: number; won: number }[];
  milestone: { name: string; target: number; stillNeeded: number; expectedAfterPending: number; sharePerFounder: number; percent: number; fullyFunded: boolean } | null;
}

const go = (path: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(path);
};

const PIPE: { key: keyof Founder['pipeline']; color: string }[] = [
  { key: 'New', color: 'bg-fg-3' },
  { key: 'Contacted', color: 'bg-warn' },
  { key: 'Qualified', color: 'bg-info' },
  { key: 'Proposal', color: 'bg-violet' },
  { key: 'Won', color: 'bg-good' },
  { key: 'Lost', color: 'bg-bad' },
];

const to12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

function greeting() {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Tile({ count, text, action, href, first }: { count: number; text: string; action: string; href: string; first?: boolean }) {
  return (
    <a href={href} onClick={go(href)} className={cx('block rounded-2xl border p-5 transition-colors', first ? 'border-brand/70 bg-bg-3/40' : 'border-transparent bg-bg-3 hover:border-line-2')}>
      <p className="text-3xl font-medium tabular-nums">{count}</p>
      <p className="mt-2 text-sm text-fg-2">{text}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
        {action} <ArrowRight className="h-3.5 w-3.5" />
      </p>
    </a>
  );
}

const nextMonthFirst = () => {
  const [y, m] = istDate().split('-').map(Number);
  return formatDate(`${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}-01`).slice(0, 6);
};

export default function Home({ user }: { user: TeamUser }) {
  const state = useApi<Founder>('/dashboard/founder');
  const dateLine = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  return (
    <div>
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">{dateLine}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.035em] sm:text-[2.6rem]">
            {greeting()}, <span className="font-serif font-normal italic tracking-normal text-brand">{user.name.split(' ')[0]}</span>
          </h1>
          <p className="mt-2 text-fg-2">Here's what needs you today. Everything else can wait.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/team/leads?add=1')}>
            Add lead
          </Button>
          <Button onClick={() => navigate('/team/find')}>Find clients</Button>
        </div>
      </div>

      <Async state={state} label="Loading your day…">
        {(d) => {
          const tiles = [
            d.needs.followUpsToday > 0 && { count: d.needs.followUpsToday, text: `follow-up${d.needs.followUpsToday === 1 ? '' : 's'} due today`, action: d.needs.followUpsToday === 1 ? 'Open lead' : 'Open leads', href: d.needs.followUpsToday === 1 && d.needs.firstFollowUpLeadId ? `/team/leads/${d.needs.firstFollowUpLeadId}` : '/team/leads?view=due' },
            d.needs.overdue > 0 && { count: d.needs.overdue, text: `follow-up${d.needs.overdue === 1 ? '' : 's'} overdue`, action: 'See leads', href: '/team/leads?view=due' },
            d.needs.unclaimed > 0 && { count: d.needs.unclaimed, text: `unclaimed lead${d.needs.unclaimed === 1 ? '' : 's'} waiting`, action: d.commission[0] ? `Assign to ${d.commission[0].name.split(' ')[0]}` : 'Assign', href: '/team/leads?view=unclaimed' },
            d.needs.callsThisWeek > 0 && { count: d.needs.callsThisWeek, text: `discovery call${d.needs.callsThisWeek === 1 ? '' : 's'}${d.needs.nextCallDate ? ` from ${formatDate(d.needs.nextCallDate).slice(0, 6)}` : ''}`, action: 'See calendar', href: '/team/calendar' },
          ].filter(Boolean) as { count: number; text: string; action: string; href: string }[];
          const pipeTotal = PIPE.reduce((n, p) => n + d.pipeline[p.key], 0);
          const placesPct = d.places.cap ? (d.places.used / d.places.cap) * 100 : 0;

          return (
            <div className="space-y-5">
              <Card>
                <CardHeader title="Needs you today" />
                {tiles.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-bg-3 p-5 text-sm text-fg-2">
                    <CheckCircle2 className="h-5 w-5 text-good" /> All caught up. Nothing needs you right now.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {tiles.slice(0, 3).map((t, i) => (
                      <Tile key={t.text} {...t} first={i === 0} />
                    ))}
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Leads" value={d.totals.leads} hint={`${d.totals.contacted} contacted so far`} />
                <Stat label="Calls booked" value={d.callsBookedThisWeek} hint="this week" />
                <Stat label="Clients won" value={d.totals.won} hint={d.lastWon && d.totals.won ? d.lastWon : 'none yet'} />
                <Stat label="Win rate" value={d.totals.winRate === null ? '—' : `${d.totals.winRate}%`} hint={`${d.totals.won} won · ${d.totals.lost} lost`} />
              </div>

              <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
                <div className="flex flex-col gap-5">
                  <Card>
                    <CardHeader title="Pipeline" action={<a href="/team/leads" onClick={go('/team/leads')} className="inline-flex min-h-11 items-center gap-1 text-sm text-brand">All leads <ArrowRight className="h-3.5 w-3.5" /></a>} />
                    {pipeTotal === 0 ? (
                      <p className="text-sm text-fg-3">No leads yet. Add one or find clients on Google.</p>
                    ) : (
                      <div className="flex h-2 gap-1 overflow-hidden rounded-full" role="img" aria-label={PIPE.map((p) => `${p.key} ${d.pipeline[p.key]}`).join(', ')}>
                        {PIPE.filter((p) => d.pipeline[p.key] > 0).map((p) => (
                          <div key={p.key} className={cx('h-2 rounded-full', p.color)} style={{ width: `${(d.pipeline[p.key] / pipeTotal) * 100}%` }} />
                        ))}
                      </div>
                    )}
                    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {PIPE.map((p) => (
                        <li key={p.key} className="flex items-center gap-2 text-fg-2">
                          <span className={cx('h-2 w-2 rounded-full', p.color)} /> {p.key === 'Proposal' ? 'Proposal' : p.key} <span className="tabular-nums text-fg">{d.pipeline[p.key]}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <Card>
                    <CardHeader title="Upcoming calls" action={<a href="/team/calendar" onClick={go('/team/calendar')} className="inline-flex min-h-11 items-center gap-1 text-sm text-brand">Calendar <ArrowRight className="h-3.5 w-3.5" /></a>} />
                    {d.upcoming.length === 0 ? (
                      <p className="text-sm text-fg-3">Nothing booked this week.</p>
                    ) : (
                      <ul className="space-y-2">
                        {d.upcoming.slice(0, 4).map((b) => (
                          <li key={b.id}>
                            <a href={`/team/leads/${b.leadId}`} onClick={go(`/team/leads/${b.leadId}`)} className="flex items-center gap-4 rounded-2xl bg-bg-3 p-3 hover:bg-bg-3/70">
                              <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-bg">
                                <span className="text-[10px] uppercase text-brand">{new Date(`${b.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span>
                                <span className="text-lg font-medium leading-none">{b.date.slice(8)}</span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-fg">{b.lead} · discovery call</span>
                                <span className="block text-xs text-fg-3">{to12(b.start)} · with {b.founder.split(' ')[0]} · {b.mode}</span>
                              </span>
                              <span className="hidden text-sm text-brand sm:inline">Details</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {d.upcoming.length > 0 && d.upcoming.length <= 1 && <p className="mt-3 text-xs text-fg-3">Nothing else booked this week.</p>}
                  </Card>

                  <Card className="flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-base font-medium">Google Places</h2>
                      <span className="tabular-nums text-sm">{d.places.used} / {d.places.cap.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="mt-3">
                      <ProgressBar percent={placesPct} tone="good" label="Google Places usage" />
                    </div>
                    <p className="mt-2 text-xs text-fg-3">
                      {d.places.searches} search{d.places.searches === 1 ? '' : 'es'} · {d.places.lookups} contact lookup{d.places.lookups === 1 ? '' : 's'} this month · resets {nextMonthFirst()}
                      {d.places.paused && ' · paused'}
                    </p>
                  </Card>
                </div>

                <div className="flex flex-col gap-5">
                  <Card className={cx(d.commission.length === 0 && 'flex-1')}>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">Milestone</p>
                    {d.milestone ? (
                      <>
                        <h2 className="mt-3 text-xl font-medium">
                          Register <span className="font-serif italic text-brand">Azumco</span>
                        </h2>
                        <p className="mt-3 text-3xl font-medium tabular-nums">
                          {formatInr(d.milestone.target - d.milestone.stillNeeded)} <span className="text-sm text-fg-3">of {formatInr(d.milestone.target)}</span>
                        </p>
                        <div className="mt-3">
                          <ProgressBar percent={d.milestone.percent} label="Registration funded" />
                        </div>
                        {d.milestone.fullyFunded ? (
                          <p className="mt-4 flex items-center gap-2 text-sm text-good">
                            <CheckCircle2 className="h-4 w-4" /> Fully funded
                          </p>
                        ) : (
                          <dl className="mt-4 space-y-2.5 text-sm">
                            <div className="flex justify-between"><dt className="text-fg-2">Still needed</dt><dd className="tabular-nums text-brand">{formatInr(d.milestone.stillNeeded)}</dd></div>
                            <div className="flex justify-between"><dt className="text-fg-2">After pending income</dt><dd className="tabular-nums">{formatInr(d.milestone.expectedAfterPending)}</dd></div>
                            <div className="flex justify-between"><dt className="text-fg-2">Each founder (÷3)</dt><dd className="tabular-nums">{formatInr(d.milestone.sharePerFounder)}</dd></div>
                          </dl>
                        )}
                        <a href="/team/money" onClick={go('/team/money')} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
                          Add contribution <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-fg-3">No milestone set up.</p>
                    )}
                  </Card>
                  {d.commission.map((c, i) => (
                    <Card key={c.userId} className={cx(i === d.commission.length - 1 && 'flex-1')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.name} />
                          <div>
                            <p className="text-fg">{c.name}</p>
                            <p className="text-xs text-fg-3">
                              {c.contacted} contacted · {c.qualified} qualified · {c.won} won
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-medium tabular-nums">{formatInr(c.pending)}</p>
                          <p className="text-xs text-fg-3">to pay</p>
                        </div>
                      </div>
                      {c.pending > 0 && (
                        <a href="/team/leads?view=won" onClick={go('/team/leads?view=won')} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
                          Mark commission paid <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </Card>
                  ))}
                </div>
              </div>

              <a href="/team/reports" onClick={go('/team/reports')} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
                Detailed reports — by source, rating and who added <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        }}
      </Async>
    </div>
  );
}
