// Team member: "Google check" (Figma: Lead check · Member side, D1/D2, M1/M2).
// Lead cards on the left and, from 1100px, the selected lead's check on the
// right. On phones a card opens the lead's check as its own screen.

import { useMemo, useState } from 'react';
import { ArrowLeft, Search, Store } from 'lucide-react';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, ChoiceChip, Loading, LoadError, Segmented } from '../ui';
import Workspace, { DetailPanel, useIsWide } from '../components/Workspace';
import AddOwnLead from '../components/AddOwnLead';
import MemberCheckPanel, { subline } from '../components/leadcheck/MemberCheckPanel';
import { AllowanceLine, LeadCard, LeadPill } from '../components/leadcheck/parts';
import { ALLOWANCE_PATH, canRunLeadCheck, checkPath, type Allowance } from '../leadCheck';
import type { Lead, LeadsResponse, TeamUser } from '../types';

type ChipKey = 'mine' | 'unchecked' | 'review' | 'missing' | 'all';
const title = (l: Lead) => l.businessName || [l.category, l.city].filter(Boolean).join(' · ') || l.label;

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-h-12 min-w-0 items-center gap-2 rounded-full border border-line-2 bg-bg-2 px-4 focus-within:border-brand">
      <Search className="h-4 w-4 shrink-0 text-fg-3" />
      <input aria-label="Search your leads" placeholder="Search your leads" value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-fg outline-none placeholder:text-fg-3" />
    </label>
  );
}

const MobileSwitch = () => (
  <Segmented
    className="md:hidden"
    options={[{ value: 'call', label: 'To call' }, { value: 'history', label: 'History' }, { value: 'google', label: 'Google' }]}
    value="google"
    onChange={(v) => navigate(v === 'call' ? '/team' : v === 'history' ? '/team/history' : '/team/leads')}
  />
);

export default function MemberLeadCheck({ user }: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const allowanceState = useApi<Allowance>(ALLOWANCE_PATH);
  const allowance = allowanceState.data ?? undefined;
  const wide = useIsWide();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<ChipKey>('mine');
  const [picked, setPicked] = useState('');
  const leads = state.data?.leads ?? [];
  const mineCount = leads.filter((l) => canRunLeadCheck(user, l)).length;

  const CHIPS: { key: ChipKey; label: string; test: (l: Lead) => boolean }[] = [
    { key: 'mine', label: 'Added by you', test: (l) => canRunLeadCheck(user, l) },
    { key: 'unchecked', label: 'Not checked', test: (l) => canRunLeadCheck(user, l) && !l.googleCheck.status },
    { key: 'review', label: 'Needs review', test: (l) => l.origin === 'team' && (l.googleCheck.status === 'needs_review' || l.googleCheck.status === 'pick') },
    { key: 'missing', label: 'Not on Google', test: (l) => l.origin === 'team' && (l.googleCheck.status === 'not_found' || l.googleCheck.status === 'not_on_google') },
    { key: 'all', label: 'All', test: () => true },
  ];
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const test = CHIPS.find((c) => c.key === chip)!.test;
    return leads
      .filter(test)
      .filter((l) => !t || [l.label, l.businessName, l.city, l.area, l.category, l.phone].some((x) => x?.toLowerCase().includes(t)))
      .sort((a, b) => Number(!canRunLeadCheck(user, a)) - Number(!canRunLeadCheck(user, b)) || Number(a.origin === 'find_clients') - Number(b.origin === 'find_clients') || b.dateAdded.localeCompare(a.dateAdded));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, q, chip]);
  const current = shown.find((l) => l.id === picked) ?? shown[0];
  const reload = () => {
    void state.reload();
    void allowanceState.reload();
  };

  const header = (
    <div className="mb-6 space-y-4">
      <MobileSwitch />
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
            Google <span className="font-serif font-normal italic tracking-normal text-brand">check</span>
          </h1>
          <p className="mt-1 hidden text-fg-2 md:block">Check the leads you added against Google Maps.</p>
        </div>
        <div className="hidden shrink-0 md:block"><AddOwnLead /></div>
      </div>
      <AllowanceLine allowance={allowance} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="lg:w-[300px] lg:shrink-0"><SearchBox value={q} onChange={setQ} /></div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {CHIPS.map((c) => (
            <ChoiceChip key={c.key} on={chip === c.key} onClick={() => setChip(c.key)} className="shrink-0">{c.label} · {leads.filter(c.test).length}</ChoiceChip>
          ))}
        </div>
      </div>
    </div>
  );

  const noneOfYours = (
    <section className="flex flex-col items-center rounded-3xl border border-line bg-bg-2 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/12 text-brand"><Store className="h-6 w-6" /></span>
      <p className="mt-5 text-lg font-medium">No leads of yours yet</p>
      <p className="mt-1 max-w-sm text-sm text-fg-2">Leads you add yourself show up here, so you can check them against Google.</p>
      <AddOwnLead primary className="mt-6" />
    </section>
  );

  return (
    <Async state={state} label="Loading your leads…">
      {() =>
        chip === 'mine' && mineCount === 0 && !q ? (
          <div>{header}{noneOfYours}</div>
        ) : (
          <Workspace
            header={header}
            list={
              shown.length === 0 ? (
                <div className="rounded-3xl border border-line bg-bg-2 px-6 py-10 text-center">
                  <p className="font-medium">Nothing here</p>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-fg-3">Try another filter or clear the search.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {shown.map((l) => (
                    <LeadCard
                      key={l.id}
                      title={title(l)}
                      sub={subline(l, user)}
                      pill={<LeadPill lead={l} />}
                      muted={l.origin === 'find_clients'}
                      selected={wide && current?.id === l.id}
                      onOpen={() => (wide ? setPicked(l.id) : navigate(checkPath(l.id)))}
                    />
                  ))}
                </ul>
              )
            }
            detail={current ? <DetailPanel><MemberCheckPanel key={current.id} lead={current} user={user} allowance={allowance} layout="panel" onChanged={reload} /></DetailPanel> : null}
            empty={<section className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-line-2 px-6 text-center text-sm text-fg-3">Pick a lead to see its Google check.</section>}
          />
        )
      }
    </Async>
  );
}

/** Phones (and direct links): one lead's check as its own screen with a sticky action bar. */
export function MemberCheckScreen({ id, user }: { id: string; user: TeamUser }) {
  const state = useApi<{ lead: Lead }>(`/leads/${id}`);
  const allowanceState = useApi<Allowance>(ALLOWANCE_PATH);
  const lead = state.data?.lead;
  if (state.error) return <LoadError message={state.error.message} onRetry={state.reload} />;
  if (!lead) return <Loading label="Loading the lead…" />;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <a href="/team/leads" onClick={(e) => { e.preventDefault(); navigate('/team/leads'); }} aria-label="Back to Google check" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
        </a>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-medium tracking-[-0.02em]">{lead.businessName || lead.label}</h1>
          <p className="truncate text-sm text-fg-3">{subline(lead, user)}</p>
        </div>
      </div>
      <MemberCheckPanel lead={lead} user={user} allowance={allowanceState.data ?? undefined} layout="screen" onChanged={() => { void state.reload(); void allowanceState.reload(); }} />
    </div>
  );
}
