// One lead. Employee: the "Log a call" screen. Founders: the same, plus
// edit, assign, commission and delete.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarPlus, ChevronRight, ExternalLink, MapPin, MessageCircle, Phone, Trash2, UserCheck } from 'lucide-react';
import { CALL_OUTCOMES, DEAL_TYPES, LEAD_STATUSES, NEEDS, NEXT_STEPS, RATINGS } from '../../../shared/rules';
import { formatDate, formatDateTime, formatInr } from '../../../shared/time';
import { ApiError, api } from '../api';
import { useAction, useApi, useServerNow } from '../hooks';
import { navigate } from '../router';
import {
  Async, Button, Card, ChipGroup, Countdown, ErrorText, Field, GoogleAttribution, Loading, Modal, MultiChips, QuickDate, SearchableSelect, Segmented,
  StatusPill, Toggle, cx,
} from '../ui';
import AssignDialog from '../components/AssignDialog';
import { leadSubline } from './Leads';
import { isFounder, type CallEntry, type Lead, type TeamUser } from '../types';

interface Detail {
  lead: Lead;
  calls: CallEntry[];
  serverNow: string;
}

const FIFTEEN_MIN = 15 * 60_000;
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

// ─── Contact (live from Google, or our confirmed record) ──────────────────

function LiveContact({ lead, auto }: { lead: Lead; auto: boolean }) {
  const [contact, setContact] = useState<{ name: string; address: string; phone: string; website: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const started = useRef(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setContact((await api<{ contact: NonNullable<typeof contact> }>('GET', `/leads/${lead.id}/live-contact`)).contact);
    } catch (e) {
      const err = e as ApiError;
      setError(['PLACES_CAP_REACHED', 'PLACES_PAUSED', 'PLACES_DISABLED'].includes(err.code ?? '') ? `${err.message} Ask a founder for the number.` : err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // One lookup per visit; the ref stops React's dev double-run paying twice.
    if (auto && !started.current) {
      started.current = true;
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <Card>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-fg-3">
        <span>From Google Maps</span>
        <span className="normal-case tracking-normal">not saved</span>
      </div>
      {loading && <Loading label="Looking up on Google…" />}
      {!loading && error && <div className="mt-4"><ErrorText>{error}</ErrorText></div>}
      {!loading && !contact && !error && !auto && (
        <div className="mt-4">
          <p className="text-sm text-fg-2">Look up the live listing. Each lookup counts toward this month's Google limit.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={load}>Show contact</Button>
        </div>
      )}
      {contact && !loading && (
        <div className="mt-3">
          <p className="text-2xl font-medium tracking-[-0.02em]">{contact.name || 'Name not listed'}</p>
          {contact.address && <p className="mt-2 flex items-start gap-2 text-sm text-fg-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{contact.address}</p>}
          {contact.phone ? <p className="mt-3 text-xl tabular-nums">{contact.phone}</p> : <p className="mt-3 text-sm text-fg-3">No phone number listed on Google.</p>}
          {contact.phone && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand text-sm font-medium text-bg"><Phone className="h-4 w-4" /> Call now</a>
              <a href={waLink(contact.phone)} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-2 text-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
            </div>
          )}
          {contact.website && <a href={contact.website} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-fg-2 hover:text-fg"><ExternalLink className="h-4 w-4" /> Website</a>}
          <div className="mt-2"><GoogleAttribution /></div>
        </div>
      )}
    </Card>
  );
}

function StoredContact({ lead }: { lead: Lead }) {
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">Contact{lead.phoneSource === 'outreach_confirmed' && ' · confirmed'}</p>
      <p className="mt-3 text-2xl font-medium tracking-[-0.02em]">{lead.businessName || lead.label}</p>
      <div className="mt-2 space-y-1 text-sm text-fg-2">
        {lead.contactPerson && <p>{lead.contactPerson}</p>}
        {lead.city && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{lead.city}</p>}
        {lead.websiteOrInstagram && <p className="break-all">{lead.websiteOrInstagram}</p>}
      </div>
      {lead.phone && (
        <>
          <p className="mt-3 text-xl tabular-nums">{lead.phone}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`tel:${lead.phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand text-sm font-medium text-bg"><Phone className="h-4 w-4" /> Call now</a>
            <a href={waLink(lead.phone)} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-2 text-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Log a call ───────────────────────────────────────────────────────────

function LogCall({ lead, msLeft, onLogged }: { lead: Lead; msLeft: number | null; onLogged: () => void }) {
  const [outcome, setOutcome] = useState('');
  const [rating, setRating] = useState<string>(lead.rating);
  const [needs, setNeeds] = useState<string[]>(lead.need ? lead.need.split(',').map((s) => s.trim()).filter((s) => (NEEDS as readonly string[]).includes(s)) : []);
  const [nextStep, setNextStep] = useState<string>((NEXT_STEPS as readonly string[]).includes(lead.nextStep) ? lead.nextStep : '');
  const [followUpDate, setFollowUpDate] = useState(lead.followUpDate);
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState('');
  const { busy, error, setError, run } = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!outcome) return setError('Choose how the call went.');
    const r = await run(() =>
      api<{ timerStopped: boolean }>('POST', `/leads/${lead.id}/calls`, {
        outcome,
        rating,
        need: needs.join(', '),
        nextStep,
        followUpDate,
        note,
      }),
    );
    if (r) {
      setDone(r.timerStopped ? 'Call saved. This lead is yours now — the timer has stopped.' : 'Call saved.');
      setOutcome('');
      setNote('');
      onLogged();
      if (nextStep === 'Book discovery call') navigate(`/team/book?lead=${lead.id}`);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {msLeft !== null && msLeft > 0 && msLeft < FIFTEEN_MIN && <ErrorText>Under 15 minutes left. Save the call now or this lead goes back to the founders.</ErrorText>}
      <ChipGroup label="How did the call go?" options={CALL_OUTCOMES.map((o) => o.value)} value={outcome} onChange={setOutcome} />
      <Segmented
        label="Rate this lead"
        options={RATINGS.map((r) => ({ value: r, label: <><span className={cx('h-2 w-2 rounded-full', r === 'Good' ? 'bg-good' : r === 'Intermediate' ? 'bg-warn' : 'bg-bad')} />{r}</> }))}
        value={rating as (typeof RATINGS)[number]}
        onChange={setRating}
      />
      <MultiChips label="What do they need?" options={NEEDS} value={needs as (typeof NEEDS)[number][]} onChange={setNeeds} />
      <ChipGroup label="Next step" options={NEXT_STEPS} value={nextStep as (typeof NEXT_STEPS)[number] | ''} onChange={setNextStep} />
      <QuickDate label="Follow-up" value={followUpDate} onChange={setFollowUpDate} />
      <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Owner is free after 5 PM…" />

      {lead.needsLiveLookup && (
        <button type="button" onClick={() => setConfirming(true)} className="flex w-full items-center gap-4 rounded-3xl border border-brand/40 bg-brand/5 p-4 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand"><UserCheck className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg">Reached the owner?</span>
            <span className="block text-xs text-fg-2">Save their name & number</span>
          </span>
          <ChevronRight className="h-4 w-4 text-fg-3" />
        </button>
      )}

      <ErrorText>{error}</ErrorText>
      {done && !error && <p role="status" className="text-sm text-good">{done}</p>}
      <div className="sticky bottom-16 z-30 -mx-5 bg-gradient-to-t from-bg from-60% to-transparent px-5 pb-3 pt-8 md:static md:m-0 md:bg-none md:p-0">
        <Button type="submit" busy={busy} className="w-full shadow-lg shadow-black/40 md:shadow-none">Save call</Button>
      </div>
      <ConfirmContact lead={lead} open={confirming} onClose={() => setConfirming(false)} onDone={onLogged} />
    </form>
  );
}

/** First-party contact typed by the caller — deliberately never prefilled from Google. */
function ConfirmContact({ lead, open, onClose, onDone }: { lead: Lead; open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ businessName: '', contactPerson: '', phone: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title="Reached the" accent="owner?" subtitle="Type what they confirmed. This becomes our own record and Google lookups stop." open={open} onClose={onClose}>
      <div className="space-y-5">
        <Field label="Business name" required value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} />
        <Field label="Contact person" value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} />
        <Field label="Phone you reached them on" type="tel" inputMode="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <ErrorText>{error}</ErrorText>
        <Button
          busy={busy}
          className="w-full"
          onClick={async () => {
            if (await run(() => api('POST', `/leads/${lead.id}/confirm`, f))) {
              onClose();
              onDone();
            }
          }}
        >
          Save contact
        </Button>
      </div>
    </Modal>
  );
}

// ─── Founder: edit ────────────────────────────────────────────────────────

function EditLead({ lead, founder, open, onClose, onSaved }: { lead: Lead; founder: boolean; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(lead);
  useEffect(() => setF(lead), [lead, open]);
  const { busy, error, run } = useAction();
  const set = (k: keyof Lead) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const locked = lead.needsLiveLookup;

  const save = async () => {
    const employeePart = { rating: f.rating, decisionMaker: f.decisionMaker, need: f.need, nextStep: f.nextStep, followUpDate: f.followUpDate, discoveryCallDate: f.discoveryCallDate };
    const body = founder
      ? {
          ...employeePart,
          ...(locked ? {} : { businessName: f.businessName, contactPerson: f.contactPerson, phone: f.phone }),
          category: f.category, city: f.city, websiteOrInstagram: f.websiteOrInstagram, serviceInterest: f.serviceInterest,
          status: f.status, dealType: f.dealType, dealValue: Number(f.dealValue) || 0, clientPaid: f.clientPaid, callHappened: f.callHappened, notes: f.notes,
        }
      : employeePart;
    if (await run(() => api('PATCH', `/leads/${lead.id}`, { ...body, expectedUpdatedAt: lead.updatedAt }))) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal title="Edit" accent="lead" open={open} onClose={onClose} wide>
      <div className="space-y-5">
        {founder && !locked && (
          <>
            <Field label="Business name" value={f.businessName} onChange={set('businessName')} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Contact person" value={f.contactPerson} onChange={set('contactPerson')} />
              <Field label="Phone" type="tel" value={f.phone} onChange={set('phone')} />
            </div>
          </>
        )}
        {founder && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category" value={f.category} onChange={set('category')} />
            <Field label="City / area" value={f.city} onChange={set('city')} />
          </div>
        )}
        <Field label="Decision maker" value={f.decisionMaker} onChange={set('decisionMaker')} />
        <Field label="Need / problem" value={f.need} onChange={set('need')} />
        <Field label="Discovery call date" type="date" value={f.discoveryCallDate} onChange={set('discoveryCallDate')} />
        {founder && (
          <>
            <SearchableSelect label="Status" value={f.status} options={LEAD_STATUSES} onChange={(v) => setF({ ...f, status: v })} />
            <Segmented label="Deal type" options={DEAL_TYPES} value={(f.dealType || 'One-time') as (typeof DEAL_TYPES)[number]} onChange={(v) => setF({ ...f, dealType: v })} />
            <Field label="Deal value (₹)" type="number" min={0} inputMode="numeric" value={String(f.dealValue || '')} onChange={(e) => setF({ ...f, dealValue: Number(e.target.value) })} />
            <Toggle label="Discovery call happened" checked={f.callHappened} onChange={(v) => setF({ ...f, callHappened: v })} />
            <Toggle label="Client paid" checked={f.clientPaid} onChange={(v) => setF({ ...f, clientPaid: v })} />
            <Field label="Notes" value={f.notes} onChange={set('notes')} />
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <Button busy={busy} className="w-full" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function LeadDetail({ id, user }: { id: string; user: TeamUser }) {
  const state = useApi<Detail>(`/leads/${id}`);
  const now = useServerNow(state.data?.serverNow, 10_000);
  const founder = isFounder(user);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const action = useAction();
  const back = founder ? '/team/leads' : '/team';

  return (
    <div className="mx-auto max-w-2xl">
      <Async state={state} label="Loading lead…">
        {({ lead, calls }) => {
          const msLeft = lead.expiresAt ? Date.parse(lead.expiresAt) - now : null;
          return (
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <a href={back} onClick={(e) => { e.preventDefault(); navigate(back); }} aria-label="Back" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg">
                  <ArrowLeft className="h-4 w-4" />
                </a>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-xl font-medium tracking-[-0.02em] sm:text-2xl">{lead.label.replace(/ · Google lead$/, '')}</h1>
                  <p className="text-xs text-fg-3">{lead.timerRunning ? 'Disappears unless you log a call' : leadSubline(lead)}</p>
                </div>
                {lead.timerRunning ? <Countdown expiresAt={lead.expiresAt} now={now} /> : <StatusPill status={lead.status} />}
              </div>

              {lead.needsLiveLookup ? <LiveContact lead={lead} auto={!founder} /> : <StoredContact lead={lead} />}

              <LogCall lead={lead} msLeft={lead.timerRunning ? msLeft : null} onLogged={state.reload} />

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => navigate(`/team/book?lead=${lead.id}`)}><CalendarPlus className="h-4 w-4" /> Book discovery call</Button>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit details</Button>
                {founder && <Button variant="secondary" size="sm" onClick={() => setAssigning(true)}>{lead.assigneeName ? `Reassign (${lead.assigneeName.split(' ')[0]})` : 'Assign'}</Button>}
              </div>

              {founder && (
                <Card>
                  <h2 className="text-sm font-medium">Deal & commission</h2>
                  <p className="mt-2 text-sm text-fg-2">
                    {lead.dealValue ? `${formatInr(lead.dealValue)} · ${lead.dealType || 'One-time'} · client ${lead.clientPaid ? 'paid' : 'not paid yet'}` : 'No deal value yet.'}
                  </p>
                  <p className="mt-1 text-sm text-fg-2">
                    Commission earned {formatInr(lead.commission)} · paid {formatInr(lead.commissionPaid)}
                    {lead.commissionPaidAt && ` on ${formatDate(lead.commissionPaidAt)}`}
                  </p>
                  {lead.commission > lead.commissionPaid && lead.assigneeName && (
                    <Button variant="secondary" size="sm" className="mt-4" busy={action.busy} onClick={async () => (await action.run(() => api('POST', `/leads/${lead.id}/commission-paid`))) && state.reload()}>
                      Mark {formatInr(lead.commission - lead.commissionPaid)} paid to {lead.assigneeName.split(' ')[0]}
                    </Button>
                  )}
                  <div className="mt-3"><ErrorText>{action.error}</ErrorText></div>
                </Card>
              )}

              <Card>
                <h2 className="text-sm font-medium">Call log</h2>
                {calls.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-3">No calls logged yet.</p>
                ) : (
                  <ol className="mt-4 space-y-4">
                    {calls.map((c) => (
                      <li key={c.id} className="border-l-2 border-line-2 pl-4">
                        <p className="text-sm text-fg">{c.outcome}</p>
                        <p className="text-xs text-fg-3">{formatDateTime(c.at)} · {c.by}</p>
                        {c.note && <p className="mt-1 text-sm text-fg-2">{c.note}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              {founder && (
                <div>
                  {!confirmDelete ? (
                    <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete lead</Button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fg-2">Delete this lead permanently?</span>
                      <Button size="sm" busy={action.busy} onClick={async () => (await action.run(() => api('DELETE', `/leads/${lead.id}`))) && navigate('/team/leads')}>Delete</Button>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    </div>
                  )}
                </div>
              )}

              <EditLead lead={lead} founder={founder} open={editing} onClose={() => setEditing(false)} onSaved={state.reload} />
              {founder && <AssignDialog leadIds={[lead.id]} open={assigning} onClose={() => setAssigning(false)} onDone={state.reload} requireDeadline={lead.isGoogle} />}
            </div>
          );
        }}
      </Async>
    </div>
  );
}

