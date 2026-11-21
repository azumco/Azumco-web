// Founders: manage your own availability (week view) and the team's bookings.
// IST throughout.

import { useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Plus, Repeat, Trash2 } from 'lucide-react';
import { formatDate, fromIst, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Badge, Button, Card, Empty, ErrorText, Field, Modal, PageHeader, Select, Toggle } from '../ui';
import type { Booking, Slot, TeamUser } from '../types';

const DAY = 86_400_000;
const addDays = (d: string, n: number) => istDate(new Date(fromIst(d).getTime() + n * DAY));
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const mondayOf = (d: string) => addDays(d, -((weekday(d) + 6) % 7));
const dayName = (d: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(d)];

interface Availability {
  id: string;
  date: string;
  start: string;
  end: string;
  slotMinutes: string;
  repeatWeekly: string;
  repeatUntil: string;
}

function AddAvailability({ open, onClose, onSaved, defaultDate }: { open: boolean; onClose: () => void; onSaved: () => void; defaultDate: string }) {
  const [f, setF] = useState({ date: defaultDate, start: '10:00', end: '13:00', slotMinutes: '30', repeatWeekly: false, repeatUntil: '' });
  const { busy, error, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api('POST', '/availability', { ...f, slotMinutes: Number(f.slotMinutes) }));
    if (ok) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title="Add available time" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <div className="grid grid-cols-2 gap-5">
          <Field label="From (IST)" type="time" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <Field label="To (IST)" type="time" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </div>
        <Select label="Slot length" value={f.slotMinutes} onChange={(e) => setF({ ...f, slotMinutes: e.target.value })} options={[{ value: '20', label: '20 minutes' }, { value: '30', label: '30 minutes' }]} />
        <Toggle label="Repeat every week" checked={f.repeatWeekly} onChange={(v) => setF({ ...f, repeatWeekly: v })} />
        {f.repeatWeekly && <Field label="Repeat until (optional)" type="date" value={f.repeatUntil} onChange={(e) => setF({ ...f, repeatUntil: e.target.value })} />}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Save
        </Button>
      </form>
    </Modal>
  );
}

function BookingRow({ b, onChange }: { b: Booking; onChange: () => void }) {
  const [moving, setMoving] = useState(false);
  const [to, setTo] = useState({ date: b.date, start: b.start });
  const { busy, error, run } = useAction();
  const act = (fn: () => Promise<unknown>) => run(fn).then((r) => r !== undefined && onChange());
  const past = fromIst(b.date, b.end).getTime() < Date.now();
  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{b.clientName}</p>
          <p className="text-sm text-fg-2">
            {dayName(b.date)} {formatDate(b.date)} · {b.start}–{b.end} IST · {b.founderName}
          </p>
          <p className="mt-1 text-xs text-fg-3">
            {b.mode}
            {b.phone && ` · ${b.phone}`}
            {b.bookedByName && ` · booked by ${b.bookedByName}`}
          </p>
          {b.link && (
            <a href={b.link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex min-h-11 items-center break-all text-sm text-brand">
              Meeting link
            </a>
          )}
          {b.notes && <p className="mt-1 text-sm text-fg-2">{b.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {b.status === 'booked' ? (
            <>
              {past ? (
                <>
                  <span className="self-center text-xs text-fg-3">Call happened?</span>
                  <Button size="sm" busy={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/call-happened`, { happened: true }))}>
                    Yes
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/call-happened`, { happened: false }))}>
                    No
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setMoving(true)}>
                    Reschedule
                  </Button>
                  <Button size="sm" variant="danger" busy={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/cancel`))}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="quiet" disabled={busy} onClick={() => act(() => api('POST', `/bookings/${b.id}/call-happened`, { happened: true }))}>
                    Mark happened
                  </Button>
                </>
              )}
            </>
          ) : (
            <Badge tone={b.status === 'completed' ? 'ok' : 'muted'}>{b.status === 'completed' ? 'Call happened' : b.status === 'no_show' ? 'Did not happen' : 'Cancelled'}</Badge>
          )}
        </div>
      </div>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
      <Modal title="Reschedule" open={moving} onClose={() => setMoving(false)}>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await run(() => api('POST', `/bookings/${b.id}/reschedule`, to))) !== undefined) {
              setMoving(false);
              onChange();
            }
          }}
        >
          <p className="text-sm text-fg-2">Pick a time inside {b.founderName}'s available hours.</p>
          <div className="grid grid-cols-2 gap-5">
            <Field label="Date" type="date" required value={to.date} onChange={(e) => setTo({ ...to, date: e.target.value })} />
            <Field label="Start (IST)" type="time" required value={to.start} onChange={(e) => setTo({ ...to, start: e.target.value })} />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} className="w-full">
            Move booking
          </Button>
        </form>
      </Modal>
    </Card>
  );
}

export default function Calendar({ user }: { user: TeamUser }) {
  const today = istDate();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [adding, setAdding] = useState(false);
  const slots = useApi<{ slots: Slot[] }>(`/slots?from=${weekStart}&days=7&founderId=${user.id}`);
  const rules = useApi<{ availability: Availability[] }>('/availability');
  const bookings = useApi<{ bookings: Booking[] }>('/bookings');
  const remove = useAction();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const reloadAll = () => {
    void slots.reload();
    void rules.reload();
    void bookings.reload();
  };

  const upcoming = (bookings.data?.bookings ?? [])
    .filter((b) => b.status === 'booked' || b.date >= addDays(today, -7))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const needsAnswer = upcoming.filter((b) => b.status === 'booked' && fromIst(b.date, b.end).getTime() < Date.now());

  return (
    <div>
      <PageHeader eyebrow="Calendar" title="Availability &" accent="calls">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add time
        </Button>
      </PageHeader>

      <section>
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm text-fg-2">
            Your slots · {formatDate(days[0])} – {formatDate(days[6])}
          </p>
          <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Async state={slots}>
          {({ slots: list }) => (
            <div className="grid gap-2 lg:grid-cols-7 lg:gap-3">
              {days.map((d) => {
                const daySlots = list.filter((s) => s.date === d);
                return (
                  <div
                    key={d}
                    className={`flex items-center gap-4 rounded-3xl border px-4 py-3 lg:block lg:p-3 ${d === today ? 'border-brand/50 bg-bg-2' : 'border-line bg-bg-2'}`}
                  >
                    <p className="w-14 shrink-0 text-xs uppercase tracking-[0.18em] text-fg-3 lg:w-auto">
                      {dayName(d)} <span className="text-fg-2">{d.slice(8)}</span>
                    </p>
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-fg-3 lg:mt-3">No slots</p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5 lg:mt-3 lg:flex-col">
                        {daySlots.map((s) => (
                          <li key={s.start} className={`rounded-full border px-2.5 py-1 text-center text-xs tabular-nums ${s.booked ? 'border-brand bg-brand text-bg' : 'border-line-2 text-fg-2'}`}>
                            {s.start}
                            <span className="sr-only">{s.booked ? ' booked' : ' open'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Async>
        <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-fg-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-line-2" /> Open</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Booked</span>
          <span>Past times are hidden.</span>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">Your available hours</h2>
        <Async state={rules}>
          {({ availability }) =>
            availability.length === 0 ? (
              <Empty title="No available hours yet">Add the times you can take discovery calls.</Empty>
            ) : (
              <div className="space-y-2">
                {availability
                  .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
                  .map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-bg-2 px-5 py-3">
                      <div className="text-sm">
                        <p className="text-fg">
                          {a.repeatWeekly === 'TRUE' ? `Every ${dayName(a.date)} from ${formatDate(a.date)}` : `${dayName(a.date)} ${formatDate(a.date)}`}
                        </p>
                        <p className="text-xs text-fg-3">
                          {a.start}–{a.end} IST · {a.slotMinutes}-minute slots
                          {a.repeatWeekly === 'TRUE' && a.repeatUntil && ` · until ${formatDate(a.repeatUntil)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.repeatWeekly === 'TRUE' && <Repeat className="h-4 w-4 text-fg-3" aria-label="Repeats weekly" />}
                        <button
                          type="button"
                          aria-label="Remove"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-3 hover:text-brand-2"
                          onClick={async () => (await remove.run(() => api('DELETE', `/availability/${a.id}`))) !== undefined && reloadAll()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )
          }
        </Async>
        <div className="mt-3">
          <ErrorText>{remove.error}</ErrorText>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">
          Discovery calls {needsAnswer.length > 0 && <span className="text-brand">· {needsAnswer.length} need "call happened?"</span>}
        </h2>
        <Async state={bookings}>
          {() =>
            upcoming.length === 0 ? (
              <Empty title="No calls booked">Bookings made by the team will show here.</Empty>
            ) : (
              <div className="space-y-3">
                {upcoming.map((b) => (
                  <BookingRow key={b.id} b={b} onChange={reloadAll} />
                ))}
              </div>
            )
          }
        </Async>
      </section>

      <AddAvailability open={adding} onClose={() => setAdding(false)} onSaved={reloadAll} defaultDate={today} />
    </div>
  );
}
