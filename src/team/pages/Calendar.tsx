// Founders: this week's free slots (each founder in their own colour, booked
// calls solid), upcoming calls, my free slots, and "Add my free slots".

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Trash2 } from 'lucide-react';
import { addDays, coversDay, planSlots, toMin, weekday, type AvailRule } from '../../../shared/slots';
import { formatDate, fromIst, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, BoxInput, Button, Card, ChipGroup, Empty, ErrorText, Field, Modal, MultiChips, PageTitle, Segmented, Toggle, cx } from '../ui';
import type { Booking, TeamUser } from '../types';

interface RawRule { id: string; founderId: string; date: string; start: string; end: string; slotMinutes: string; repeatWeekly: string; repeatUntil: string }

const toRule = (r: RawRule): AvailRule => ({ founderId: r.founderId, date: r.date, start: r.start, end: r.end, slotMinutes: Number(r.slotMinutes) || 30, repeatWeekly: r.repeatWeekly === 'TRUE', repeatUntil: r.repeatUntil });
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const mondayOf = (d: string) => addDays(d, -((weekday(d) + 6) % 7));

/** "18:00" → "6:00 PM"; short form drops ":00" ("6 PM"). */
function fmt(t: string, short = false) {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return short && m === 0 ? `${hh} ${ap}` : `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}
const range = (a: string, b: string) => {
  const ap = (t: string) => (Number(t.slice(0, 2)) >= 12 ? 'PM' : 'AM');
  return ap(a) === ap(b) ? `${fmt(a, true).replace(/ (AM|PM)$/, '')} – ${fmt(b, true)}` : `${fmt(a, true)} – ${fmt(b, true)}`;
};

// Founder colours from the design: first brand, then info, good, violet.
const PALETTE = [
  { block: 'border-brand/60 bg-brand/10 text-brand', dot: 'bg-brand/30 border-brand' },
  { block: 'border-info/50 bg-info/10 text-info', dot: 'bg-info/30 border-info' },
  { block: 'border-good/50 bg-good/10 text-good', dot: 'bg-good/30 border-good' },
  { block: 'border-violet/50 bg-violet/10 text-violet', dot: 'bg-violet/30 border-violet' },
];

const PRESETS = [
  { value: 'morning', label: 'Morning · 10–1', start: '10:00', end: '13:00' },
  { value: 'afternoon', label: 'Afternoon · 2–5', start: '14:00', end: '17:00' },
  { value: 'evening', label: 'Evening · 6–8', start: '18:00', end: '20:00' },
  { value: 'custom', label: 'Custom', start: '', end: '' },
] as const;

function AddSlots({ open, onClose, onSaved, weekStart, myRules, me }: { open: boolean; onClose: () => void; onSaved: () => void; weekStart: string; myRules: AvailRule[]; me: string }) {
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = istDate();
  const [days, setDays] = useState<string[]>([]);
  const [preset, setPreset] = useState<string>('evening');
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('20:00');
  const [len, setLen] = useState<'20' | '30'>('30');
  const [repeat, setRepeat] = useState(true);
  const { busy, error, run } = useAction();

  const plan = planSlots({ founderId: me, existing: myRules, dates: days, start: from, end: to, slotMinutes: Number(len), nowMs: Date.now() });
  const dayLabel = days.map((d) => DAY_NAMES[weekday(d)]).join(' & ');

  const choosePreset = (v: string) => {
    setPreset(v);
    const p = PRESETS.find((x) => x.value === v);
    if (p && p.start) {
      setFrom(p.start);
      setTo(p.end);
    }
  };

  const submit = async () => {
    const r = await run(() => api<{ created: number }>('POST', '/availability/batch', { dates: days, start: from, end: to, slotMinutes: Number(len), repeatWeekly: repeat }));
    if (r) {
      setDays([]);
      onSaved();
      onClose();
    }
  };

  return (
    <Modal title="Add my" accent="free slots" subtitle="Clients can only be booked into these times." open={open} onClose={onClose} wide>
      <div className="space-y-6">
        <MultiChips
          label="Days"
          options={week.map((d) => ({ value: d, label: d < today ? <span className="line-through">{DAY_NAMES[weekday(d)]}</span> : DAY_NAMES[weekday(d)] }))}
          value={days}
          onChange={(v) => setDays(v.filter((d) => d >= today))}
        />
        <div>
          <ChipGroup label="Time" options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} value={preset} onChange={(v) => choosePreset(v || preset)} required />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <BoxInput label="From" type="time" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} icon={<Clock className="h-4 w-4 text-fg-3" />} />
            <BoxInput label="To" type="time" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} icon={<Clock className="h-4 w-4 text-fg-3" />} />
          </div>
        </div>
        <Segmented label="Each call is" options={[{ value: '20', label: '20 min' }, { value: '30', label: '30 min' }]} value={len} onChange={setLen} />
        <Toggle label="Repeat every week" hint="Until you turn it off" checked={repeat} onChange={setRepeat} />
        <div role="status" aria-live="polite" className={cx('flex items-start gap-3 rounded-2xl border p-4', plan.error ? 'border-line bg-bg-3' : 'border-brand/40 bg-brand/5')}>
          <CalendarDays className={cx('mt-0.5 h-4 w-4 shrink-0', plan.error ? 'text-fg-3' : 'text-brand')} />
          {plan.error ? (
            <p className="text-sm text-fg-2">{plan.error}</p>
          ) : (
            <div>
              <p className="text-sm font-medium text-fg">Adds {plan.total} slot{plan.total === 1 ? '' : 's'} this week</p>
              <p className="text-xs text-fg-2">{dayLabel} · {fmt(from)} – {fmt(to)} · {len} min each{repeat ? ' · every week' : ''}</p>
            </div>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button busy={busy} disabled={Boolean(plan.error)} onClick={submit}>Add {plan.error ? '' : plan.total} slot{plan.total === 1 ? '' : 's'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function BookingDialog({ b, onClose, onChange }: { b: Booking; onClose: () => void; onChange: () => void }) {
  const [to, setTo] = useState({ date: b.date, start: b.start });
  const { busy, error, run } = useAction();
  const act = async (fn: () => Promise<unknown>) => {
    if ((await run(fn)) !== undefined) {
      onChange();
      onClose();
    }
  };
  const past = fromIst(b.date, b.end).getTime() < Date.now();
  return (
    <Modal title={b.clientName} subtitle={`${formatDate(b.date)} · ${fmt(b.start)} IST · with ${b.founderName} · ${b.mode}`} open onClose={onClose}>
      <div className="space-y-5">
        {b.phone && <p className="text-sm text-fg-2">Phone {b.phone}</p>}
        {b.link && <a href={b.link} target="_blank" rel="noreferrer noopener" className="text-sm text-brand">Meeting link</a>}
        {b.notes && <p className="text-sm text-fg-2">{b.notes}</p>}
        <div>
          <p className="mb-2 text-sm font-medium">Did the call happen?</p>
          <div className="flex gap-2">
            <Button size="sm" busy={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/call-happened`, { happened: true }))}>Yes</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/call-happened`, { happened: false }))}>No</Button>
          </div>
        </div>
        {!past && (
          <div className="border-t border-line pt-5">
            <p className="mb-3 text-sm font-medium">Reschedule</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" type="date" value={to.date} onChange={(e) => setTo({ ...to, date: e.target.value })} />
              <Field label="Start (IST)" type="time" value={to.start} onChange={(e) => setTo({ ...to, start: e.target.value })} />
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="secondary" busy={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/reschedule`, to))}>Move call</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/cancel`))}>Cancel call</Button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

export default function Calendar({ user }: { user: TeamUser }) {
  const today = istDate();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<Booking | null>(null);

  const rules = useApi<{ availability: RawRule[] }>('/availability?all=1');
  const bookings = useApi<{ bookings: Booking[] }>('/bookings');
  const slotsMeta = useApi<{ founders: { id: string; name: string }[] }>(`/slots?from=${today}&days=1`);
  const act = useAction();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const founders = slotsMeta.data?.founders ?? [];
  const colour = (id: string) => PALETTE[Math.max(0, founders.findIndex((f) => f.id === id)) % PALETTE.length];
  const nameOf = (id: string) => founders.find((f) => f.id === id)?.name.split(' ')[0] ?? 'Founder';
  const reload = () => {
    void rules.reload();
    void bookings.reload();
  };

  const allRules = rules.data?.availability ?? [];
  const mine = allRules.filter((r) => r.founderId === user.id);
  const active = (bookings.data?.bookings ?? []).filter((b) => b.status === 'booked');
  const upcoming = active.filter((b) => b.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const windowsOn = (d: string) => allRules.filter((r) => coversDay(toRule(r), d));
  const all = days.flatMap((d) => windowsOn(d));
  const minH = Math.min(10, ...all.map((r) => Math.floor(toMin(r.start) / 60)));
  const maxH = Math.max(20, ...all.map((r) => Math.ceil(toMin(r.end) / 60)));
  const HOUR_PX = 54;
  const top = (t: string) => ((toMin(t) - minH * 60) / 60) * HOUR_PX;

  return (
    <div>
      <PageTitle title="This" accent="week" subtitle="Founders add free slots. The caller books client calls into them.">
        <div className="flex items-center rounded-full border border-line-2">
          <button type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} className="inline-flex h-11 w-11 items-center justify-center text-fg-2 hover:text-fg"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-1 text-sm tabular-nums">{formatDate(days[0]).slice(0, 2)} – {formatDate(days[6]).slice(0, 6)}</span>
          <button type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} className="inline-flex h-11 w-11 items-center justify-center text-fg-2 hover:text-fg"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <Button onClick={() => setAdding(true)}>Add my free slots</Button>
      </PageTitle>

      <ul className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-2">
        {founders.map((f) => (
          <li key={f.id} className="flex items-center gap-2"><span className={cx('h-3 w-3 rounded border', colour(f.id).dot)} /> {f.name.split(' ')[0]} free</li>
        ))}
        <li className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-info" /> Booked client call</li>
      </ul>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Async state={rules} label="Loading the week…">
          {() => (
            <>
              {/* Week grid (≥ 768px) */}
              <div className="hidden overflow-hidden rounded-3xl border border-line bg-bg-2 md:block">
                <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line">
                  <div />
                  {days.map((d) => (
                    <div key={d} className={cx('py-3 text-center', d === today && 'text-brand')}>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-fg-3">{DAY_NAMES[weekday(d)]}</p>
                      <p className="text-xl font-medium">{d.slice(8)}</p>
                    </div>
                  ))}
                </div>
                <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: (maxH - minH) * HOUR_PX }}>
                  <div className="relative">
                    {Array.from({ length: maxH - minH }, (_, i) => (
                      <span key={i} className="absolute left-2 text-[10px] text-fg-3" style={{ top: i * HOUR_PX + 4 }}>{fmt(`${String(minH + i).padStart(2, '0')}:00`, true)}</span>
                    ))}
                  </div>
                  {days.map((d) => (
                    <div key={d} className="relative border-l border-line" style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--line) ${HOUR_PX - 1}px, var(--line) ${HOUR_PX}px)` }}>
                      {windowsOn(d).map((r, i, arr) => {
                        const same = arr.filter((x) => x.founderId !== r.founderId && x.start < r.end && r.start < x.end).length;
                        return (
                          <div
                            key={`${r.id}-${i}`}
                            className={cx('absolute overflow-hidden rounded-xl border p-1.5 text-[11px]', colour(r.founderId).block)}
                            style={{ top: top(r.start) + 2, height: Math.max(22, top(r.end) - top(r.start) - 4), left: same ? '50%' : 4, right: 4 }}
                          >
                            <p className="font-medium">{nameOf(r.founderId)}</p>
                            <p className="opacity-80">{range(r.start, r.end)}</p>
                          </div>
                        );
                      })}
                      {active.filter((b) => b.date === d).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setOpen(b)}
                          className="absolute left-1 right-1 z-10 truncate rounded-lg bg-info px-1.5 py-0.5 text-left text-[11px] font-medium text-bg"
                          style={{ top: top(b.start) + 2 }}
                        >
                          {fmt(b.start, true).replace(/ (AM|PM)$/, '')} · {b.clientName}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day list (phones) */}
              <ul className="space-y-2 md:hidden">
                {days.map((d) => {
                  const ws = windowsOn(d);
                  const bs = active.filter((b) => b.date === d);
                  return (
                    <li key={d} className={cx('rounded-3xl border bg-bg-2 p-4', d === today ? 'border-brand/50' : 'border-line')}>
                      <p className="text-xs uppercase tracking-[0.14em] text-fg-3">{DAY_NAMES[weekday(d)]} {d.slice(8)}</p>
                      {ws.length === 0 && bs.length === 0 ? (
                        <p className="mt-2 text-sm text-fg-3">No free slots.</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {ws.map((r, i) => <span key={`${r.id}-${i}`} className={cx('rounded-full border px-3 py-1 text-xs', colour(r.founderId).block)}>{nameOf(r.founderId)} · {range(r.start, r.end)}</span>)}
                          {bs.map((b) => <button key={b.id} type="button" onClick={() => setOpen(b)} className="min-h-9 rounded-full bg-info px-3 text-xs font-medium text-bg">{fmt(b.start, true)} · {b.clientName}</button>)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Async>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-4 text-base font-medium">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-fg-3">No calls booked yet.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => setOpen(b)} className="block w-full rounded-2xl bg-bg-3 p-3 text-left hover:bg-bg-3/70">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-info">{DAY_NAMES[weekday(b.date)]} {formatDate(b.date).slice(0, 6)} · {fmt(b.start)}</p>
                      <p className="mt-1 text-fg">{b.clientName}</p>
                      <p className="text-xs text-fg-3">with {b.founderName.split(' ')[0]} · {b.mode}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-4 text-base font-medium">My free slots</h2>
            {mine.length === 0 ? (
              <Empty title="No free slots yet">Add the times you can take discovery calls.</Empty>
            ) : (
              <ul className="space-y-2">
                {mine.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/5 px-3 py-2.5 text-sm">
                    <Clock className="h-4 w-4 text-brand" />
                    <span className="flex-1">{DAY_NAMES[weekday(r.date)]}{r.repeatWeekly === 'TRUE' ? '' : ` ${formatDate(r.date).slice(0, 6)}`} · {range(r.start, r.end)}</span>
                    {editing && (
                      <button type="button" aria-label="Remove slot" onClick={async () => (await act.run(() => api('DELETE', `/availability/${r.id}`))) !== undefined && reload()} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-3 hover:text-bad">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {mine.length > 0 && (
              <div className="mt-3">
                <Toggle
                  label="Repeat every week"
                  checked={mine.every((r) => r.repeatWeekly === 'TRUE')}
                  onChange={async (v) => {
                    await act.run(async () => {
                      for (const r of mine) await api('PATCH', `/availability/${r.id}`, { repeatWeekly: v });
                    });
                    reload();
                  }}
                />
                <button type="button" onClick={() => setEditing((v) => !v)} className="mt-1 inline-flex min-h-11 items-center text-sm text-brand">{editing ? 'Done' : 'Edit slots →'}</button>
              </div>
            )}
            <ErrorText>{act.error}</ErrorText>
          </Card>
        </div>
      </div>

      <AddSlots open={adding} onClose={() => setAdding(false)} onSaved={reload} weekStart={weekStart} myRules={mine.map(toRule)} me={user.id} />
      {open && <BookingDialog b={open} onClose={() => setOpen(null)} onChange={reload} />}
    </div>
  );
}
