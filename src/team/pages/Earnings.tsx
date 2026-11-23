// Team member earnings: their own numbers only. Rates come from Settings.

import { Clock } from 'lucide-react';
import { formatDate, formatInr } from '../../../shared/time';
import { useApi } from '../hooks';
import { Async, SPLIT_SUMMARY, cx } from '../ui';

interface Me {
  stats: { contacted: number; booked: number; qualified: number; won: number };
  earnings: { earned: number; paid: number; pending: number };
  lines: { kind: 'qualified' | 'won'; label: string; detail: string; amount: number; date: string }[];
  rates: { qualifiedFee: number; oneTimePct: number; monthlyPct: number };
}

export default function Earnings() {
  const state = useApi<Me>('/dashboard/me');
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return (
    <div>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
        Your <span className="font-serif font-normal italic tracking-normal text-brand">earnings</span>
      </h1>
      <p className="mt-1 text-fg-2">{month}</p>
      <Async state={state} label="Loading earnings…">
        {(d) => (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3">
              <div className="col-span-3 rounded-3xl border border-brand/50 bg-brand/10 p-6 md:col-span-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">To be paid</p>
                <p className="mt-2 text-5xl font-medium tracking-[-0.03em] tabular-nums md:text-4xl">{formatInr(d.earnings.pending)}</p>
                <p className="mt-2 text-sm text-fg-2">after the client pays</p>
              </div>
              {[
                ['Paid so far', formatInr(d.earnings.paid), 'to you', 'paid'],
                ['Qualified leads', d.stats.qualified, 'calls that happened', 'qualified'],
                ['Clients won', d.stats.won, 'signed and paid', 'won'],
              ].map(([label, value, hint, short]) => (
                <div key={label as string} className="min-w-0 rounded-2xl border border-line bg-bg-2 p-3 md:rounded-3xl md:p-6">
                  <p className="hidden text-[11px] uppercase tracking-[0.18em] text-fg-3 md:block">{label}</p>
                  <p className="truncate text-xl font-medium tabular-nums md:mt-2 md:text-3xl">{value}</p>
                  <p className="text-xs text-fg-3"><span className="md:hidden">{short}</span><span className="hidden md:inline">{hint}</span></p>
                </div>
              ))}
            </div>

            <div className={SPLIT_SUMMARY}>
              <section className="min-w-0 rounded-3xl border border-line bg-bg-2 p-5 sm:p-7">
                <h2 className="text-base font-medium">How it adds up</h2>
                {d.lines.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-bg-3/60 px-4 py-4 text-sm text-fg-2">Nothing earned yet. A fee lands when a discovery call you booked actually happens.</p>
                ) : (
                  <ul className="mt-4 border-t border-line">
                    {d.lines.map((l, i) => (
                      <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 border-b border-line py-4 sm:grid-cols-[80px_minmax(0,1fr)_auto]">
                        <span className="hidden text-sm text-fg-2 sm:block">{formatDate(l.date).slice(0, 6)}</span>
                        <span className="min-w-0">
                          <span className="block text-fg">{l.label}</span>
                          <span className="block truncate text-xs text-fg-3"><span className="sm:hidden">{formatDate(l.date).slice(0, 6)} · </span>{l.detail}</span>
                        </span>
                        <span className="tabular-nums font-medium">{formatInr(l.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-4">
                  <span className="font-medium">Total to be paid</span>
                  <span className="text-xl font-medium tabular-nums text-brand">{formatInr(d.earnings.pending)}</span>
                </div>
              </section>
              <section className="rounded-3xl border border-line bg-bg-2 p-5 sm:p-7">
                <h2 className="text-base font-medium">How you earn</h2>
                <ul className="mt-4 space-y-3 text-sm">
                  {[
                    [formatInr(d.rates.qualifiedFee), 'when a discovery call you booked actually happens'],
                    [`${d.rates.oneTimePct}%`, 'of the project when a client signs and pays'],
                    [`${d.rates.monthlyPct}%`, 'of the first month when a client signs a monthly plan'],
                  ].map(([v, t]) => (
                    <li key={t} className="flex items-center gap-3">
                      <span className={cx('min-w-16 rounded-xl bg-brand/12 px-2.5 py-2 text-center font-medium text-brand')}>{v}</span>
                      <span className="text-fg-2">{t}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 flex items-start gap-3 rounded-2xl bg-bg-3/70 px-4 py-3 text-xs text-fg-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-3" /> Paid after the client has paid Azumco.
                </p>
              </section>
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}
