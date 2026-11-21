// Book a discovery call: pick a lead, a founder (or any), then an open slot.

import { useMemo, useState, type FormEvent } from 'react';
import { CalendarCheck } from 'lucide-react';
import { formatDate, fromIst, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Button, Card, Chip, Empty, ErrorText, Field, Modal, PageHeader, Select, TextArea } from '../ui';
import { isFounder, type LeadsResponse, type Slot, type TeamUser } from '../types';

const MODES = ['Zoho Cliq', 'Phone call', 'In person'] as const;
const weekdayName = (d: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${d}T00:00:00Z`).getUTCDay()];

export default function Book({ user }: { user: TeamUser }) {
  const initialLead = new URLSearchParams(window.location.search).get('lead') ?? '';
  const [leadId, setLeadId] = useState(initialLead);
  const [founder, setFounder] = useState('any');
  const [picked, setPicked] = useState<Slot | null>(null);
  const [done, setDone] = useState('');
  const today = istDate();
  const leads = useApi<LeadsResponse>('/leads');
  const slots = useApi<{ slots: Slot[]; founders: { id: string; name: string }[] }>(`/slots?from=${today}&days=14`);
  const [form, setForm] = useState({ clientName: '', phone: '', mode: 'Zoho Cliq' as (typeof MODES)[number], link: '', notes: '' });
  const { busy, error, setError, run } = useAction();

  const myLeads = (leads.data?.leads ?? []).filter((l) => l.status !== 'Won' && l.status !== 'Lost');
  const lead = myLeads.find((l) => l.id === leadId);

  // "Any founder" merges times: a time is open if at least one founder is free.
  const visible = useMemo(() => {
    const list = slots.data?.slots ?? [];
    if (founder !== 'any') return list.filter((s) => s.founderId === founder);
    const byTime = new Map<string, Slot>();
    for (const s of list) {
      const key = `${s.date}|${s.start}`;
      const cur = byTime.get(key);
      if (!cur || (cur.booked && !s.booked)) byTime.set(key, { ...s, founderId: 'any' });
    }
    return [...byTime.values()].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }, [slots.data, founder]);

  const days = [...new Set(visible.map((s) => s.date))];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!picked || !leadId) return;
    const r = await run(() =>
      api<{ booking: { founderId: string; date: string; start: string } }>('POST', '/bookings', {
        leadId,
        founderId: picked.founderId,
        date: picked.date,
        start: picked.start,
        ...form,
      }),
    );
    void slots.reload();
    if (r) {
      const who = slots.data?.founders.find((f) => f.id === r.booking.founderId)?.name ?? 'a founder';
      setDone(`Booked with ${who} on ${formatDate(r.booking.date)} at ${r.booking.start} IST.`);
      setPicked(null);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Discovery call" title="Book a" accent="call" />
      {done && (
        <Card className="mb-6 border-brand/50">
          <p className="flex items-center gap-2 text-sm">
            <CalendarCheck className="h-4 w-4 text-brand" />
            {done}
          </p>
          {lead && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate(`/team/leads/${lead.id}`)}>
              Back to lead
            </Button>
          )}
        </Card>
      )}

      <Card>
        <Async state={leads}>
          {() =>
            myLeads.length === 0 ? (
              <p className="text-sm text-fg-2">{isFounder(user) ? 'There are no open leads to book for.' : 'You have no leads to book a call for yet.'}</p>
            ) : (
              <Select
                label="Lead"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                options={[{ value: '', label: 'Choose a lead…' }, ...myLeads.map((l) => ({ value: l.id, label: l.label }))]}
              />
            )
          }
        </Async>
      </Card>

      <div className="mt-6">
        <Async state={slots} label="Loading open slots…">
          {({ founders }) => (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Chip selected={founder === 'any'} onClick={() => setFounder('any')}>
                  Any available founder
                </Chip>
                {founders.map((f) => (
                  <Chip key={f.id} selected={founder === f.id} onClick={() => setFounder(f.id)}>
                    {f.name}
                  </Chip>
                ))}
              </div>
              {days.length === 0 ? (
                <Empty title="No open slots in the next two weeks">Ask a founder to add available hours in the Calendar.</Empty>
              ) : (
                days.map((d) => (
                  <section key={d}>
                    <h2 className="mb-2 text-xs uppercase tracking-[0.18em] text-fg-3">
                      {weekdayName(d)} · {formatDate(d)}
                    </h2>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                      {visible
                        .filter((s) => s.date === d)
                        .map((s) => (
                          <button
                            key={`${s.founderId}${s.start}`}
                            type="button"
                            disabled={s.booked || !leadId}
                            onClick={() => {
                              setError('');
                              setDone('');
                              setForm((f) => ({ ...f, clientName: f.clientName || lead?.businessName || lead?.contactPerson || '' }));
                              setPicked(s);
                            }}
                            className={`min-h-12 rounded-2xl border text-sm tabular-nums transition-colors ${
                              s.booked
                                ? 'cursor-not-allowed border-line text-fg-3 line-through'
                                : 'border-line-2 text-fg hover:border-brand disabled:cursor-not-allowed disabled:opacity-50'
                            }`}
                            aria-label={`${s.start} ${s.booked ? 'booked' : 'open'}`}
                          >
                            {s.start}
                          </button>
                        ))}
                    </div>
                  </section>
                ))
              )}
              {!leadId && days.length > 0 && <p className="text-xs text-fg-3">Choose a lead first to pick a time.</p>}
            </div>
          )}
        </Async>
      </div>

      <Modal title={picked ? `Book ${formatDate(picked.date)} · ${picked.start} IST` : 'Book'} open={Boolean(picked)} onClose={() => setPicked(null)}>
        <form onSubmit={submit} className="space-y-5">
          {picked && fromIst(picked.date, picked.start).getTime() - Date.now() < 60 * 60_000 && (
            <p className="text-sm text-brand-2">This call starts within the hour.</p>
          )}
          <Field label="Client name" required value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          <Field label="Client phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <fieldset>
            <legend className="text-xs uppercase tracking-[0.18em] text-fg-3">Meeting</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODES.map((m) => (
                <Chip key={m} selected={form.mode === m} onClick={() => setForm({ ...form, mode: m })}>
                  {m}
                </Chip>
              ))}
            </div>
          </fieldset>
          {form.mode === 'Zoho Cliq' && <Field label="Zoho Cliq meeting link" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />}
          <TextArea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} className="w-full">
            Confirm booking
          </Button>
        </form>
      </Modal>
    </div>
  );
}
