// One lead. Employees: call logging, live contact, confirm, book.
// Founders additionally: edit everything, assign, commission, delete.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarPlus, ExternalLink, MapPin, Phone, Trash2, UserCheck } from 'lucide-react';
import { CALL_OUTCOMES, DEAL_TYPES, LEAD_SOURCES, LEAD_STATUSES, RATINGS, formatDuration } from '../../../shared/rules';
import { formatDate, formatDateTime, formatInr } from '../../../shared/time';
import { ApiError, api } from '../api';
import { useAction, useApi, useServerNow } from '../hooks';
import { navigate } from '../router';
import {
  Async, Badge, Button, Card, ChipGroup, Countdown, ErrorText, Field, GoogleAttribution, Loading, Modal, Select, TextArea, Toggle,
} from '../ui';
import { isFounder, type CallEntry, type Lead, type TeamMember, type TeamUser } from '../types';

interface Detail {
  lead: Lead;
  calls: CallEntry[];
  serverNow: string;
}

const FIFTEEN_MIN = 15 * 60_000;

// ─── Live Google contact (never stored, never cached) ─────────────────────

function LiveContact({ lead, auto }: { lead: Lead; auto: boolean }) {
  const [contact, setContact] = useState<{ name: string; address: string; phone: string; website: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const started = useRef(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await api<{ contact: NonNullable<typeof contact> }>('GET', `/leads/${lead.id}/live-contact`);
      setContact(r.contact);
    } catch (e) {
      const err = e as ApiError;
      setError(
        err.code === 'PLACES_CAP_REACHED' || err.code === 'PLACES_PAUSED' || err.code === 'PLACES_DISABLED'
          ? `${err.message} Ask a founder for the number.`
          : err.message,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // One lookup per visit. The ref stops React's dev double-run from paying twice.
    if (auto && !started.current) {
      started.current = true;
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Contact from Google</h2>
        <Badge tone="muted">Not saved</Badge>
      </div>
      {loading && <Loading label="Looking up on Google…" />}
      {!loading && error && (
        <div className="mt-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {!loading && !contact && !error && !auto && (
        <div className="mt-4">
          <p className="text-sm text-fg-2">Look up the live listing. Each lookup counts toward this month's Google limit.</p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={load}>
            Show contact
          </Button>
        </div>
      )}
      {contact && !loading && (
        <div className="mt-4 space-y-3">
          <p className="text-lg font-medium">{contact.name || 'Name not listed'}</p>
          {contact.address && (
            <p className="flex items-start gap-2 text-sm text-fg-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              {contact.address}
            </p>
          )}
          {contact.phone ? (
            <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-6 text-sm font-medium text-white">
              <Phone className="h-4 w-4" /> Call {contact.phone}
            </a>
          ) : (
            <p className="text-sm text-fg-3">No phone number listed on Google.</p>
          )}
          {contact.website && (
            <a href={contact.website} target="_blank" rel="noreferrer noopener" className="flex min-h-11 items-center gap-2 text-sm text-fg-2 hover:text-fg">
              <ExternalLink className="h-4 w-4" /> Website
            </a>
          )}
          <p className="text-xs text-fg-3">Shown live and not saved. When you reach them, confirm the contact below.</p>
          <GoogleAttribution />
        </div>
      )}
    </Card>
  );
}

// ─── Quick call logging ───────────────────────────────────────────────────

function CallLogger({ lead, msLeft, onLogged }: { lead: Lead; msLeft: number | null; onLogged: () => void }) {
  const [outcome, setOutcome] = useState('');
  const [rating, setRating] = useState<(typeof RATINGS)[number] | ''>((lead.rating as (typeof RATINGS)[number]) || '');
  const [need, setNeed] = useState(lead.need);
  const [nextStep, setNextStep] = useState(lead.nextStep);
  const [followUpDate, setFollowUpDate] = useState(lead.followUpDate);
  const [decisionMaker, setDecisionMaker] = useState(lead.decisionMaker);
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');
  const { busy, error, setError, run } = useAction();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!outcome) return setError('Choose what happened on the call.');
    const r = await run(() =>
      api<{ timerStopped: boolean }>('POST', `/leads/${lead.id}/calls`, { outcome, rating, need, nextStep, followUpDate, decisionMaker, note }),
    );
    if (r) {
      setDone(r.timerStopped ? 'Call logged. This lead is yours — the timer has stopped.' : 'Call logged.');
      setOutcome('');
      setNote('');
      onLogged();
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-medium">Log a call</h2>
      {msLeft !== null && msLeft > 0 && msLeft < FIFTEEN_MIN && (
        <div className="mt-3">
          <ErrorText>Only {formatDuration(msLeft)} left. Log the call now or this lead goes back to the founders.</ErrorText>
        </div>
      )}
      <form onSubmit={submit} className="mt-4 space-y-5">
        <ChipGroup label="Outcome" options={CALL_OUTCOMES.map((o) => o.value)} value={outcome} onChange={setOutcome} />
        <ChipGroup label="Rating" options={RATINGS} value={rating} onChange={setRating} />
        <Field label="Need / problem" value={need} onChange={(e) => setNeed(e.target.value)} />
        <Field label="Next step" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Follow-up date" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          <Field label="Decision maker" value={decisionMaker} onChange={(e) => setDecisionMaker(e.target.value)} />
        </div>
        <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        <ErrorText>{error}</ErrorText>
        {done && !error && <p role="status" className="text-sm text-fg">{done}</p>}
        <Button type="submit" busy={busy} className="w-full sm:w-auto">
          Save call
        </Button>
      </form>
    </Card>
  );
}

// ─── Confirm contact (first-party; deliberately empty, never prefilled) ───

function ConfirmContact({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [form, setForm] = useState({ businessName: '', contactPerson: '', phone: '' });
  const { busy, error, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api('POST', `/leads/${lead.id}/confirm`, form))) onDone();
  };
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <UserCheck className="h-4 w-4 text-brand" /> Confirm contact
      </h2>
      <p className="mt-2 text-sm text-fg-2">Once you have actually reached the business, type what they confirmed. This saves it as our own record and Google lookups stop.</p>
      <form onSubmit={submit} className="mt-4 space-y-5" autoComplete="off">
        <Field label="Business name" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
        <Field label="Contact person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
        <Field label="Phone you reached them on" type="tel" inputMode="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="ghost" busy={busy}>
          Confirm contact
        </Button>
      </form>
    </Card>
  );
}

// ─── Edit details ─────────────────────────────────────────────────────────

function EditLead({ lead, founder, open, onClose, onSaved }: { lead: Lead; founder: boolean; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(lead);
  useEffect(() => setF(lead), [lead, open]);
  const { busy, error, run } = useAction();
  const set = (k: keyof Lead) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const contactLocked = lead.needsLiveLookup;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const employeePart = { rating: f.rating, decisionMaker: f.decisionMaker, need: f.need, nextStep: f.nextStep, followUpDate: f.followUpDate, discoveryCallDate: f.discoveryCallDate };
    const body = founder
      ? {
          ...employeePart,
          ...(contactLocked ? {} : { businessName: f.businessName, contactPerson: f.contactPerson, phone: f.phone }),
          category: f.category, city: f.city, websiteOrInstagram: f.websiteOrInstagram, source: f.source, serviceInterest: f.serviceInterest,
          status: f.status, dealType: f.dealType, dealValue: Number(f.dealValue) || 0, clientPaid: f.clientPaid, callHappened: f.callHappened, notes: f.notes,
        }
      : employeePart;
    if (await run(() => api('PATCH', `/leads/${lead.id}`, { ...body, expectedUpdatedAt: lead.updatedAt }))) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal title="Edit lead" open={open} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        {founder && (
          <>
            {!contactLocked && (
              <>
                <Field label="Business name" value={f.businessName} onChange={set('businessName')} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Contact person" value={f.contactPerson} onChange={set('contactPerson')} />
                  <Field label="Phone" type="tel" value={f.phone} onChange={set('phone')} />
                </div>
              </>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Category" value={f.category} onChange={set('category')} />
              <Field label="City / area" value={f.city} onChange={set('city')} />
            </div>
            <Field label="Website / Instagram" value={f.websiteOrInstagram} onChange={set('websiteOrInstagram')} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Select label="Source" value={f.source} onChange={set('source')} options={['', ...LEAD_SOURCES]} />
              <Field label="Service interest" value={f.serviceInterest} onChange={set('serviceInterest')} />
            </div>
          </>
        )}
        <Select label="Rating" value={f.rating} onChange={set('rating')} options={['', ...RATINGS]} />
        <Field label="Decision maker" value={f.decisionMaker} onChange={set('decisionMaker')} />
        <TextArea label="Need / problem" value={f.need} onChange={set('need')} />
        <Field label="Next step" value={f.nextStep} onChange={set('nextStep')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Follow-up date" type="date" value={f.followUpDate} onChange={set('followUpDate')} />
          <Field label="Discovery call date" type="date" value={f.discoveryCallDate} onChange={set('discoveryCallDate')} />
        </div>
        {founder && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Select label="Status" value={f.status} onChange={set('status')} options={[...LEAD_STATUSES]} />
              <Select label="Deal type" value={f.dealType} onChange={set('dealType')} options={['', ...DEAL_TYPES]} />
            </div>
            <Field label="Deal value (₹)" type="number" min={0} inputMode="numeric" value={String(f.dealValue || '')} onChange={(e) => setF({ ...f, dealValue: Number(e.target.value) })} />
            <Toggle label="Discovery call happened" checked={f.callHappened} onChange={(v) => setF({ ...f, callHappened: v })} />
            <Toggle label="Client paid" checked={f.clientPaid} onChange={(v) => setF({ ...f, clientPaid: v })} />
            <TextArea label="Notes" value={f.notes} onChange={set('notes')} />
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Save
        </Button>
      </form>
    </Modal>
  );
}

// ─── Founder: assign ──────────────────────────────────────────────────────

export function AssignDialog({ leadIds, open, onClose, onDone, defaultHours = 24, requireDeadline }: {
  leadIds: string[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  defaultHours?: number;
  /** Google leads always get a deadline; manual ones only when ticked. */
  requireDeadline?: boolean;
}) {
  const team = useApi<{ users: TeamMember[] }>(open ? '/team' : null);
  const [assignee, setAssignee] = useState('');
  const [deadline, setDeadline] = useState(Boolean(requireDeadline));
  const [hours, setHours] = useState(String([12, 24, 48].includes(defaultHours) ? defaultHours : 24));
  const { busy, error, run } = useAction();
  useEffect(() => setDeadline(Boolean(requireDeadline)), [requireDeadline, open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() =>
      api('POST', '/leads/assign', { leadIds, assigneeId: assignee || null, hours: assignee && deadline ? Number(hours) : null }),
    );
    if (ok) {
      onDone();
      onClose();
    }
  };
  const people = team.data?.users ?? [];
  return (
    <Modal title={leadIds.length > 1 ? `Assign ${leadIds.length} leads` : 'Assign lead'} open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Select
          label="Assign to"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          options={[{ value: '', label: 'Nobody (Unclaimed)' }, ...people.map((u) => ({ value: u.id, label: u.name }))]}
        />
        {assignee && (
          <>
            {!requireDeadline && <Toggle label="Give a deadline" hint="The lead returns to Unclaimed if not contacted in time." checked={deadline} onChange={setDeadline} />}
            {deadline && (
              <Select label="Contact within" value={hours} onChange={(e) => setHours(e.target.value)} options={[{ value: '12', label: '12 hours' }, { value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }]} />
            )}
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          {assignee ? 'Assign' : 'Move to Unclaimed'}
        </Button>
      </form>
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
    <div className="mx-auto max-w-3xl">
      <a
        href={back}
        onClick={(e) => {
          e.preventDefault();
          navigate(back);
        }}
        className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-fg-2 hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </a>
      <Async state={state} label="Loading lead…">
        {({ lead, calls }) => {
          const msLeft = lead.expiresAt ? Date.parse(lead.expiresAt) - now : null;
          return (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-medium leading-tight tracking-[-0.03em] sm:text-4xl">{lead.label}</h1>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{lead.status}</Badge>
                  {lead.needsLiveLookup && <Badge tone="muted">Google lead · not confirmed</Badge>}
                  {lead.phoneSource === 'outreach_confirmed' && <Badge tone="ok">Contact confirmed</Badge>}
                  {lead.followUp === 'overdue' && <Badge tone="urgent">Follow-up overdue</Badge>}
                  {lead.followUp === 'today' && <Badge tone="warn">Follow-up today</Badge>}
                  {founder && <Badge tone="muted">{lead.assigneeName ? `Assigned to ${lead.assigneeName}` : 'Unclaimed'}</Badge>}
                </div>
              </div>

              {lead.timerRunning && lead.expiresAt && msLeft !== null && (
                <div className={`rounded-3xl border p-4 ${msLeft <= 3 * 3_600_000 ? 'border-brand bg-brand/10' : 'border-line bg-bg-2'}`}>
                  <Countdown expiresAt={lead.expiresAt} now={now} />
                  <p className="mt-2 text-sm text-fg-2">
                    {msLeft > 0 ? `This lead disappears in ${formatDuration(msLeft)} unless you contact them.` : 'Time is up for this lead.'}
                  </p>
                </div>
              )}

              {lead.needsLiveLookup ? (
                <LiveContact lead={lead} auto={!founder} />
              ) : (
                <Card>
                  <h2 className="text-sm font-medium">Contact</h2>
                  <div className="mt-3 space-y-2 text-sm text-fg-2">
                    {lead.contactPerson && <p className="text-fg">{lead.contactPerson}</p>}
                    {lead.city && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {lead.city}
                      </p>
                    )}
                    {lead.websiteOrInstagram && <p className="break-all">{lead.websiteOrInstagram}</p>}
                  </div>
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-6 text-sm font-medium text-white">
                      <Phone className="h-4 w-4" /> Call {lead.phone}
                    </a>
                  )}
                </Card>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/team/book?lead=${lead.id}`)}>
                  <CalendarPlus className="h-4 w-4" /> Book discovery call
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Edit details
                </Button>
                {founder && (
                  <Button variant="ghost" size="sm" onClick={() => setAssigning(true)}>
                    {lead.assigneeName ? 'Reassign' : 'Assign'}
                  </Button>
                )}
              </div>

              <CallLogger lead={lead} msLeft={lead.timerRunning ? msLeft : null} onLogged={state.reload} />
              {lead.needsLiveLookup && <ConfirmContact lead={lead} onDone={state.reload} />}

              <Card>
                <h2 className="text-sm font-medium">Details</h2>
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {[
                    ['Category', lead.category],
                    ['City / area', lead.city],
                    ['Source', lead.source],
                    ['Service interest', lead.serviceInterest],
                    ['Rating', lead.rating],
                    ['Decision maker', lead.decisionMaker],
                    ['Need', lead.need],
                    ['Next step', lead.nextStep],
                    ['Follow-up', lead.followUpDate ? formatDate(lead.followUpDate) : ''],
                    ['Discovery call', lead.discoveryCallDate ? formatDate(lead.discoveryCallDate) : ''],
                    ['First call', lead.firstCallDate ? formatDate(lead.firstCallDate) : ''],
                    ['Attempts', String(lead.attempts)],
                    ['Added', `${formatDate(lead.dateAdded)}${lead.addedByName ? ` by ${lead.addedByName}` : ''}`],
                    ...(founder
                      ? [
                          ['Deal', lead.dealValue ? `${formatInr(lead.dealValue)} · ${lead.dealType || '—'}` : ''],
                          ['Client paid', lead.clientPaid ? 'Yes' : 'No'],
                          ['Notes', lead.notes],
                        ]
                      : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-fg-3">{k}</dt>
                      <dd className="mt-0.5 whitespace-pre-line text-fg">{v || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              {founder && (
                <Card>
                  <h2 className="text-sm font-medium">Commission</h2>
                  <p className="mt-2 text-sm text-fg-2">
                    Earned {formatInr(lead.commission)} · paid {formatInr(lead.commissionPaid)}
                    {lead.commissionPaidAt && ` on ${formatDate(lead.commissionPaidAt)}`}
                  </p>
                  {lead.commission > lead.commissionPaid && lead.assigneeName && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-4"
                      busy={action.busy}
                      onClick={async () => (await action.run(() => api('POST', `/leads/${lead.id}/commission-paid`))) && state.reload()}
                    >
                      Mark {formatInr(lead.commission - lead.commissionPaid)} paid to {lead.assigneeName}
                    </Button>
                  )}
                  <div className="mt-3">
                    <ErrorText>{action.error}</ErrorText>
                  </div>
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
                        <p className="text-xs text-fg-3">
                          {formatDateTime(c.at)} · {c.by}
                        </p>
                        {c.note && <p className="mt-1 text-sm text-fg-2">{c.note}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              {founder && (
                <div className="pt-2">
                  {!confirmDelete ? (
                    <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-4 w-4" /> Delete lead
                    </Button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fg-2">Delete this lead permanently?</span>
                      <Button
                        variant="primary"
                        size="sm"
                        busy={action.busy}
                        onClick={async () => (await action.run(() => api('DELETE', `/leads/${lead.id}`))) && navigate('/team/leads')}
                      >
                        Delete
                      </Button>
                      <Button variant="quiet" size="sm" onClick={() => setConfirmDelete(false)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <EditLead lead={lead} founder={founder} open={editing} onClose={() => setEditing(false)} onSaved={state.reload} />
              {founder && (
                <AssignDialog leadIds={[lead.id]} open={assigning} onClose={() => setAssigning(false)} onDone={state.reload} requireDeadline={lead.isGoogle} />
              )}
            </div>
          );
        }}
      </Async>
    </div>
  );
}
