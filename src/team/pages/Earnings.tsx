// Team member earnings: their own numbers only. Rates come from Settings.

import { formatDate, formatInr } from '../../../shared/time';
import { useApi } from '../hooks';
import { Async, Card } from '../ui';

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
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em]">
        Your <span className="font-serif font-normal italic tracking-normal text-brand">earnings</span>
      </h1>
      <p className="mt-1 text-fg-2">{month}</p>
      <Async state={state} label="Loading earnings…">
        {(d) => (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-4 lg:gap-3">
              <div className="col-span-3 rounded-3xl border border-brand/40 bg-brand/5 p-6 lg:col-span-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">To be paid</p>
                <p className="mt-2 text-5xl font-medium tracking-[-0.03em] tabular-nums lg:text-4xl">{formatInr(d.earnings.pending)}</p>
                <p className="mt-2 text-sm text-fg-2 lg:hidden">Paid so far {formatInr(d.earnings.paid)}</p>
              </div>
              {[
                ['Paid so far', formatInr(d.earnings.paid), 'hidden lg:block'],
                ['Contacted', d.stats.contacted, 'lg:hidden'],
                ['Qualified leads', d.stats.qualified, ''],
                ['Clients won', d.stats.won, ''],
              ].map(([label, value, cls]) => (
                <div key={label as string} className={`rounded-2xl border border-line bg-bg-2 p-3 lg:rounded-3xl lg:p-6 ${cls}`}>
                  <p className="hidden text-[11px] uppercase tracking-[0.18em] text-fg-3 lg:block">{label}</p>
                  <p className="text-xl font-medium tabular-nums lg:mt-2 lg:text-3xl">{value}</p>
                  <p className="text-xs text-fg-3 lg:hidden">{(label as string).toLowerCase().replace(' leads', '').replace('clients ', '')}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
              <Card>
                <h2 className="text-base font-medium">How it adds up</h2>
                {d.lines.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-3">Nothing earned yet. A fee lands when a discovery call you booked happens.</p>
                ) : (
                  <table className="mt-4 w-full text-left text-sm">
                    <thead className="hidden lg:table-header-group">
                      <tr className="text-[11px] uppercase tracking-[0.14em] text-fg-3"><th className="py-2 font-normal">Date</th><th className="py-2 font-normal">What</th><th className="py-2 text-right font-normal">Amount</th></tr>
                    </thead>
                    <tbody>
                      {d.lines.map((l, i) => (
                        <tr key={i} className="border-t border-line first:border-0 lg:first:border-t">
                          <td className="hidden py-3 pr-4 text-fg-2 lg:table-cell">{formatDate(l.date).slice(0, 6)}</td>
                          <td className="py-3">
                            <p className="text-fg">{l.label}</p>
                            <p className="text-xs text-fg-3">{l.detail}</p>
                          </td>
                          <td className="py-3 text-right tabular-nums">{formatInr(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="mt-2 flex justify-between border-t border-line pt-4">
                  <span>Total to be paid</span>
                  <span className="tabular-nums text-brand">{formatInr(d.earnings.pending)}</span>
                </div>
              </Card>
              <Card>
                <h2 className="text-base font-medium">How you earn</h2>
                <ul className="mt-4 space-y-3 text-sm">
                  {[
                    [formatInr(d.rates.qualifiedFee), 'when a discovery call you booked actually happens'],
                    [`${d.rates.oneTimePct}%`, 'of the project when a client signs and pays (one-time)'],
                    [`${d.rates.monthlyPct}%`, 'of the first month when a client signs a monthly plan'],
                  ].map(([v, t]) => (
                    <li key={t} className="flex items-center gap-3">
                      <span className="min-w-16 rounded-xl bg-brand/12 px-2.5 py-2 text-center font-medium text-brand">{v}</span>
                      <span className="text-fg-2">{t}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-fg-3">Paid after the client has paid Azumco.</p>
              </Card>
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}
