// Founders: search Google for local businesses, pick the good ones, import and
// assign. Results live in this component only — never saved. Import sends
// just the place IDs plus our own type and city.

import { useMemo, useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import { BUSINESS_CATEGORIES } from '../../../shared/rules';
import { DEFAULT_STATE, INDIA_CITIES, INDIA_STATES } from '../../../shared/india';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Button, Card, Checkbox, ChipGroup, ChoiceChip, Empty, ErrorText, GoogleAttribution, PageTitle, SearchableSelect, Stepper, Tag, cx } from '../ui';
import type { PlacesUsage, TeamMember } from '../types';

interface Result {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  alreadyInLeads: boolean;
}

interface Status {
  enabled: boolean;
  usage: PlacesUsage;
  defaultWindowHours: number;
}

/** "Gym / Fitness" → "Gym": the short label stored on the lead. */
const shortType = (t: string) => t.split('/')[0].trim();
const area = (address: string) => address.split(',').slice(0, 2).join(',').trim();
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function FindClients() {
  const status = useApi<Status>('/places/status');
  const team = useApi<{ users: TeamMember[] }>('/team');
  const [form, setForm] = useState({ type: '', state: DEFAULT_STATE, city: '', limit: 10 });
  const [results, setResults] = useState<Result[] | null>(null);
  const [searched, setSearched] = useState<{ type: string; city: string; state: string; searchedAt: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [noWebsite, setNoWebsite] = useState(false);
  const [hideHave, setHideHave] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [hours, setHours] = useState('');
  const [message, setMessage] = useState('');
  const search = useAction();
  const importing = useAction();

  // Only people who can receive leads appear in "Assign to".
  const employees = (team.data?.users ?? []).filter((u) => u.canReceiveLeads);
  const defaultHours = String(status.data?.defaultWindowHours ?? 24);

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!form.type) return search.setError('Choose a business type.');
    if (!form.state) return search.setError('Choose a state.');
    if (!form.city) return search.setError('Choose a city.');
    const r = await search.run(() =>
      api<{ results: Result[]; searchedAt: string }>('POST', '/places/search', { category: form.type, state: form.state, city: form.city, limit: form.limit }),
    );
    void status.reload();
    if (r) {
      setResults(r.results);
      setSearched({ type: form.type, city: form.city, state: form.state, searchedAt: r.searchedAt });
      setPicked(new Set(r.results.filter((x) => !x.alreadyInLeads).map((x) => x.placeId)));
      if (!assignTo && employees[0]) setAssignTo(employees[0].id);
    }
  };

  const shown = useMemo(() => (results ?? []).filter((r) => (!noWebsite || !r.website) && (!hideHave || !r.alreadyInLeads)), [results, noWebsite, hideHave]);

  const runImport = async () => {
    if (!searched) return;
    const r = await importing.run(() =>
      api<{ imported: number; skipped: number }>('POST', '/places/import', {
        category: shortType(searched.type),
        city: searched.city,
        state: searched.state,
        searchedAt: searched.searchedAt,
        placeIds: [...picked],
        ...(assignTo ? { assignTo, windowHours: Number(hours || defaultHours) } : {}),
      }),
    );
    if (r) {
      const who = employees.find((u) => u.id === assignTo)?.name.split(' ')[0];
      setMessage(`Imported ${r.imported} lead${r.imported === 1 ? '' : 's'}${who ? ` and assigned to ${who}` : ''}.${r.skipped ? ` ${r.skipped} were already in your leads.` : ''}`);
      setResults((cur) => cur?.map((x) => (picked.has(x.placeId) ? { ...x, alreadyInLeads: true } : x)) ?? null);
      setPicked(new Set());
    }
  };

  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  return (
    <div>
      <PageTitle title="Find" accent="clients" subtitle="Search Google for local businesses, pick the good ones, hand them to the caller." />
      <Async state={status}>
        {(s) =>
          !s.enabled ? (
            <Empty title="Find clients is not set up">Add GOOGLE_PLACES_API_KEY on the server to turn this on.</Empty>
          ) : (
            <div className="space-y-5">
              <Card>
                <form onSubmit={runSearch} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto_auto] lg:items-end">
                  <SearchableSelect label="Business type" value={form.type} options={BUSINESS_CATEGORIES} allowCustom required onChange={(v) => setForm({ ...form, type: v })} placeholder="Choose a type" />
                  <SearchableSelect label="State" value={form.state} options={INDIA_STATES} required onChange={(v) => setForm({ ...form, state: v, city: '' })} />
                  <SearchableSelect label="City" value={form.city} options={INDIA_CITIES[form.state] ?? []} allowCustom required onChange={(v) => setForm({ ...form, city: v })} placeholder="Choose a city" icon={<MapPin className="h-4 w-4 shrink-0 text-fg-3" />} />
                  <Stepper label="How many" value={form.limit} min={1} max={20} onChange={(v) => setForm({ ...form, limit: v })} />
                  <Button type="submit" busy={search.busy} disabled={s.usage.paused || s.usage.remaining <= 0}>Search Google</Button>
                </form>
                <p className="mt-4 text-xs text-fg-3">
                  Each search uses 1 of your {s.usage.cap.toLocaleString('en-IN')} monthly Google calls · {s.usage.remaining.toLocaleString('en-IN')} of {s.usage.cap.toLocaleString('en-IN')} left. Searches stop automatically at the limit.
                </p>
                {(s.usage.paused || s.usage.remaining <= 0) && (
                  <div className="mt-4">
                    <ErrorText>{s.usage.paused ? 'Google calls are paused by the super admin.' : "This month's Google limit is used up. It resets on the 1st (IST)."}</ErrorText>
                  </div>
                )}
                {search.error && <div className="mt-4"><ErrorText>{search.error}</ErrorText></div>}
              </Card>

              {results && (
                <Card className="!p-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                    <p className="text-base font-medium">
                      {results.length} × {shortType(searched?.type ?? '')} in {searched?.city} <span className="ml-2 font-normal"><GoogleAttribution /></span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <ChoiceChip on={noWebsite} onClick={() => setNoWebsite((v) => !v)}>No website only</ChoiceChip>
                      <ChoiceChip on={hideHave} onClick={() => setHideHave((v) => !v)}>Hide ones we have</ChoiceChip>
                    </div>
                  </div>
                  {shown.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-fg-3">{results.length === 0 ? 'Google found nothing. Try a broader type or a nearby city.' : 'Nothing matches these filters.'}</p>
                  ) : (
                    <ul>
                      {shown.map((r) => (
                        <li key={r.placeId} className={cx('grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-3 sm:grid-cols-[auto_1.6fr_1fr_1fr_auto] sm:px-5', r.alreadyInLeads && 'opacity-45')}>
                          <Checkbox checked={picked.has(r.placeId)} disabled={r.alreadyInLeads} onChange={(v) => toggle(r.placeId, v)} label={`Select ${r.name}`} />
                          <div className="min-w-0">
                            <p className="truncate text-fg">{r.name}</p>
                            <p className="truncate text-xs text-fg-3">{area(r.address) || '—'}</p>
                          </div>
                          <span className="col-start-2 text-sm tabular-nums text-fg-2 sm:col-start-auto">{r.alreadyInLeads ? '—' : r.phone || 'No phone listed'}</span>
                          <span className="col-start-2 text-sm text-fg-2 sm:col-start-auto">
                            {r.alreadyInLeads ? '—' : r.website ? <a href={r.website} target="_blank" rel="noreferrer noopener" className="hover:text-fg">{host(r.website)}</a> : <Tag tone="warn">No website</Tag>}
                          </span>
                          <span className="col-start-2 sm:col-start-auto">{r.alreadyInLeads && <Tag tone="muted">Already in leads</Tag>}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center justify-between px-5 py-3 text-sm text-fg-3">
                    <span>Showing {shown.length} of {results.length}</span>
                    {shown.length < results.length && (
                      <button type="button" className="min-h-11 text-brand" onClick={() => { setNoWebsite(false); setHideHave(false); }}>Show all</button>
                    )}
                  </div>
                </Card>
              )}

              {results && results.some((r) => !r.alreadyInLeads) && (
                <Card className="border-brand/40 sm:sticky sm:bottom-4 sm:z-30">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-medium">{picked.size} selected</p>
                      <p className="text-xs text-fg-3">Only Google's place ID is saved. Names and numbers load live for the caller until they confirm them.</p>
                    </div>
                    <Button busy={importing.busy} disabled={!picked.size} onClick={runImport}>
                      Import {picked.size}{assignTo ? ' & assign' : ''}
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-fg-3">Assign to</span>
                      <ChipGroup options={[...employees.map((u) => ({ value: u.id, label: u.name.split(' ')[0] })), { value: '', label: 'Keep unassigned' }]} value={assignTo} onChange={setAssignTo} required />
                    </div>
                    {assignTo && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-fg-3">Must call within</span>
                        <ChipGroup options={[{ value: '12', label: '12 hours' }, { value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }]} value={hours || defaultHours} onChange={(v) => setHours(v || defaultHours)} required />
                      </div>
                    )}
                  </div>
                  <div className="mt-3"><ErrorText>{importing.error}</ErrorText></div>
                  {message && (
                    <p role="status" className="mt-3 text-sm text-good">
                      {message} <a href="/team/leads" className="text-brand" onClick={(e) => { e.preventDefault(); navigate('/team/leads'); }}>View leads</a>
                    </p>
                  )}
                </Card>
              )}
            </div>
          )
        }
      </Async>
    </div>
  );
}
