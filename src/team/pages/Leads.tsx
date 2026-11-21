// Founders: every lead, with Unclaimed / Assigned / Follow-up views, bulk
// assign, add-lead and CSV export.

import { useMemo, useState, type FormEvent } from 'react';
import { Download, Plus, Search } from 'lucide-react';
import { BUSINESS_CATEGORIES, LEAD_SOURCES, LEAD_STATUSES } from '../../../shared/rules';
import { api } from '../api';
import { useAction, useApi, useServerNow } from '../hooks';
import { navigate } from '../router';
import { Async, Button, Chip, Empty, ErrorText, Field, Modal, PageHeader, Select, Toggle } from '../ui';
import LeadCard from '../components/LeadCard';
import { AssignDialog } from './LeadDetail';
import type { Lead, LeadsResponse, TeamMember, TeamUser } from '../types';

type View = 'all' | 'unclaimed' | 'assigned' | 'followups' | 'won';

const VIEWS: { key: View; label: string; test: (l: Lead) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'unclaimed', label: 'Unclaimed', test: (l) => !l.assignedTo },
  { key: 'assigned', label: 'Assigned', test: (l) => Boolean(l.assignedTo) },
  { key: 'followups', label: 'Follow-ups due', test: (l) => l.followUp === 'overdue' || l.followUp === 'today' },
  { key: 'won', label: 'Won', test: (l) => l.status === 'Won' },
];

function AddLead({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const empty = { businessName: '', category: '', contactPerson: '', phone: '', city: '', websiteOrInstagram: '', source: '', serviceInterest: '' };
  const [f, setF] = useState(empty);
  const [assignTo, setAssignTo] = useState('');
  const [deadline, setDeadline] = useState(false);
  const [hours, setHours] = useState('24');
  const team = useApi<{ users: TeamMember[] }>(open ? '/team' : null);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() =>
      api<{ id: string }>('POST', '/leads', { ...f, ...(assignTo ? { assignTo, ...(deadline ? { deadlineHours: Number(hours) } : {}) } : {}) }),
    );
    if (r) {
      setF(empty);
      onSaved(r.id);
    }
  };

  return (
    <Modal title="Add a lead" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Business name" required value={f.businessName} onChange={set('businessName')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" list="lead-categories" value={f.category} onChange={set('category')} />
          <Field label="City / area" value={f.city} onChange={set('city')} />
        </div>
        <datalist id="lead-categories">
          {BUSINESS_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact person" value={f.contactPerson} onChange={set('contactPerson')} />
          <Field label="Phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} hint="India by default; use +code for other countries." />
        </div>
        <Field label="Website / Instagram" value={f.websiteOrInstagram} onChange={set('websiteOrInstagram')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Source" value={f.source} onChange={set('source')} options={['', ...LEAD_SOURCES.filter((s) => s !== 'Google Places')]} />
          <Field label="Service interest" value={f.serviceInterest} onChange={set('serviceInterest')} />
        </div>
        <Select
          label="Assign to"
          value={assignTo}
          onChange={(e) => setAssignTo(e.target.value)}
          options={[{ value: '', label: 'Nobody yet' }, ...(team.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))]}
        />
        {assignTo && (
          <>
            <Toggle label="Give a deadline" hint="Returns to Unclaimed if not contacted in time." checked={deadline} onChange={setDeadline} />
            {deadline && <Select label="Contact within" value={hours} onChange={(e) => setHours(e.target.value)} options={[{ value: '12', label: '12 hours' }, { value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }]} />}
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Add lead
        </Button>
      </form>
    </Modal>
  );
}

export default function Leads(_props: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const now = useServerNow(state.data?.serverNow);
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const filtered = useMemo(() => {
    const leads = state.data?.leads ?? [];
    const q = query.trim().toLowerCase();
    const test = VIEWS.find((v) => v.key === view)!.test;
    return leads
      .filter(test)
      .filter((l) => !status || l.status === status)
      .filter((l) => !q || [l.label, l.city, l.category, l.contactPerson, l.phone, l.assigneeName].some((x) => x?.toLowerCase().includes(q)))
      .sort((a, b) => {
        // Overdue follow-ups first, then running timers by soonest expiry, then newest.
        const rank = (l: Lead) => (l.followUp === 'overdue' ? 0 : l.followUp === 'today' ? 1 : 2);
        return rank(a) - rank(b) || (a.expiresAt ?? '9').localeCompare(b.expiresAt ?? '9') || b.dateAdded.localeCompare(a.dateAdded);
      });
  }, [state.data, view, query, status]);

  const selectedLeads = (state.data?.leads ?? []).filter((l) => selected.has(l.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <div>
      <PageHeader eyebrow="Pipeline" title="All" accent="leads">
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add lead
        </Button>
        <a href="/api/leads/export.csv" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-2 px-4 text-sm text-fg hover:border-fg/40">
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const count = (state.data?.leads ?? []).filter(v.test).length;
          return (
            <Chip key={v.key} selected={view === v.key} onClick={() => setView(v.key)}>
              {v.label}
              {state.data && <span className="ml-1.5 text-fg-3">{count}</span>}
            </Chip>
          );
        })}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_220px]">
        <label className="relative block">
          <span className="sr-only">Search leads</span>
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input className="w-full border-b border-line-2 bg-transparent py-3 pl-7 text-fg placeholder:text-fg-3 outline-none focus:border-brand" placeholder="Search name, city, phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'Any status' }, ...LEAD_STATUSES]} />
      </div>

      {selected.size > 0 && (
        <div className="sticky top-20 z-40 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-brand/50 bg-bg-2/95 p-3 pl-5 backdrop-blur">
          <span className="text-sm">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAssigning(true)}>
              Assign
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Async state={state} label="Loading leads…">
        {() =>
          filtered.length === 0 ? (
            <Empty title={view === 'unclaimed' ? 'Nothing unclaimed' : 'No leads here'}>
              {view === 'all' ? 'Add a lead or import some from Find clients.' : 'Try another view.'}
            </Empty>
          ) : (
            <div className="space-y-3">
              {filtered.map((l) => (
                <LeadCard key={l.id} lead={l} now={now} showAssignee selected={selected.has(l.id)} onSelect={(on) => toggle(l.id, on)} />
              ))}
            </div>
          )
        }
      </Async>

      <AddLead
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(id) => {
          setAdding(false);
          navigate(`/team/leads/${id}`);
        }}
      />
      <AssignDialog
        leadIds={[...selected]}
        open={assigning}
        onClose={() => setAssigning(false)}
        requireDeadline={selectedLeads.some((l) => l.isGoogle)}
        onDone={() => {
          setSelected(new Set());
          void state.reload();
        }}
      />
    </div>
  );
}
