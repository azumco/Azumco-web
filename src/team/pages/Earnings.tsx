// Employee: what she's earned and how it adds up. Her own numbers only.

import { formatInr } from '../../../shared/time';
import { useApi } from '../hooks';
import { Async, Card } from '../ui';

interface Me {
  stats: { contacted: number; booked: number; won: number };
  earnings: { earned: number; paid: number; pending: number };
  lines: { kind: 'qualified' | 'won'; label: string; detail: string; amount: number }[];
}

export default function Earnings() {
  const state = useApi<Me>('/dashboard/me');
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em]">
        Your <span className="font-serif font-normal italic tracking-normal text-brand">earnings</span>
      </h1>
      <p className="mt-1 text-fg-2">{month}</p>
      <Async state={state} label="Loading earnings…">
        {(d) => (
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-brand/40 bg-brand/5 p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">To be paid</p>
              <p className="mt-2 text-5xl font-medium tracking-[-0.03em] tabular-nums">{formatInr(d.earnings.pending)}</p>
              <p className="mt-2 text-sm text-fg-2">Paid so far {formatInr(d.earnings.paid)} · earned in total {formatInr(d.earnings.earned)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                [d.stats.contacted, 'contacted'],
                [d.stats.booked, 'booked'],
                [d.stats.won, 'won'],
              ].map(([v, l]) => (
                <div key={l} className="rounded-2xl border border-line bg-bg-2 p-3">
                  <p className="text-xl font-medium tabular-nums">{v}</p>
                  <p className="text-xs text-fg-3">{l}</p>
                </div>
              ))}
            </div>
            <Card>
              <h2 className="text-base font-medium">How it adds up</h2>
              {d.lines.length === 0 ? (
                <p className="mt-3 text-sm text-fg-3">Nothing earned yet. A fee lands when a discovery call happens.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {d.lines.map((l, i) => (
                    <li key={i} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-fg">{l.label}</p>
                        <p className="truncate text-xs text-fg-3">{l.detail}</p>
                      </div>
                      <span className="tabular-nums">{formatInr(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex justify-between border-t border-line pt-4">
                <span>Total</span>
                <span className="tabular-nums text-brand">{formatInr(d.earnings.earned)}</span>
              </div>
            </Card>
            <p className="text-sm text-fg-3">You earn a fee when a discovery call happens, plus a share of the deal when a client signs and pays.</p>
          </div>
        )}
      </Async>
    </div>
  );
}
