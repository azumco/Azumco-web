// Leads → "Google check": which leads the team added match their Google Maps
// listing. Only leads added by a person can be checked (and ticked); leads from
// Find clients already come from Google and show a "From Find clients" tag.
// Founders can check any of them; a team member only the leads they added,
// once a week per lead and within their monthly allowance. Checks run one at a
// time (single or bulk); each uses 1 Google call.

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Info, MapPin, Search } from 'lucide-react';
import { ApiError } from '../api';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Avatar, Button, Checkbox, ChoiceChip, Empty, ErrorText, Tag, cx } from '../ui';
import { ALLOWANCE_PATH, CHECK_FILTERS, canRunLeadCheck, checkMeta, checkPath, checksLeft, leftText, runCheck, type Allowance, type CheckFilter } from '../leadCheck';
import type { Lead, TeamUser } from '../types';

const ICONS = { check: Check, warn: AlertTriangle, search: Search, pin: MapPin, none: null } as const;

export function CheckTag({ lead }: { lead: Pick<Lead, 'origin' | 'googleCheck'> }) {
  const m = checkMeta(lead);
  const Icon = ICONS[m.icon];
  return (
    <Tag tone={m.tone} dot={false}>
      {Icon && <Icon className="h-3 w-3" />}
      {m.label}
    </Tag>
  );
}

interface Bulk { total: number; done: number; running: boolean; stopped: string; failed: number; recent: number }

export default function LeadCheckList({ leads, user, onChanged, q }: { leads: Lead[]; user: TeamUser; onChanged: () => void; q: string }) {
  const status = useApi<Allowance>(ALLOWANCE_PATH);
  const usage = status.data ?? undefined;
  const left = checksLeft(usage);
  const founder = Boolean(usage?.unlimited);
  const [filter, setFilter] = useState<CheckFilter>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Bulk | null>(null);
  const [rowError, setRowError] = useState('');

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return leads
      .filter(CHECK_FILTERS.find((f) => f.key === filter)!.test)
      .filter((l) => !t || [l.label, l.businessName, l.city, l.area, l.category, l.phone].some((x) => x?.toLowerCase().includes(t)))
      .sort((a, b) => Number(a.origin === 'find_clients') - Number(b.origin === 'find_clients') || b.dateAdded.localeCompare(a.dateAdded));
  }, [leads, filter, q]);

  const checkable = (l: Lead) => canRunLeadCheck(user, l);
  const anyCheckable = leads.some(checkable);
  const toggle = (id: string, on: boolean) => setPicked((p) => {
    const n = new Set(p);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  });
  const visibleCheckable = shown.filter(checkable);
  const allOn = visibleCheckable.length > 0 && visibleCheckable.every((l) => picked.has(l.id));

  const open = (l: Lead) => navigate(checkPath(l.id));

  /** One at a time; stops cleanly at the monthly cap or the pause switch. */
  const runBulk = async () => {
    const ids = leads.filter((l) => picked.has(l.id) && checkable(l)).map((l) => l.id);
    if (!ids.length) return;
    const b: Bulk = { total: ids.length, done: 0, running: true, stopped: '', failed: 0, recent: 0 };
    setBulk({ ...b });
    for (const id of ids) {
      try {
        await runCheck(id);
        b.done++;
        setPicked((p) => {
          const n = new Set(p);
          n.delete(id);
          return n;
        });
      } catch (e) {
        if (e instanceof ApiError && ['PLACES_CAP_REACHED', 'PLACES_PAUSED', 'PLACES_DISABLED', 'MEMBER_CHECK_LIMIT'].includes(e.code ?? '')) {
          b.stopped = e.message;
          break;
        }
        if (e instanceof ApiError && e.code === 'CHECKED_RECENTLY') b.recent++;
        else b.failed++;
      }
      setBulk({ ...b });
    }
    b.running = false;
    setBulk({ ...b });
    onChanged();
    void status.reload();
  };

  const checkOne = async (l: Lead) => {
    setRowError('');
    try {
      await runCheck(l.id);
      open(l);
    } catch (e) {
      setRowError(e instanceof ApiError ? e.message : 'Could not check this lead.');
      void status.reload();
    }
  };

  const act = (l: Lead) => {
    const m = checkMeta(l);
    if (!checkable(l) || !m.action) return null;
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); void (m.action === 'Check' ? checkOne(l) : open(l)); }} className="min-h-11 whitespace-nowrap px-1 text-sm font-medium text-brand hover:underline">
        {m.action}
      </button>
    );
  };

  const who = (l: Lead) =>
    l.origin === 'find_clients' ? (
      <span className="inline-flex items-center gap-2 text-sm text-fg-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info/12 text-info"><Search className="h-3.5 w-3.5" /></span>Find clients</span>
    ) : (
      <span className="inline-flex min-w-0 items-center gap-2 text-sm text-fg-2"><Avatar name={l.addedByName || '?'} tone="violet" /><span className="truncate">{l.addedByName || '—'}</span></span>
    );
  const sub = (l: Lead) => (l.origin === 'find_clients' && l.needsLiveLookup ? 'Not confirmed yet' : l.category || '—');
  const title = (l: Lead) => l.businessName || [l.category, l.city].filter(Boolean).join(' · ') || l.label;
  const place = (l: Lead) => [l.area, l.city].filter(Boolean).join(', ') || '—';

  return (
    <div>
      <p className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-bg-2 px-4 py-3 text-sm text-fg-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />
        <span>
          {founder
            ? "Only leads added by your team can be checked. Leads from Find clients already come from Google, so they don't need it."
            : `You can check the leads you added yourself, each one once every ${usage?.cooldownDays ?? 7} days.${usage?.mine ? ` ${leftText(usage)}.` : ''}`}
        </span>
      </p>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        {CHECK_FILTERS.map((f) => (
          <ChoiceChip key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)} className="shrink-0">
            {f.label} · {leads.filter(f.test).length}
          </ChoiceChip>
        ))}
      </div>

      {rowError && <div className="mb-4"><ErrorText>{rowError}</ErrorText></div>}

      {shown.length === 0 ? (
        <Empty title={leads.some((l) => l.origin === 'team') ? 'Nothing in this view' : 'No team-added leads yet'}>
          {leads.some((l) => l.origin === 'team') ? 'Try another filter or clear the search.' : 'Leads your team adds by hand show up here, ready to check against Google.'}
        </Empty>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-3xl border border-line bg-bg-2 md:block">
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.16em] text-fg-3">
                  {anyCheckable && (
                    <th className="w-14 pl-3 font-normal">
                      <Checkbox checked={allOn} disabled={!visibleCheckable.length} label="Select all team-added leads shown" onChange={(on) => setPicked(on ? new Set([...picked, ...visibleCheckable.map((l) => l.id)]) : new Set([...picked].filter((id) => !visibleCheckable.some((l) => l.id === id))))} />
                    </th>
                  )}
                  <th className={cx('py-4 font-normal', anyCheckable ? 'px-2' : 'px-5')}>Business</th>
                  <th className="w-[19%] px-3 py-4 font-normal lg:w-[15%]">Phone</th>
                  <th className="hidden w-[13%] px-3 py-4 font-normal lg:table-cell">City</th>
                  <th className="hidden w-[16%] px-3 py-4 font-normal xl:table-cell">Added by</th>
                  <th className="w-[44%] px-5 py-4 font-normal lg:w-[34%] xl:w-[30%]">Google check</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} onClick={() => checkable(l) && l.googleCheck.status && open(l)} className={cx('border-b border-line last:border-0', picked.has(l.id) && 'bg-brand/[0.05]', checkable(l) && l.googleCheck.status && 'cursor-pointer hover:bg-bg-3/40')}>
                    {anyCheckable && (
                      <td className="pl-3" onClick={(e) => e.stopPropagation()}>
                        {checkable(l) ? <Checkbox checked={picked.has(l.id)} label={`Select ${title(l)}`} onChange={(on) => toggle(l.id, on)} /> : null}
                      </td>
                    )}
                    <td className={cx('min-w-0 py-3.5', anyCheckable ? 'px-2' : 'px-5')}>
                      <a href={`/team/leads/${l.id}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/team/leads/${l.id}`); }} className={cx('block truncate font-medium', l.origin === 'find_clients' ? 'text-fg-2' : 'text-fg')}>{title(l)}</a>
                      <span className="block truncate text-xs text-fg-3">{sub(l)}</span>
                    </td>
                    <td className="truncate px-3 py-3.5 text-sm tabular-nums text-fg-2">{l.phone || '—'}</td>
                    <td className="hidden truncate px-3 py-3.5 text-sm text-fg-2 lg:table-cell">{place(l)}</td>
                    <td className="hidden px-3 py-3.5 xl:table-cell">{who(l)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <CheckTag lead={l} />
                        {act(l) ?? <span className="text-fg-3">{l.origin === 'find_clients' ? '—' : ''}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {shown.map((l) => (
              <li key={l.id} className={cx('rounded-3xl border p-4', picked.has(l.id) ? 'border-brand/60 bg-brand/[0.05]' : 'border-line bg-bg-2', l.origin === 'find_clients' && 'opacity-80')}>
                <div className="flex items-start gap-1">
                  {checkable(l) ? (
                    <span className="-ml-3 -mt-2.5"><Checkbox checked={picked.has(l.id)} label={`Select ${title(l)}`} onChange={(on) => toggle(l.id, on)} /></span>
                  ) : l.origin === 'find_clients' ? (
                    <span className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info/12 text-info"><Search className="h-3 w-3" /></span>
                  ) : null}
                  <a href={`/team/leads/${l.id}`} onClick={(e) => { e.preventDefault(); navigate(`/team/leads/${l.id}`); }} className="min-w-0 flex-1">
                    <p className={cx('truncate font-medium', l.origin === 'find_clients' ? 'text-fg-2' : 'text-fg')}>{title(l)}</p>
                    <p className="truncate text-xs text-fg-3">{[l.origin === 'find_clients' ? 'Find clients' : l.addedByName, l.city].filter(Boolean).join(' · ')}</p>
                  </a>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <CheckTag lead={l} />
                  {act(l)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {anyCheckable && (picked.size > 0 || bulk) && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-5 md:bottom-4">
          <div className="flex flex-col gap-3 rounded-3xl border border-brand/50 bg-bg-2/95 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
            {bulk ? (
              <div className="min-w-0" aria-live="polite">
                <p className="font-medium">{bulk.running ? `Checking ${Math.min(bulk.done + bulk.failed + 1, bulk.total)} of ${bulk.total}…` : `Checked ${bulk.done} of ${bulk.total}`}</p>
                <p className="text-xs text-fg-3">
                  {bulk.stopped ? `Stopped: ${bulk.stopped}` : bulk.failed ? `${bulk.failed} could not be checked. Try them again.` : bulk.running ? 'One at a time, each uses 1 Google call.' : 'Done. Open a lead to review it.'}
                  {bulk.recent ? ` ${bulk.recent} skipped: checked in the last ${usage?.cooldownDays ?? 7} days.` : ''}
                  {usage && !bulk.running ? ` ${leftText(usage)}.` : ''}
                </p>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="font-medium">{picked.size} selected</p>
                <p className="text-xs text-fg-3">
                  Uses {picked.size} Google call{picked.size === 1 ? '' : 's'}{usage ? ` · ${leftText(usage)}` : ''}.
                  {usage && left < picked.size && left > 0 ? ` Only the first ${left} will run.` : ''}
                </p>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-3">
              {!bulk?.running && (
                <button type="button" className="min-h-11 px-2 text-sm font-medium text-brand" onClick={() => { setPicked(new Set()); setBulk(null); }}>
                  {bulk ? 'Close' : 'Clear'}
                </button>
              )}
              {picked.size > 0 && (
                <Button onClick={runBulk} busy={bulk?.running} disabled={bulk?.running || left <= 0} className="flex-1 sm:flex-none">
                  <Search className="h-4 w-4" /> Check {picked.size}<span className="hidden sm:inline">&nbsp;with Google</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
