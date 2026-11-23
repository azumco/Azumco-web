// Book a discovery call. The picker fills the left; from 1100px a 360px
// sticky "You're booking" summary sits on the right (below that, the details
// follow the picker). The day strip always shows one week (7 days) with
// prev/next arrows. Founder names and colours come from the user records.

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarX, Check, ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { addDays, weekday } from '../../../shared/slots';
import { formatDate, istDate } from '../../../shared/time';
import { DEFAULT_MEETING_MODE, MEET_BOOKING_HELP, MEET_LINK_ERROR, normalizeMeetLink, type MeetingMode } from '../../../shared/meet';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Avatar, Button, ChipGroup, ChoiceChip, Empty, ErrorText, Field, Modal, SPLIT_SUMMARY, StepLabel, colourTone, cx } from '../ui';
import MeetActions from '../components/MeetActions';
import { firstName, isFounder, type Booking, type LeadsResponse, type Slot, type TeamUser } from '../types';
import { shortLabel } from './LeadDetail';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODES: { value: MeetingMode; label: string }[] = [{ value: 'Google Meet', label: 'Google Meet' }, { value: 'Zoho Cliq', label: 'Zoho Cliq' }, { value: 'Phone call', label: 'Phone' }, { value: 'In person', label: 'In person' }];
const DAYS_AHEAD = 14; // what /slots returns
const DOT: Record<string, string> = { brand: 'bg-brand', info: 'bg-info', good: 'bg-good', violet: 'bg-violet', warn: 'bg-warn', bad: 'bg-bad' };
const fmt = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const whenLabel = (s: Slot) => `${DAY[weekday(s.date)]} ${formatDate(s.date).slice(0, 6)} · ${fmt(s.start)}`;
const monthLabel = (d: string, short: boolean) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });

interface Founder { id: string; name: string; calendarColor: string; meetLink: string }
interface Booked { id: string; founderId: string; date: string; start: string; end: string; mode: string; link: string; clientName: string; phone: string }

export default function Book({ user }: { user: TeamUser }) {
  const [leadId, setLeadId] = useState(new URLSearchParams(window.location.search).get('lead') ?? '');
  const [pickingLead, setPickingLead] = useState(false);
  const [founder, setFounder] = useState('any');
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState('');
  const [time, setTime] = useState<Slot | null>(null);
  const [form, setForm] = useState({ clientName: '', phone: '', mode: DEFAULT_MEETING_MODE as MeetingMode, link: '', meetOverride: '', notes: '' });
  const [done, setDone] = useState('');
  const [booked, setBooked] = useState<Booked | null>(null);
  const [viewing, setViewing] = useState<Booking | null>(null);
  const myBookings = useApi<{ bookings: Booking[] }>('/bookings');
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

  // Google Meet: the link comes from the founder the slot belongs to. With
  // "Any founder", prefer a founder free at that time who has a link saved
  // (the server makes the same choice).
  const meet = form.mode === 'Google Meet';
  const meetFounderId = (() => {
    if (!time) return founder !== 'any' ? founder : '';
    if (founder !== 'any') return founder;
    const free = (slots.data?.slots ?? []).filter((s) => s.date === time.date && s.start === time.start && !s.booked);
    return (free.find((s) => founderOf(s.founderId)?.meetLink) ?? free[0] ?? time).founderId;
  })();
  const founderLink = normalizeMeetLink(founderOf(meetFounderId)?.meetLink) || '';
  // The founder hosts the call, so their own Meet room is used automatically
  // (they are the one who lets the client in). The booker only types a link
  // when the founder has none saved, or chooses "Use a different link".
  const [customLink, setCustomLink] = useState(false);
  const typed = normalizeMeetLink(form.meetOverride);
  const needsTyped = meet && Boolean(meetFounderId) && (customLink || !founderLink);
  const meetBlocked = needsTyped && !typed;
  const host = meetFounderId ? nameOf(meetFounderId) : '';
  const anyFounderHasLink = founders.some((f) => normalizeMeetLink(f.meetLink));

  const book = async () => {
    if (!lead || !time) return setError('Choose a lead and a time.');
    if (meetBlocked) return setError(typed === null ? MEET_LINK_ERROR : `Paste a Google Meet link that ${host} created.`);
    // Empty for Google Meet means "use the founder's saved link" (the server does that).
    const link = meet ? (needsTyped ? typed || '' : '') : form.mode === 'Zoho Cliq' ? form.link : '';
    const { meetOverride: _unused, ...rest } = form;
    void _unused;
    const r = await run(() => api<{ booking: Booked }>('POST', '/bookings', { leadId, founderId: founder === 'any' ? 'any' : time.founderId, date: time.date, start: time.start, ...rest, link }));
    void slots.reload();
    void myBookings.reload();
    if (r) {
      setDone(`Booked with ${nameOf(r.booking.founderId)} on ${formatDate(r.booking.date)} at ${fmt(r.booking.start)}. ${nameOf(r.booking.founderId)} has been notified.`);
      setBooked(r.booking);
      setTime(null);
      setCustomLink(false);
      setForm((f) => ({ ...f, meetOverride: '' }));
    }
  };

  const howChips = (step?: number) => (
    <ChipGroup step={step} label="How" options={MODES} value={form.mode} onChange={(v) => v && setForm({ ...form, mode: v })} required />
  );
  const typedField = (label: string) => (
    <>
      <Field label={label} type="url" inputMode="url" autoComplete="off" placeholder="https://meet.google.com/abc-defg-hij" value={form.meetOverride} onChange={(e) => setForm({ ...form, meetOverride: e.target.value })} />
      {form.meetOverride.trim() !== '' && typed === null && <p className="text-xs text-warn">{MEET_LINK_ERROR}</p>}
    </>
  );
  const meetNote = !meet ? null : !meetFounderId ? (
    <p className="text-xs text-fg-3">
      {anyFounderHasLink ? 'The call uses the Google Meet room of the founder you book with. Pick a time to see whose.' : 'No founder has set up a Google Meet link yet. Pick a time to continue.'}
    </p>
  ) : founderLink && !customLink ? (
    <div className="space-y-2">
      <p className="text-sm font-medium">Meeting link</p>
      <div className="flex items-center gap-3 rounded-2xl bg-bg-3/70 px-4 py-3">
        <Check className="h-4 w-4 shrink-0 text-good" />
        <span className="min-w-0 flex-1 truncate text-sm">{founderLink.replace('https://', '')}</span>
      </div>
      <p className="text-xs text-fg-3">{host} hosts this call and lets the client in.</p>
      <button type="button" className="text-xs font-medium text-brand" onClick={() => setCustomLink(true)}>Use a different link</button>
    </div>
  ) : (
    <div className={cx('space-y-2', !founderLink && 'rounded-2xl border border-warn/40 bg-warn/10 p-4')}>
      {!founderLink && (
        <p className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> {host} hasn't set up a Meet link yet</p>
      )}
      {typedField('Meeting link for this call')}
      <p className="text-xs text-fg-3">{MEET_BOOKING_HELP} Ask {host} for a link they created, or make sure whoever created it joins the call.</p>
      {founderLink && (
        <button type="button" className="text-xs font-medium text-brand" onClick={() => { setCustomLink(false); setForm((f) => ({ ...f, meetOverride: '' })); }}>Use {host}'s link instead</button>
      )}
    </div>
  );

  const fields = (
    <>
      <Field label="Client name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
      <Field label="Their phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      {form.mode === 'Zoho Cliq' && <Field label="Zoho Cliq link" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />}
    </>
  );
  const bookButton = (
    <Button busy={busy} disabled={!lead || !time || !form.clientName || meetBlocked} className="w-full" onClick={book}>
      {time ? 'Book this call' : lead ? 'Pick a time' : 'Choose a lead first'}
    </Button>
  );

  return (
    <div>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
        Book a <span className="font-serif font-normal italic tracking-normal text-brand">call</span>
      </h1>
      <p className="mt-1 text-fg-2">Pick a free slot. The founder is notified straight away.</p>
      {done && (
        <div role="status" className="mt-4 space-y-4 rounded-3xl border border-good/40 bg-good/10 p-4 sm:p-5">
          <p className="text-sm">{done}</p>
          {booked?.mode === 'Google Meet' && booked.link && (
            <MeetActions join={isFounder(user)} phone={booked.phone} booking={{ date: booked.date, start: booked.start, end: booked.end, clientName: booked.clientName, founderName: founderOf(booked.founderId)?.name ?? '', link: booked.link, leadLabel: lead ? shortLabel(lead) : '' }} />
          )}
        </div>
      )}

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
                    {howChips(4)}
                    {meetNote}
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
                {howChips()}
                {meetNote}
                {fields}
                <ErrorText>{error}</ErrorText>
                {bookButton}
                <p className="text-xs text-fg-3">{notified}</p>
              </div>
            </aside>
          </div>
        )}
      </Async>

      {!isFounder(user) && (
        <Async state={myBookings} label="Loading your booked calls…">
          {({ bookings }) => {
            const upcoming = bookings.filter((b) => b.status !== 'cancelled' && b.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
            return upcoming.length === 0 ? null : (
              <section className="mt-8">
                <h2 className="mb-3 text-lg font-medium">Your booked calls</h2>
                <ul className="space-y-2">
                  {upcoming.map((b) => (
                    <li key={b.id}>
                      <button type="button" onClick={() => setViewing(b)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-bg-2 px-4 py-3 text-left hover:border-line-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{b.clientName}</span>
                          <span className="block truncate text-xs text-fg-3">{DAY[weekday(b.date)]} {formatDate(b.date).slice(0, 6)} · {fmt(b.start)} · with {firstName(b.founderName)}</span>
                        </span>
                        <span className="shrink-0 text-xs text-fg-2">{b.mode}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          }}
        </Async>
      )}

      {viewing && (
        <Modal title={viewing.clientName} subtitle={`${DAY[weekday(viewing.date)]} ${formatDate(viewing.date)} · ${fmt(viewing.start)} IST · with ${firstName(viewing.founderName)} · ${viewing.mode}`} open onClose={() => setViewing(null)}>
          {viewing.mode === 'Google Meet' && viewing.link ? (
            <MeetActions join={isFounder(user)} phone={viewing.phone} booking={{ date: viewing.date, start: viewing.start, end: viewing.end, clientName: viewing.clientName, founderName: viewing.founderName, link: viewing.link }} />
          ) : (
            <p className="text-sm text-fg-2">{viewing.link ? <a href={viewing.link} target="_blank" rel="noreferrer noopener" className="text-brand">Meeting link</a> : `No meeting link for a ${viewing.mode.toLowerCase()} call.`}</p>
          )}
        </Modal>
      )}

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
