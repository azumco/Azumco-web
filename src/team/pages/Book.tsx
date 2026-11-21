// Book a discovery call. The picker fills the left; from 1100px a 360px
// sticky "You're booking" summary sits on the right (below that, the details
// follow the picker). The day strip always shows one week (7 days) with
// prev/next arrows. Founder names and colours come from the user records.

import { useMemo, useState } from 'react';
import { CalendarX, ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { addDays, weekday } from '../../../shared/slots';
import { formatDate, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Avatar, Button, ChipGroup, ChoiceChip, Empty, ErrorText, Field, Modal, SPLIT_SUMMARY, Segmented, StepLabel, colourTone, cx } from '../ui';
import { firstName, isFounder, type LeadsResponse, type Slot, type TeamUser } from '../types';
import { shortLabel } from './LeadDetail';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODES = [{ value: 'Zoho Cliq', label: 'Zoho Cliq' }, { value: 'Phone call', label: 'Phone' }, { value: 'In person', label: 'In person' }] as const;
const DAYS_AHEAD = 14; // what /slots returns
const DOT: Record<string, string> = { brand: 'bg-brand', info: 'bg-info', good: 'bg-good', violet: 'bg-violet', warn: 'bg-warn', bad: 'bg-bad' };
const fmt = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const whenLabel = (s: Slot) => `${DAY[weekday(s.date)]} ${formatDate(s.date).slice(0, 6)} · ${fmt(s.start)}`;
const monthLabel = (d: string, short: boolean) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });

interface Founder { id: string; name: string; calendarColor: string }

export default function Book({ user }: { user: TeamUser }) {
  const [leadId, setLeadId] = useState(new URLSearchParams(window.location.search).get('lead') ?? '');
  const [pickingLead, setPickingLead] = useState(false);
  const [founder, setFounder] = useState('any');
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState('');
  const [time, setTime] = useState<Slot | null>(null);
  const [form, setForm] = useState({ clientName: '', phone: '', mode: 'Zoho Cliq' as (typeof MODES)[number]['value'], link: '', notes: '' });
  const [done, setDone] = useState('');
  const today = istDate();
  const leads = useApi<LeadsResponse>('/leads');
  const slots = useApi<{ slots: Slot[]; founders: Founder[] }>(`/slots?from=${today}&days=${DAYS_AHEAD}`);
  const { busy, error, setError, run } = useAction();

  const open = (leads.data?.leads ?? []).filter((l) => l.status !== 'Won' && l.status !== 'Lost');
  const lead = open.find((l) => l.id === leadId);
  const founders = slots.data?.founders ?? [];
  const founderOf = (id: string) => founders.find((f) => f.id === id);
  const nameOf = (id: string) => firstName(founderOf(id)?.name ?? '');

  // "Any founder": a time is open if at least one founder is free then.
  const visible = useMemo(() => {
    const list = slots.data?.slots ?? [];
    if (founder !== 'any') return list.filter((s) => s.founderId === founder);
    const by = new Map<string, Slot>();
    for (const s of list) {
      const k = `${s.date}|${s.start}`;
      const cur = by.get(k);
      if (!cur || (cur.booked && !s.booked)) by.set(k, s);
    }
    return [...by.values()].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }, [slots.data, founder]);
  const freeDays = new Set(visible.filter((s) => !s.booked).map((s) => s.date));
  const weeks = Math.ceil(DAYS_AHEAD / 7);
  const strip = Array.from({ length: 7 }, (_, i) => addDays(today, week * 7 + i));
  const firstFree = [...freeDays].sort()[0] ?? '';
  const activeDay = day && freeDays.has(day) ? day : strip.find((d) => freeDays.has(d)) ?? '';
  const times = visible.filter((s) => s.date === activeDay);
  const taken = times.filter((s) => s.booked).map((s) => fmt(s.start));
  const freeWith = [...new Set((slots.data?.slots ?? []).filter((s) => s.date === activeDay && !s.booked).map((s) => nameOf(s.founderId)))];
  const foundersOn = (d: string) => [...new Set((slots.data?.slots ?? []).filter((s) => s.date === d && !s.booked && (founder === 'any' || s.founderId === founder)).map((s) => s.founderId))];
  const withId = time ? (founder === 'any' ? time.founderId : founder) : founder !== 'any' ? founder : '';
  const notified = withId ? `${nameOf(withId)} is notified right away.` : 'The founder is notified right away.';

  const book = async () => {
    if (!lead || !time) return setError('Choose a lead and a time.');
    const r = await run(() => api<{ booking: { founderId: string; date: string; start: string } }>('POST', '/bookings', { leadId, founderId: founder === 'any' ? 'any' : time.founderId, date: time.date, start: time.start, ...form }));
    void slots.reload();
    if (r) {
      setDone(`Booked with ${nameOf(r.booking.founderId)} on ${formatDate(r.booking.date)} at ${fmt(r.booking.start)}. ${nameOf(r.booking.founderId)} has been notified.`);
      setTime(null);
    }
  };

  const fields = (
    <>
      <Field label="Client name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
      <Field label="Their phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      {form.mode === 'Zoho Cliq' && <Field label="Zoho Cliq link" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />}
    </>
  );
  const bookButton = (
    <Button busy={busy} disabled={!lead || !time || !form.clientName} className="w-full" onClick={book}>
      {time ? 'Book this call' : lead ? 'Pick a time' : 'Choose a lead first'}
    </Button>
  );

  return (
    <div>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
        Book a <span className="font-serif font-normal italic tracking-normal text-brand">call</span>
      </h1>
      <p className="mt-1 text-fg-2">Pick a free slot. The founder is notified straight away.</p>
      {done && <p role="status" className="mt-4 rounded-2xl border border-good/40 bg-good/10 px-4 py-3 text-sm">{done}</p>}

      <Async state={slots} label="Loading free slots…">
        {() => (
          <div className={cx(SPLIT_SUMMARY, 'mt-6')}>
            <section className="min-w-0 space-y-6 md:rounded-3xl md:border md:border-line md:bg-bg-2 md:p-7">
              <button type="button" onClick={() => setPickingLead(true)} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-bg-2 p-4 text-left hover:border-line-2 md:border-0 md:bg-bg-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg text-fg-3"><Store className="h-4.5 w-4.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-fg-3">For</span>
                  <span className="block truncate font-medium">{lead ? shortLabel(lead) : 'Choose a lead'}</span>
                </span>
                <span className="text-sm font-medium text-brand">{lead ? 'Change' : 'Choose'}</span>
              </button>

              {(slots.data?.slots ?? []).length === 0 ? (
                <Empty title="No free slots in the next two weeks">{isFounder(user) ? 'Add your free slots in the Calendar.' : 'Ask a founder to add free slots.'}</Empty>
              ) : (
                <>
                  <ChipGroup step={1} label="With" options={[{ value: 'any', label: 'Any founder' }, ...founders.map((f) => ({ value: f.id, label: firstName(f.name) }))]} value={founder} onChange={(v) => { setFounder(v || 'any'); setTime(null); }} required />

                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <StepLabel step={2}>Day</StepLabel>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-fg-2"><span className="sm:hidden">{monthLabel(strip[0], true)}</span><span className="hidden sm:inline">{monthLabel(strip[0], false)}</span></span>
                        <button type="button" aria-label="Previous week" disabled={week === 0} onClick={() => { setWeek(week - 1); setDay(''); setTime(null); }} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg disabled:opacity-30">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button type="button" aria-label="Next week" disabled={week >= weeks - 1} onClick={() => { setWeek(week + 1); setDay(''); setTime(null); }} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg disabled:opacity-30">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                      {strip.map((d) => {
                        const free = freeDays.has(d);
                        const on = d === activeDay;
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            disabled={!free}
                            aria-label={`${DAY[weekday(d)]} ${formatDate(d)}${free ? '' : ', no free times'}`}
                            onClick={() => { setDay(d); setTime(null); }}
                            className={cx('flex min-h-16 min-w-0 flex-col items-center justify-center rounded-2xl border py-2 sm:min-h-20', on ? 'border-brand bg-brand/10 text-brand' : free ? 'border-line-2 bg-bg-2 text-fg hover:border-fg/40' : 'border-line bg-transparent text-fg-3 opacity-50')}
                          >
                            <span className="text-[10px] uppercase tracking-[0.12em] opacity-70">{DAY[weekday(d)]}</span>
                            <span className="text-lg font-medium tabular-nums sm:text-xl">{d.slice(8)}</span>
                            <span className="mt-1 flex h-1.5 gap-0.5">
                              {foundersOn(d).slice(0, 3).map((id) => <span key={id} className={cx('h-1.5 w-1.5 rounded-full', DOT[founderOf(id)?.calendarColor ?? ''] ?? 'bg-fg-3')} />)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!strip.some((d) => freeDays.has(d)) && (
                      <p className="mt-3 flex items-center gap-2 text-sm text-fg-3">
                        <CalendarX className="h-4 w-4" />
                        {firstFree ? <>No free times this week. <button type="button" className="font-medium text-brand" onClick={() => setWeek(Math.floor(Math.max(0, (Date.parse(firstFree) - Date.parse(today)) / 86_400_000) / 7))}>Jump to {DAY[weekday(firstFree)]} {formatDate(firstFree).slice(0, 6)}</button></> : 'No free times for this founder.'}
                      </p>
                    )}
                  </div>

                  {activeDay && (
                    <div>
                      <div className="mb-3"><StepLabel step={3}>Free times · {DAY[weekday(activeDay)]} {activeDay.slice(8)}</StepLabel></div>
                      <div className="flex flex-wrap gap-2">
                        {times.map((s) => (
                          <ChoiceChip key={`${s.founderId}${s.start}`} on={time?.start === s.start && time?.date === s.date} disabled={s.booked || !lead} onClick={() => { setTime(s); setForm((f) => ({ ...f, clientName: f.clientName || lead?.contactPerson || lead?.businessName || '' })); }} className={s.booked ? 'line-through' : ''}>
                            {fmt(s.start)}
                          </ChoiceChip>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-fg-3">
                        {freeWith.length ? `${freeWith.join(', ')} ${freeWith.length === 1 ? 'is' : 'are'} free.` : ''}
                        {taken.length ? ` ${taken.join(', ')} ${taken.length === 1 ? 'is' : 'are'} already taken.` : ''}
                        {!lead && ' Choose a lead first.'}
                      </p>
                    </div>
                  )}

                  {/* Below 1100px the details follow the picker. */}
                  <div className="space-y-5 min-[1100px]:hidden">
                    <Segmented step={4} label="How" options={MODES} value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} />
                    {fields}
                    <ErrorText>{error}</ErrorText>
                    <div className="sticky bottom-16 z-30 rounded-3xl border border-line bg-bg-2 p-4 shadow-lg shadow-black/40 md:static md:shadow-none">
                      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{time ? whenLabel(time) : 'No time picked yet'}</span>
                        {withId && <span className="truncate text-fg-2">with {nameOf(withId)}</span>}
                      </div>
                      {bookButton}
                    </div>
                  </div>
                </>
              )}
            </section>

            <aside className="hidden rounded-3xl border border-line bg-bg-2 p-7 min-[1100px]:sticky min-[1100px]:top-8 min-[1100px]:block">
              <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">You're booking</p>
              <p className="mt-3 truncate text-xl font-medium">{lead ? shortLabel(lead) : 'Choose a lead'}</p>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-fg-2">When</dt><dd className="text-right font-medium">{time ? whenLabel(time) : '—'}</dd></div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-fg-2">With</dt>
                  <dd className="flex min-w-0 items-center gap-2 font-medium">
                    {withId ? <><Avatar name={founderOf(withId)?.name ?? ''} tone={colourTone(founderOf(withId)?.calendarColor)} /> <span className="truncate">{nameOf(withId)}</span></> : 'Any founder'}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 space-y-5">
                <Segmented label="How" options={MODES} value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} />
                {fields}
                <ErrorText>{error}</ErrorText>
                {bookButton}
                <p className="text-xs text-fg-3">{notified}</p>
              </div>
            </aside>
          </div>
        )}
      </Async>

      <Modal title="Which" accent="lead?" open={pickingLead} onClose={() => setPickingLead(false)}>
        <Async state={leads}>
          {() =>
            open.length === 0 ? (
              <Empty title="No open leads">Leads assigned to you show up here.</Empty>
            ) : (
              <ul className="space-y-2">
                {open.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => { setLeadId(l.id); setPickingLead(false); setTime(null); }} className={cx('flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 text-left', l.id === leadId ? 'border-brand text-brand' : 'border-line text-fg')}>
                      <span className="truncate">{shortLabel(l)}</span>
                      <span className="shrink-0 text-xs text-fg-3">{l.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
      </Modal>
    </div>
  );
}
