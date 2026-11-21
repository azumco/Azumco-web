// Founders: all leads. Search, filter chips with live counts, a table on
// desktop and stacked cards on phones, add-lead and assign.

import { useMemo, useState, type FormEvent } from 'react';
import { Download, Search } from 'lucide-react';
import { BUSINESS_CATEGORIES, LEAD_SOURCES } from '../../../shared/rules';
import { formatDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi, useServerNow } from '../hooks';
import { navigate } from '../router';
import { Async, Avatar, BoxInput, Button, ChipGroup, ChoiceChip, Countdown, Empty, ErrorText, Field, Modal, SearchableSelect, StatusPill, cx } from '../ui';
import AssignDialog from '../components/AssignDialog';
import type { Lead, LeadsResponse, TeamMember } from '../types';

type View = 'all' | 'new' | 'contacted' | 'won' | 'unclaimed' | 'due';
const VIEWS: { key: View; label: string; test: (l: Lead) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'new', label: 'New', test: (l) => l.status === 'New' },
  { key: 'contacted', label: 'Contacted', test: (l) => l.status === 'Contacted' },
  { key: 'won', label: 'Won', test: (l) => l.status === 'Won' },
  { key: 'unclaimed', label: 'Unclaimed', test: (l) => !l.assignedTo },
  { key: 'due', label: 'Due today', test: (l) => l.followUp === 'today' || l.followUp === 'overdue' },
];

const MANUAL_SOURCES = LEAD_SOURCES.filter((s) => s !== 'Google Places');

export function leadSubline(l: Lead): string {
  if (l.needsLiveLookup) return 'Google lead · not confirmed yet';
  return [l.city, l.phoneSource === 'outreach_confirmed' ? 'contact confirmed' : ''].filter(Boolean).join(' · ') || '—';
}

function Rating({ value }: { value: string }) {
  if (!value) return <span className="text-fg-3">—</span>;
  const color = value === 'Good' ? 'bg-good' : value === 'Intermediate' ? 'bg-warn' : 'bg-bad';
  return (
    <span className="inline-flex items-center gap-2 text-sm text-fg-2">
      <span className={cx('h-2 w-2 rounded-full', color)} /> {value}
    </span>
  );
}

function FollowUpCell({ l, now }: { l: Lead; now: number }) {
  if (l.timerRunning) return <Countdown expiresAt={l.expiresAt} now={now} />;
  if (l.followUp === 'today') return <span className="text-sm font-medium text-brand">Today</span>;
  if (l.followUp === 'overdue') return <span className="text-sm font-medium text-bad">Overdue · {formatDate(l.followUpDate).slice(0, 6)}</span>;
  if (l.followUp === 'upcoming') return <span className="text-sm text-fg-2">{formatDate(l.followUpDate).slice(0, 6)}</span>;
  if (l.assignedTo && !l.contacted) return <Countdown expiresAt={null} now={now} />;
  return <span className="text-fg-3">—</span>;
}

function sourceLabel(s: string) {
  return s === 'Google Places' ? 'Google' : s || '—';
}

function AddLead({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const blank = { businessName: '', category: '', contactPerson: '', phone: '', city: '', websiteOrInstagram: '', source: '', serviceInterest: '' };
  const [f, setF] = useState(blank);
  const [assignTo, setAssignTo] = useState('');
  const [hours, setHours] = useState('none');
  const team = useApi<{ users: TeamMember[] }>(open ? '/team' : null);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => api<{ id: string }>('POST', '/leads', { ...f, ...(assignTo ? { assignTo, ...(hours !== 'none' ? { deadlineHours: Number(hours) } : {}) } : {}) }));
    if (r) {
      setF(blank);
      onSaved(r.id);
    }
  };

  return (
    <Modal title="Add a" accent="lead" open={open} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Business name" required value={f.businessName} onChange={set('businessName')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <SearchableSelect label="Business type" value={f.category} options={BUSINESS_CATEGORIES} allowCustom onChange={(v) => setF({ ...f, category: v })} />
          <Field label="City / area" value={f.city} onChange={set('city')} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact person" value={f.contactPerson} onChange={set('contactPerson')} />
          <Field label="Phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
        </div>
        <Field label="Website / Instagram" value={f.websiteOrInstagram} onChange={set('websiteOrInstagram')} />
        <ChipGroup label="Source" options={MANUAL_SOURCES} value={f.source as (typeof MANUAL_SOURCES)[number] | ''} onChange={(v) => setF({ ...f, source: v })} />
        <Field label="Service interest" value={f.serviceInterest} onChange={set('serviceInterest')} />
        <ChipGroup label="Assign to" options={[{ value: '', label: 'Nobody yet' }, ...(team.data?.users ?? []).filter((u) => u.canReceiveLeads).map((u) => ({ value: u.id, label: u.name.split(' ')[0] }))]} value={assignTo} onChange={setAssignTo} required />
        {assignTo && (
          <ChipGroup
            label="Deadline"
            options={[{ value: 'none', label: 'No deadline' }, { value: '12', label: '12 hours' }, { value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }]}
            value={hours}
            onChange={(v) => setHours(v || 'none')}
            required
          />
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Add lead
        </Button>
      </form>
    </Modal>
  );
}

export default function Leads() {
  const params = new URLSearchParams(window.location.search);
  const state = useApi<LeadsResponse>('/leads');
  const now = useServerNow(state.data?.serverNow);
  const [view, setView] = useState<View>((VIEWS.find((v) => v.key === params.get('view'))?.key as View) ?? 'all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(params.get('add') === '1');
  const [assigning, setAssigning] = useState<Lead[] | null>(null);

  const leads = state.data?.leads ?? [];
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return leads
      .filter(VIEWS.find((v) => v.key === view)!.test)
      .filter((l) => !t || [l.label, l.city, l.category, l.contactPerson, l.phone].some((x) => x?.toLowerCase().includes(t)))
      .sort((a, b) => (a.expiresAt ?? '9').localeCompare(b.expiresAt ?? '9') || b.dateAdded.localeCompare(a.dateAdded));
  }, [leads, view, q]);

  const open = (id: string) => navigate(`/team/leads/${id}`);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-medium tracking-[-0.035em] sm:text-[2.6rem]">
          Leads <span className="font-serif font-normal italic tracking-normal text-brand">{leads.length || ''}</span>
        </h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <BoxInput aria-label="Search leads" placeholder="Search business, phone or city" value={q} onChange={(e) => setQ(e.target.value)} icon={<Search className="h-4 w-4 text-fg-3" />} className="sm:w-80" />
          <div className="flex gap-2">
            <a href="/api/leads/export.csv" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-2 px-4 text-sm hover:border-fg/40">
              <Download className="h-4 w-4" /> CSV
            </a>
            <Button onClick={() => setAdding(true)}>Add lead</Button>
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <ChoiceChip key={v.key} on={view === v.key} onClick={() => setView(v.key)}>
            {v.label} · {leads.filter(v.test).length}
          </ChoiceChip>
        ))}
      </div>

      <Async state={state} label="Loading leads…">
        {() =>
          shown.length === 0 ? (
            <Empty
              title={leads.length === 0 ? 'No leads yet' : 'Nothing in this view'}
              action={leads.length === 0 ? <Button onClick={() => navigate('/team/find')}>Find clients</Button> : undefined}
            >
              {leads.length === 0 ? 'Add a lead by hand, or find local businesses on Google.' : 'Try another filter or clear the search.'}
            </Empty>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-3xl border border-line bg-bg-2 md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-[0.16em] text-fg-3">
                      <th className="px-5 py-4 font-normal">Business</th>
                      <th className="px-3 py-4 font-normal">Status</th>
                      <th className="px-3 py-4 font-normal">Rating</th>
                      <th className="px-3 py-4 font-normal">Assigned to</th>
                      <th className="px-3 py-4 font-normal">Follow-up / timer</th>
                      <th className="px-5 py-4 font-normal">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((l) => (
                      <tr key={l.id} onClick={() => open(l.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-bg-3/50">
                        <td className="px-5 py-3.5">
                          <a href={`/team/leads/${l.id}`} onClick={(e) => { e.preventDefault(); open(l.id); }} className="block text-fg">
                            {l.label}
                          </a>
                          <span className="text-xs text-fg-3">{leadSubline(l)}</span>
                        </td>
                        <td className="px-3 py-3.5"><StatusPill status={l.status} /></td>
                        <td className="px-3 py-3.5"><Rating value={l.rating} /></td>
                        <td className="px-3 py-3.5">
                          {l.assignedTo ? (
                            <span className="inline-flex items-center gap-2 text-sm"><Avatar name={l.assigneeName} />{l.assigneeName.split(' ')[0]}</span>
                          ) : (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setAssigning([l]); }} className="min-h-9 rounded-full border border-brand px-3.5 text-sm text-brand hover:bg-brand/10">
                              Assign
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3.5"><FollowUpCell l={l} now={now} /></td>
                        <td className="px-5 py-3.5 text-sm text-fg-2">{sourceLabel(l.source)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="space-y-2 md:hidden">
                {shown.map((l) => (
                  <li key={l.id} className="rounded-3xl border border-line bg-bg-2 p-4">
                    <a href={`/team/leads/${l.id}`} onClick={(e) => { e.preventDefault(); open(l.id); }} className="block">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-fg">{l.label}</p>
                          <p className="text-xs text-fg-3">{leadSubline(l)}</p>
                        </div>
                        <StatusPill status={l.status} />
                      </div>
                    </a>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      {l.assignedTo ? (
                        <span className="inline-flex items-center gap-2"><Avatar name={l.assigneeName} />{l.assigneeName.split(' ')[0]}</span>
                      ) : (
                        <button type="button" onClick={() => setAssigning([l])} className="min-h-11 rounded-full border border-brand px-4 text-sm text-brand">Assign</button>
                      )}
                      <FollowUpCell l={l} now={now} />
                      <Rating value={l.rating} />
                      <span className="ml-auto text-xs text-fg-3">{sourceLabel(l.source)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {shown.some((l) => l.needsLiveLookup) && (
                <p className="mt-4 text-xs text-fg-3">Google leads show only category and city until the contact is confirmed. Google's terms don't allow saving their details before that.</p>
              )}
            </>
          )
        }
      </Async>

      <AddLead open={adding} onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); navigate(`/team/leads/${id}`); }} />
      {assigning && (
        <AssignDialog
          leadIds={assigning.map((l) => l.id)}
          open
          requireDeadline={assigning.some((l) => l.isGoogle)}
          onClose={() => setAssigning(null)}
          onDone={() => void state.reload()}
        />
      )}
    </div>
  );
}
