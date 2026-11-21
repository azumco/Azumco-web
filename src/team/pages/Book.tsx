// Book a discovery call. Phones: one column. Laptops: the picker on the left,
// "You're booking" on the right. Founder names and colours come from the
// user records.

import { useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import { weekday } from '../../../shared/slots';
import { formatDate, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Avatar, Button, Card, ChipGroup, ChoiceChip, Empty, ErrorText, Field, Modal, Segmented, colourTone, cx } from '../ui';
import { firstName, isFounder, type LeadsResponse, type Slot, type TeamUser } from '../types';
import { shortLabel } from './LeadDetail';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODES = [{ value: 'Zoho Cliq', label: 'Zoho Cliq' }, { value: 'Phone call', label: 'Phone' }, { value: 'In person', label: 'In person' }] as const;
const fmt = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

interface Founder { id: string; name: string; calendarColor: string }

export default function Book({ user }: { user: TeamUser }) {
  const [leadId, setLeadId] = useState(new URLSearchParams(window.location.search).get('lead') ?? '');
  const [pickingLead, setPickingLead] = useState(false);
  const [founder, setFounder] = useState('any');
  const [day, setDay] = useState('');
  const [time, setTime] = useState<Slot | null>(null);
  const [form, setForm] = useState({ clientName: '', phone: '', mode: 'Zoho Cliq' as (typeof MODES)[number]['value'], link: '', notes: '' });
  const [done, setDone] = useState('');
  const today = istDate();
  const leads = useApi<LeadsResponse>('/leads');
  const slots = useApi<{ slots: Slot[]; founders: Founder[] }>(`/slots?from=${today}&days=14`);
  const { busy, error, setError, run } = useAction();

  const open = (leads.data?.leads ?? []).filter((l) => l.status !== 'Won' && l.status !== 'Lost');
  const lead = open.find((l) => l.id === leadId);
  const founders = slots.data?.founders ?? [];
  const nameOf = (id: string) => firstName(founders.find((f) => f.id === id)?.name ?? '');

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
  const days = [...new Set(visible.map((s) => s.date))];
  const activeDay = day && days.includes(day) ? day : days[0] ?? '';
  const times = visible.filter((s) => s.date === activeDay);
  const taken = times.filter((s) => s.booked).map((s) => fmt(s.start));
  const freeWith = [...new Set((slots.data?.slots ?? []).filter((s) => s.date === activeDay && !s.booked).map((s) => nameOf(s.founderId)))];
  const withId = time ? (founder === 'any' ? time.founderId : founder) : '';

  const book = async () => {
    if (!lead || !time) return setError('Choose a lead and a time.');
    const r = await run(() => api<{ booking: { founderId: string; date: string; start: string } }>('POST', '/bookings', { leadId, founderId: founder === 'any' ? 'any' : time.founderId, date: time.date, start: time.start, ...form }));
    void slots.reload();
    if (r) {
      setDone(`Booked with ${nameOf(r.booking.founderId)} on ${formatDate(r.booking.date)} at ${fmt(r.booking.start)}. ${nameOf(r.booking.founderId)} has been notified.`);
      setTime(null);
    }
  };

  const details = (
    <div className="space-y-5">
      <Segmented label="How" options={MODES} value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} />
      <Field label="Client name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
      <Field label="Their phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      {form.mode === 'Zoho Cliq' && <Field label="Zoho Cliq link" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />}
      <ErrorText>{error}</ErrorText>
      <div className="sticky bottom-16 z-30 -mx-5 bg-gradient-to-t from-bg from-60% to-transparent px-5 pb-3 pt-8 md:static md:m-0 md:bg-none md:p-0">
        <Button busy={busy} disabled={!lead || !time || !form.clientName} className="w-full shadow-lg shadow-black/40 md:shadow-none" onClick={book}>
          {time ? `Book ${DAY[weekday(time.date)]} ${formatDate(time.date).slice(0, 6)} · ${fmt(time.start)}` : 'Pick a time'}
        </Button>
      </div>
      {time && withId && <p className="text-xs text-fg-3">{nameOf(withId)} gets notified right away.</p>}
    </div>
  );

  return (
    <div>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em]">
        Book a <span className="font-serif font-normal italic tracking-normal text-brand">call</span>
      </h1>
      <p className="mt-1 text-fg-2">Pick a free slot. The founder gets notified straight away.</p>
      {done && <p role="status" className="mt-4 rounded-2xl border border-good/40 bg-good/10 px-4 py-3 text-sm">{done}</p>}

      <Async state={slots} label="Loading free slots…">
        {() => (
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
            <div className="lg:rounded-3xl lg:border lg:border-line lg:bg-bg-2 lg:p-6">
              <button type="button" onClick={() => setPickingLead(true)} className="flex w-full items-center gap-4 rounded-3xl border border-line bg-bg-2 p-4 text-left hover:border-line-2 lg:rounded-2xl lg:border-0 lg:bg-bg-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg text-fg-3"><Store className="h-4.5 w-4.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-fg-3">For</span>
                  <span className="block truncate font-medium">{lead ? shortLabel(lead) : 'Choose a lead'}</span>
                </span>
                <span className="text-sm font-medium text-brand">Change</span>
              </button>

              {(slots.data?.slots ?? []).length === 0 ? (
                <div className="mt-6"><Empty title="No free slots in the next two weeks">{isFounder(user) ? 'Add your free slots in the Calendar.' : 'Ask a founder to add free slots.'}</Empty></div>
              ) : (
                <div className="mt-6 space-y-6">
                  <ChipGroup label="With" options={[{ value: 'any', label: 'Any founder' }, ...founders.map((f) => ({ value: f.id, label: firstName(f.name) }))]} value={founder} onChange={(v) => { setFounder(v || 'any'); setTime(null); }} required />
                  <div>
                    <p className="mb-2 text-sm font-medium">Day</p>
                    {days.length === 0 ? (
                      <p className="text-sm text-fg-3">No free days for this founder.</p>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {days.map((d) => (
                          <button key={d} type="button" aria-pressed={d === activeDay} onClick={() => { setDay(d); setTime(null); }} className={cx('flex min-h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border lg:w-24', d === activeDay ? 'border-brand bg-brand/10 text-brand' : 'border-line-2 text-fg')}>
                            <span className="text-[10px] uppercase tracking-[0.14em] opacity-70">{DAY[weekday(d)]}</span>
                            <span className="text-xl font-medium">{d.slice(8)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {activeDay && (
                    <div>
                      <p className="mb-2 text-sm font-medium">Free times · {DAY[weekday(activeDay)]} {activeDay.slice(8)}</p>
                      <div className="flex flex-wrap gap-2">
                        {times.map((s) => (
                          <ChoiceChip key={`${s.founderId}${s.start}`} on={time?.start === s.start && time?.date === s.date} disabled={s.booked || !lead} onClick={() => { setTime(s); setForm((f) => ({ ...f, clientName: f.clientName || lead?.contactPerson || lead?.businessName || '' })); }} className={s.booked ? 'line-through' : ''}>
                            {fmt(s.start)}
                          </ChoiceChip>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-fg-3">
                        {freeWith.length ? `Free: ${freeWith.join(', ')}` : ''}
                        {taken.length ? ` · ${taken.join(', ')} taken` : ''}
                        {!lead && ' · choose a lead first'}
                      </p>
                    </div>
                  )}
                  <div className="lg:hidden">{details}</div>
                </div>
              )}
            </div>

            <Card className="hidden lg:block">
              <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">You're booking</p>
              <p className="mt-3 text-xl font-medium">{lead ? shortLabel(lead) : 'Choose a lead'}</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-fg-2">When</dt><dd className="font-medium">{time ? `${DAY[weekday(time.date)]} ${formatDate(time.date).slice(0, 6)} · ${fmt(time.start)}` : '—'}</dd></div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-fg-2">With</dt>
                  <dd className="flex items-center gap-2 font-medium">
                    {withId ? (
                      <>
                        <Avatar name={founders.find((f) => f.id === withId)?.name ?? ''} tone={colourTone(founders.find((f) => f.id === withId)?.calendarColor)} /> {nameOf(withId)}
                      </>
                    ) : founder === 'any' ? 'Any founder' : nameOf(founder)}
                  </dd>
                </div>
              </dl>
              <div className="mt-5">{details}</div>
            </Card>
          </div>
        )}
      </Async>

      <Modal title="Which" accent="lead?" open={pickingLead} onClose={() => setPickingLead(false)}>
        <Async state={leads}>
          {() =>
            open.length === 0 ? (
              <Empty title="No open leads" />
            ) : (
              <ul className="space-y-2">
                {open.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => { setLeadId(l.id); setPickingLead(false); setTime(null); }} className={cx('flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left', l.id === leadId ? 'border-brand text-brand' : 'border-line text-fg')}>
                      <span className="truncate">{shortLabel(l)}</span>
                      <span className="text-xs text-fg-3">{l.status}</span>
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
