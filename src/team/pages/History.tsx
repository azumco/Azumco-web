// Team member: "My leads" — every lead they logged a call on, newest first.
// Laptop: list + detail panel. Phone: reached from Queue (To call ·
// Follow-ups · History); opening one shows the call log in a sheet.
// Unconfirmed leads are "Category · City" (no Google details are stored);
// returned leads show "Returned to founders" and no contact details.

import { useMemo, useState } from 'react';
import { History as HistoryIcon, MessageCircle, Phone, Search, Undo2 } from 'lucide-react';
import { formatDate, formatDateTime } from '../../../shared/time';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, BoxInput, ChoiceChip, Modal, Segmented, StatusPill, Tag, cx } from '../ui';
import Workspace, { DetailPanel, LeadRow, useIsWide } from '../components/Workspace';
import AddOwnLead from '../components/AddOwnLead';
import type { TeamUser } from '../types';

export interface HistoryItem {
  id: string;
  label: string;
  confirmed: boolean;
  status: string;
  returned: boolean;
  lastCallOutcome: string;
  lastCallAt: string;
  nextAction: string;
  contact: { businessName: string; contactPerson: string; phone: string } | null;
}
interface Detail { lead: HistoryItem; calls: { id: string; at: string; outcome: string; note: string; by: string }[] }

const STATUS_CHIPS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'open', label: 'Open', test: (l: HistoryItem) => !l.returned && !['Won', 'Lost'].includes(l.status) },
  { key: 'won', label: 'Won', test: (l: HistoryItem) => l.status === 'Won' },
  { key: 'lost', label: 'Lost', test: (l: HistoryItem) => l.status === 'Lost' },
  { key: 'returned', label: 'Returned', test: (l: HistoryItem) => l.returned },
] as const;
type ChipKey = (typeof STATUS_CHIPS)[number]['key'];
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

function HistoryDetail({ id }: { id: string }) {
  const state = useApi<Detail>(`/leads/history/${id}`);
  return (
    <Async state={state} label="Loading the call log…">
      {({ lead, calls }) => (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-medium tracking-[-0.02em]">{lead.label}</h2>
              <p className="text-xs text-fg-3">{lead.nextAction}</p>
            </div>
            <StatusPill status={lead.status} />
          </div>

          {lead.returned ? (
            <div className="flex items-start gap-3 rounded-2xl bg-bg-3/70 px-4 py-3 text-sm text-fg-2">
              <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />
              Returned to founders. Contact details are no longer shown.
            </div>
          ) : lead.contact ? (
            <div className="rounded-3xl bg-bg-3/40 p-5 @min-[480px]:flex @min-[480px]:items-center @min-[480px]:justify-between @min-[480px]:gap-6">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">Confirmed contact</p>
                <p className="mt-2 truncate text-xl font-medium">{lead.contact.contactPerson || lead.contact.businessName}</p>
                {lead.contact.phone && <p className="mt-1 text-lg tabular-nums">{lead.contact.phone}</p>}
              </div>
              {lead.contact.phone && (
                <div className="mt-4 grid grid-cols-2 gap-2 @min-[480px]:mt-0 @min-[480px]:w-44 @min-[480px]:shrink-0 @min-[480px]:grid-cols-1">
                  <a href={`tel:${lead.contact.phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand text-sm font-medium text-bg"><Phone className="h-4 w-4" /> Call</a>
                  <a href={waLink(lead.contact.phone)} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-2 text-sm"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-bg-3/70 px-4 py-3 text-sm text-fg-2">Contact not confirmed yet. {lead.returned ? '' : 'Open it from your Queue to call.'}</p>
          )}

          {!lead.returned && (
            <button type="button" onClick={() => navigate(`/team/leads/${lead.id}`)} className="text-sm font-medium text-brand">Open the lead →</button>
          )}

          <div>
            <h3 className="text-sm font-medium">Call log{lead.returned ? ' · your calls' : ''}</h3>
            <ol className="mt-3 space-y-4">
              {calls.map((c) => (
                <li key={c.id} className="border-l-2 border-line-2 pl-4">
                  <p className="text-sm text-fg">{c.outcome}</p>
                  <p className="text-xs text-fg-3">{formatDateTime(c.at)} · {c.by}</p>
                  {c.note && <p className="mt-1 text-sm text-fg-2">{c.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Async>
  );
}

export default function History(_props: { user: TeamUser }) {
  const state = useApi<{ leads: HistoryItem[] }>('/leads/history');
  const wide = useIsWide();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<ChipKey>('all');
  const [picked, setPicked] = useState('');
  const [sheet, setSheet] = useState('');
  const leads = state.data?.leads ?? [];
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const test = STATUS_CHIPS.find((c) => c.key === chip)!.test;
    return leads.filter(test).filter((l) => !t || [l.label, l.contact?.contactPerson, l.contact?.phone, l.lastCallOutcome].some((x) => x?.toLowerCase().includes(t)));
  }, [leads, q, chip]);
  const current = shown.some((l) => l.id === picked) ? picked : shown[0]?.id ?? '';
  const open = (id: string) => (wide ? setPicked(id) : setSheet(id));

  const header = (
    <div className="mb-6 space-y-4">
      <div>
        <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
          My <span className="font-serif font-normal italic tracking-normal text-brand">leads</span>
        </h1>
        <p className="mt-1 text-fg-2">Every lead you've logged a call on, newest first.</p>
        <AddOwnLead className="mt-4" />
      </div>
      <Segmented className="md:hidden" options={[{ value: 'call', label: 'To call' }, { value: 'followups', label: 'Follow-ups' }, { value: 'history', label: 'History' }]} value="history" onChange={(v) => v === 'call' ? navigate('/team') : v === 'followups' && navigate('/team/followups')} />
      <BoxInput aria-label="Search your leads" placeholder="Search business, contact, phone or outcome" value={q} onChange={(e) => setQ(e.target.value)} icon={<Search className="h-4 w-4 text-fg-3" />} />
      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <ChoiceChip key={c.key} on={chip === c.key} onClick={() => setChip(c.key)}>{c.label} · {leads.filter(c.test).length}</ChoiceChip>
        ))}
      </div>
    </div>
  );

  return (
    <Async state={state} label="Loading your leads…">
      {() => (
        <>
          <Workspace
            header={header}
            list={
              shown.length === 0 ? (
                <div className="rounded-3xl border border-line bg-bg-2 px-6 py-10 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-3 text-fg-3"><HistoryIcon className="h-5 w-5" /></span>
                  <p className="mt-4 font-medium">{leads.length ? 'Nothing matches' : 'No history yet'}</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-fg-3">{leads.length ? 'Try another filter or clear the search.' : 'Leads you log a call on show up here, even after they go back to the founders.'}</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {shown.map((l) => (
                    <LeadRow
                      key={l.id}
                      title={l.label}
                      sub={<>{[l.lastCallOutcome, l.lastCallAt && formatDate(l.lastCallAt).slice(0, 6)].filter(Boolean).join(' · ')}<span className={cx('block truncate', l.returned ? 'text-fg-3' : 'text-fg-2')}>{l.nextAction}</span></>}
                      right={l.returned ? <Tag dot={false}>Returned</Tag> : <StatusPill status={l.status} />}
                      selected={wide && current === l.id}
                      onOpen={() => open(l.id)}
                    />
                  ))}
                </ul>
              )
            }
            detail={current ? <DetailPanel><HistoryDetail key={current} id={current} /></DetailPanel> : null}
            empty={<section className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-line-2 px-6 text-center text-sm text-fg-3">Pick a lead to see its call log.</section>}
          />
          {sheet && (
            <Modal title="Lead" accent="history" open onClose={() => setSheet('')}>
              <div className="@container"><HistoryDetail id={sheet} /></div>
            </Modal>
          )}
        </>
      )}
    </Async>
  );
}
