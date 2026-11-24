// Team member: "Google check", in the same workspace as Queue and My leads —
// lead cards on the left and, from 1100px, the selected lead's check on the
// right. Only leads this person added can be checked (once a week per lead,
// within their monthly allowance); opening one shows the full check screen.

import { useMemo, useState } from 'react';
import { Info, MapPin, Search } from 'lucide-react';
import { CHECK_FIELDS, CHECK_FIELD_LABEL, type FieldCode } from '../../../shared/leadCheck';
import { formatDate, formatDateTime } from '../../../shared/time';
import { ApiError } from '../api';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, BoxInput, Button, ChoiceChip, ErrorText, Segmented, Tag } from '../ui';
import Workspace, { DetailPanel, LeadRow, useIsWide } from '../components/Workspace';
import AddOwnLead from '../components/AddOwnLead';
import { CheckTag } from '../components/LeadCheckList';
import { ALLOWANCE_PATH, canRunLeadCheck, checkMeta, checkPath, checksLeft, leftText, runCheck, type Allowance } from '../leadCheck';
import type { Lead, LeadsResponse, TeamUser } from '../types';

type ChipKey = 'mine' | 'unchecked' | 'review' | 'missing' | 'all';

const CODE: Record<FieldCode, { label: string; tone: 'good' | 'warn' | 'info' | 'muted' }> = {
  same: { label: 'Same', tone: 'good' },
  different: { label: 'Different', tone: 'warn' },
  google_only: { label: 'Only on Google', tone: 'info' },
  ours_only: { label: 'Only ours', tone: 'muted' },
  empty: { label: '—', tone: 'muted' },
};

const title = (l: Lead) => l.businessName || [l.category, l.city].filter(Boolean).join(' · ') || l.label;

function CheckPanel({ lead, user, allowance, onChecked }: { lead: Lead; user: TeamUser; allowance?: Allowance; onChecked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = canRunLeadCheck(user, lead);
  const gc = lead.googleCheck;
  const meta = checkMeta(lead);

  const check = async () => {
    setBusy(true);
    setError('');
    try {
      await runCheck(lead.id);
      onChecked();
      navigate(checkPath(lead.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check this lead. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-medium tracking-[-0.02em]">{title(lead)}</h2>
          <p className="text-xs text-fg-3">{[lead.category, [lead.area, lead.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <CheckTag lead={lead} />
      </div>

      {lead.origin === 'find_clients' ? (
        <p className="flex items-start gap-3 rounded-2xl bg-bg-3/70 px-4 py-3 text-sm text-fg-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />This lead came from Find clients, so it already comes from Google.</p>
      ) : !mine ? (
        <p className="flex items-start gap-3 rounded-2xl bg-bg-3/70 px-4 py-3 text-sm text-fg-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />A founder gave you this lead. You can check the leads you added yourself.</p>
      ) : null}

      {gc.fields ? (
        <ul className="grid gap-2 @min-[520px]:grid-cols-2">
          {CHECK_FIELDS.map((f) => (
            <li key={f} className="flex items-center justify-between gap-3 rounded-2xl bg-bg-3/50 px-4 py-3 text-sm">
              <span className="text-fg-2">{CHECK_FIELD_LABEL[f]}</span>
              <Tag tone={CODE[gc.fields![f]].tone} dot={gc.fields![f] !== 'empty'}>{CODE[gc.fields![f]].label}</Tag>
            </li>
          ))}
        </ul>
      ) : mine && !gc.status ? (
        <div className="rounded-3xl bg-bg-3/40 p-5">
          <p className="font-medium">Not checked yet</p>
          <p className="mt-1 text-sm text-fg-2">We search Google by the name, area and city you added and show you what's different.</p>
        </div>
      ) : null}

      {gc.checkedAt && <p className="text-xs text-fg-3">Last checked {formatDateTime(gc.checkedAt)}{gc.checkedByName ? ` by ${gc.checkedByName}` : ''}.</p>}

      {mine && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {gc.status ? (
              <Button onClick={() => navigate(checkPath(lead.id))}>{meta.action === 'Check' ? 'Open' : meta.action}</Button>
            ) : (
              <Button busy={busy} disabled={checksLeft(allowance) <= 0} onClick={check}><Search className="h-4 w-4" /> Check with Google</Button>
            )}
          </div>
          {!gc.status && <p className="text-xs text-fg-3">Uses 1 of your checks{allowance ? ` · ${leftText(allowance)}` : ''}.</p>}
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <button type="button" onClick={() => navigate(`/team/leads/${lead.id}`)} className="text-sm font-medium text-brand">Open the lead →</button>
    </div>
  );
}

export default function MemberLeadCheck({ user }: { user: TeamUser }) {
  const state = useApi<LeadsResponse>('/leads');
  const allowanceState = useApi<Allowance>(ALLOWANCE_PATH);
  const allowance = allowanceState.data ?? undefined;
  const wide = useIsWide();
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<ChipKey>('mine');
  const [picked, setPicked] = useState('');
  const leads = state.data?.leads ?? [];

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
      .sort((a, b) => Number(!canRunLeadCheck(user, a)) - Number(!canRunLeadCheck(user, b)) || b.dateAdded.localeCompare(a.dateAdded));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, q, chip]);
  const current = shown.some((l) => l.id === picked) ? picked : shown[0]?.id ?? '';
  const open = (l: Lead) => {
    if (wide) setPicked(l.id);
    else navigate(canRunLeadCheck(user, l) ? checkPath(l.id) : `/team/leads/${l.id}`);
  };
  const reload = () => {
    void state.reload();
    void allowanceState.reload();
  };

  const header = (
    <div className="mb-6 space-y-4">
      <div>
        <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
          Google <span className="font-serif font-normal italic tracking-normal text-brand">check</span>
        </h1>
        <p className="mt-1 text-fg-2">Check the leads you added against Google Maps.</p>
        <AddOwnLead className="mt-4" />
      </div>
      <Segmented
        className="md:hidden"
        options={[{ value: 'call', label: 'To call' }, { value: 'history', label: 'History' }, { value: 'google', label: 'Google' }]}
        value="google"
        onChange={(v) => navigate(v === 'call' ? '/team' : '/team/history')}
      />
      <p className="flex items-start gap-3 rounded-2xl bg-bg-3/70 px-4 py-3 text-sm text-fg-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />
        <span>Each lead can be checked once every {allowance?.cooldownDays ?? 7} days.{allowance ? ` ${leftText(allowance)}.` : ''}</span>
      </p>
      <BoxInput aria-label="Search your leads" placeholder="Search business, phone or city" value={q} onChange={(e) => setQ(e.target.value)} icon={<Search className="h-4 w-4 text-fg-3" />} />
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <ChoiceChip key={c.key} on={chip === c.key} onClick={() => setChip(c.key)}>{c.label} · {leads.filter(c.test).length}</ChoiceChip>
        ))}
      </div>
    </div>
  );

  return (
    <Async state={state} label="Loading your leads…">
      {() => (
        <Workspace
          header={header}
          list={
            shown.length === 0 ? (
              <div className="rounded-3xl border border-line bg-bg-2 px-6 py-10 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-3 text-fg-3"><MapPin className="h-5 w-5" /></span>
                <p className="mt-4 font-medium">{leads.some((l) => canRunLeadCheck(user, l)) ? 'Nothing here' : 'No leads of yours yet'}</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-fg-3">{leads.some((l) => canRunLeadCheck(user, l)) ? 'Try another filter or clear the search.' : 'Add a lead you found yourself, then check it against Google here.'}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {shown.map((l) => (
                  <LeadRow
                    key={l.id}
                    title={title(l)}
                    sub={[canRunLeadCheck(user, l) ? 'Added by you' : l.origin === 'find_clients' ? 'Find clients' : l.addedByName ? `From ${l.addedByName.split(' ')[0]}` : '', l.city, l.googleCheck.checkedAt && `checked ${formatDate(l.googleCheck.checkedAt).slice(0, 6)}`].filter(Boolean).join(' · ')}
                    right={<CheckTag lead={l} />}
                    selected={wide && current === l.id}
                    onOpen={() => open(l)}
                  />
                ))}
              </ul>
            )
          }
          detail={current ? <DetailPanel><CheckPanel key={current} lead={shown.find((l) => l.id === current)!} user={user} allowance={allowance} onChecked={reload} /></DetailPanel> : null}
          empty={<section className="flex min-h-72 items-center justify-center rounded-3xl border border-dashed border-line-2 px-6 text-center text-sm text-fg-3">Pick a lead to see its Google check.</section>}
        />
      )}
    </Async>
  );
}
