// Super admin: Places cap and pause, assignment rules, commission rates,
// users and the audit log.

import { useEffect, useState, type FormEvent } from 'react';
import { formatDateTime } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Button, Card, ErrorText, Field, PageHeader, Select, Toggle } from '../ui';
import type { PlacesUsage, TeamUser } from '../types';
import Users from './Users';

interface SettingsData {
  settings: {
    placesMonthlyCap: number;
    placesPaused: boolean;
    commissionQualifiedFee: number;
    commissionOneTimePct: number;
    commissionMonthlyPct: number;
    assignmentWindowHours: number;
    contactedRule: 'any_attempt' | 'reached_only';
  };
  usage: PlacesUsage;
  placesEnabled: boolean;
}

interface AuditEntry { id: string; at: string; action: string; entity: string; entityId: string; before: string; after: string; actor: string }

function SettingsForm({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const [f, setF] = useState(data.settings);
  useEffect(() => setF(data.settings), [data.settings]);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const num = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: Number(e.target.value) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (await run(() => api('PUT', '/settings', f))) {
      setSaved(true);
      onSaved();
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <h2 className="text-sm font-medium">Google Places</h2>
        <p className="mt-1 text-xs text-fg-3">
          {data.placesEnabled ? `${data.usage.used} of ${data.usage.cap} paid calls used in ${data.usage.yearMonth} (IST) · ${data.usage.searches} searches, ${data.usage.lookups} lookups` : 'No API key on the server — the feature is off.'}
        </p>
        <div className="mt-5 space-y-5">
          <Field label="Monthly cap (paid calls)" type="number" min={0} max={1000000} inputMode="numeric" value={String(f.placesMonthlyCap)} onChange={num('placesMonthlyCap')} hint="One cap for searches and contact lookups together." />
          <Toggle label="Pause all Google lookups" hint="Stops new searches and lookups immediately, including ones already waiting." checked={f.placesPaused} onChange={(v) => setF({ ...f, placesPaused: v })} />
        </div>
      </Card>
      <Card>
        <h2 className="text-sm font-medium">Lead assignment</h2>
        <div className="mt-5 space-y-5">
          <Select label="Default contact window" value={String(f.assignmentWindowHours)} onChange={num('assignmentWindowHours')} options={[{ value: '12', label: '12 hours' }, { value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }]} />
          <Select
            label="What counts as contacted"
            value={f.contactedRule}
            onChange={(e) => setF({ ...f, contactedRule: e.target.value as typeof f.contactedRule })}
            options={[{ value: 'any_attempt', label: 'Any logged call attempt' }, { value: 'reached_only', label: 'Only calls where someone was reached' }]}
          />
        </div>
      </Card>
      <Card>
        <h2 className="text-sm font-medium">Commission</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <Field label="Per qualified lead (₹)" type="number" min={0} inputMode="numeric" value={String(f.commissionQualifiedFee)} onChange={num('commissionQualifiedFee')} />
          <Field label="One-time deals (%)" type="number" min={0} max={100} step="0.5" inputMode="decimal" value={String(f.commissionOneTimePct)} onChange={num('commissionOneTimePct')} />
          <Field label="Monthly deals (%)" type="number" min={0} max={100} step="0.5" inputMode="decimal" value={String(f.commissionMonthlyPct)} onChange={num('commissionMonthlyPct')} />
        </div>
      </Card>
      <ErrorText>{error}</ErrorText>
      {saved && !error && <p role="status" className="text-sm">Settings saved.</p>}
      <Button type="submit" busy={busy}>
        Save settings
      </Button>
    </form>
  );
}

function Audit() {
  const state = useApi<{ entries: AuditEntry[] }>('/audit');
  return (
    <Async state={state}>
      {({ entries }) => (
        <ul className="space-y-2">
          {entries.map((a) => (
            <li key={a.id} className="rounded-3xl border border-line bg-bg-2 px-5 py-3">
              <details>
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-fg">{a.action}</span>
                  <span className="text-xs text-fg-3">
                    {a.actor} · {formatDateTime(a.at)}
                  </span>
                </summary>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-bg-3 p-3 text-fg-2">Before: {a.before || '—'}</pre>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-bg-3 p-3 text-fg-2">After: {a.after || '—'}</pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Async>
  );
}

export default function Settings({ me }: { me: TeamUser }) {
  const state = useApi<SettingsData>('/settings');
  const [tab, setTab] = useState<'settings' | 'users' | 'audit'>('settings');
  return (
    <div>
      <PageHeader eyebrow="Super admin" title="Settings" />
      <div className="mb-8 flex flex-wrap gap-2" role="tablist">
        {(['settings', 'users', 'audit'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-full border px-5 text-sm capitalize ${tab === t ? 'border-brand bg-brand/15 text-fg' : 'border-line-2 text-fg-2'}`}
          >
            {t === 'audit' ? 'Audit log' : t}
          </button>
        ))}
      </div>
      {tab === 'settings' && <Async state={state}>{(d) => <SettingsForm data={d} onSaved={state.reload} />}</Async>}
      {tab === 'users' && <Users me={me} embedded />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}
