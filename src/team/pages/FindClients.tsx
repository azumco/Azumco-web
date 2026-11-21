// Founders: discover local businesses on Google and import chosen ones.
// Results live in this component's state only: they are never saved, and
// import sends just the place IDs plus our own category/city.

import { useState, type FormEvent } from 'react';
import { Check, ExternalLink, MapPin, Phone, Search } from 'lucide-react';
import { BUSINESS_CATEGORIES } from '../../../shared/rules';
import { DEFAULT_STATE } from '../../../shared/india';
import StateCityPicker from '../components/StateCityPicker';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Badge, Button, Card, Empty, ErrorText, Field, GoogleAttribution, PageHeader, Select } from '../ui';
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

function Usage({ usage }: { usage: PlacesUsage }) {
  const pct = usage.cap ? Math.min(100, (usage.used / usage.cap) * 100) : 100;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-fg-2">Google lookups this month</p>
        <p className="tabular-nums text-sm">
          <span className="text-fg">{usage.used}</span> <span className="text-fg-3">/ {usage.cap}</span>
        </p>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-bg-3">
        <div className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-brand' : 'bg-fg-2'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-fg-3">
        {usage.remaining} left · {usage.searches} searches, {usage.lookups} contact lookups
        {usage.paused && ' · Paused by the super admin'}
      </p>
    </Card>
  );
}

export default function FindClients() {
  const status = useApi<Status>('/places/status');
  const team = useApi<{ users: TeamMember[] }>('/team');
  const [form, setForm] = useState({ category: '', state: DEFAULT_STATE, city: '', limit: '10' });
  const [results, setResults] = useState<Result[] | null>(null);
  const [searched, setSearched] = useState<{ category: string; city: string; state: string; searchedAt: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState('');
  const [hours, setHours] = useState('');
  const [message, setMessage] = useState('');
  const search = useAction();
  const importing = useAction();

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    const r = await search.run(() =>
      api<{ results: Result[]; searchedAt: string }>('POST', '/places/search', { category: form.category, state: form.state, city: form.city, limit: Number(form.limit) }),
    );
    void status.reload();
    if (r) {
      setResults(r.results);
      setSearched({ category: form.category.trim(), city: form.city.trim(), state: form.state, searchedAt: r.searchedAt });
      setPicked(new Set(r.results.filter((x) => !x.alreadyInLeads).map((x) => x.placeId)));
    }
  };

  const runImport = async () => {
    if (!searched) return;
    const r = await importing.run(() =>
      api<{ imported: number; skipped: number }>('POST', '/places/import', {
        ...searched,
        placeIds: [...picked],
        ...(assignTo ? { assignTo, windowHours: Number(hours || status.data?.defaultWindowHours || 24) } : {}),
      }),
    );
    if (r) {
      const who = team.data?.users.find((u) => u.id === assignTo)?.name;
      setMessage(`Imported ${r.imported} lead${r.imported === 1 ? '' : 's'}${who ? ` and assigned to ${who}` : ''}.${r.skipped ? ` ${r.skipped} were already in your leads.` : ''}`);
      setResults((cur) => cur?.map((x) => (picked.has(x.placeId) ? { ...x, alreadyInLeads: true } : x)) ?? null);
      setPicked(new Set());
    }
  };

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const employees = (team.data?.users ?? []).filter((u) => u.role === 'employee');
  const defaultHours = String(status.data?.defaultWindowHours ?? 24);

  return (
    <div>
      <PageHeader eyebrow="Find clients" title="Discover" accent="businesses" />
      <Async state={status}>
        {(s) =>
          !s.enabled ? (
            <Empty title="Find clients is not set up">Add a GOOGLE_PLACES_API_KEY on the server to turn this on.</Empty>
          ) : (
            <div className="space-y-6">
              <Usage usage={s.usage} />
              <Card>
                <form onSubmit={runSearch} className="grid gap-5 sm:grid-cols-2 sm:items-end lg:grid-cols-[1.2fr_1fr_1fr_100px_auto]">
                  <Field label="Category" list="place-categories" required placeholder="Gym" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  <datalist id="place-categories">
                    {BUSINESS_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <StateCityPicker required state={form.state} city={form.city} onChange={(next) => setForm({ ...form, ...next })} />
                  <Select label="Results" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} options={['1', '5', '10', '15', '20']} />
                  <Button type="submit" busy={search.busy} disabled={s.usage.paused || s.usage.remaining <= 0}>
                    <Search className="h-4 w-4" /> Search
                  </Button>
                </form>
                <p className="mt-4 text-xs text-fg-3">Each search is one paid Google request, whatever the number of results. Searches are limited to India.</p>
                {(s.usage.paused || s.usage.remaining <= 0) && (
                  <div className="mt-4">
                    <ErrorText>
                      {s.usage.paused ? 'Google lookups are paused by the super admin.' : "This month's Google limit is used up. It resets on the 1st (IST)."}
                    </ErrorText>
                  </div>
                )}
                <div className="mt-4">
                  <ErrorText>{search.error}</ErrorText>
                </div>
              </Card>

              {results && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xs uppercase tracking-[0.18em] text-fg-3">
                      {results.length} result{results.length === 1 ? '' : 's'} · {searched?.category} in {searched?.city}, {searched?.state}
                    </h2>
                    <GoogleAttribution />
                  </div>
                  {results.length === 0 && <Empty title="No businesses found">Try a broader category or a nearby city.</Empty>}
                  {results.map((r) => {
                    const on = picked.has(r.placeId);
                    return (
                      <label
                        key={r.placeId}
                        className={`flex cursor-pointer gap-4 rounded-3xl border bg-bg-2 p-4 transition-colors ${r.alreadyInLeads ? 'cursor-default opacity-60' : on ? 'border-brand/60' : 'border-line hover:border-line-2'}`}
                      >
                        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" disabled={r.alreadyInLeads} checked={on} onChange={() => toggle(r.placeId)} aria-label={`Select ${r.name}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-fg">{r.name}</p>
                            {r.alreadyInLeads && (
                              <Badge tone="muted">
                                <Check className="h-3 w-3" /> Already in your leads
                              </Badge>
                            )}
                          </div>
                          {r.address && (
                            <p className="mt-1 flex items-start gap-1.5 text-xs text-fg-2">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                              {r.address}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
                            {r.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {r.phone}
                              </span>
                            ) : (
                              <span>No phone listed</span>
                            )}
                            {r.website && (
                              <a href={r.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-fg" onClick={(e) => e.stopPropagation()}>
                                <ExternalLink className="h-3 w-3" /> Website
                              </a>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}

                  {results.some((r) => !r.alreadyInLeads) && (
                    <Card className="border-line-2 bg-bg-2/95 backdrop-blur sm:sticky sm:bottom-4 sm:z-30">
                      <div className="grid gap-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
                        <Select
                          label="Assign to (optional)"
                          value={assignTo}
                          onChange={(e) => setAssignTo(e.target.value)}
                          options={[{ value: '', label: 'Leave unclaimed' }, ...employees.map((u) => ({ value: u.id, label: u.name }))]}
                        />
                        <Select
                          label="Contact within"
                          value={hours || defaultHours}
                          disabled={!assignTo}
                          onChange={(e) => setHours(e.target.value)}
                          options={[{ value: '12', label: '12 hours' }, { value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }]}
                        />
                        <Button busy={importing.busy} disabled={!picked.size} onClick={runImport}>
                          Import {picked.size || ''}
                        </Button>
                      </div>
                      <p className="mt-3 text-xs text-fg-3">Only the Google place ID is saved. The contact is looked up live when someone opens the lead.</p>
                      <div className="mt-3">
                        <ErrorText>{importing.error}</ErrorText>
                      </div>
                    </Card>
                  )}
                  {message && (
                    <p role="status" className="text-sm text-fg">
                      {message}{' '}
                      <a
                        href="/team/leads"
                        className="text-brand"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate('/team/leads');
                        }}
                      >
                        View leads
                      </a>
                    </p>
                  )}
                </section>
              )}
            </div>
          )
        }
      </Async>
    </div>
  );
}

