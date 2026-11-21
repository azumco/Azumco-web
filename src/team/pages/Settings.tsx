// Super admin: team, Google Places limit and pause, lead timer, commission,
// and the audit log.

import { useEffect, useState } from 'react';
import { Check, Copy, Lock, Plus } from 'lucide-react';
import { formatDateTime } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Avatar, BoxInput, Button, Card, CardHeader, ChipGroup, ErrorText, Modal, PageTitle, ProgressBar, Segmented, Tag, Toggle, cx, type TagTone } from '../ui';
import ChangePassword from './ChangePassword';
import type { PlacesUsage, TeamUser } from '../types';

interface ManagedUser { id: string; email: string; name: string; role: 'super_admin' | 'admin' | 'employee'; active: boolean; hasPassword: boolean; mustChangePassword: boolean; lockedUntil: string | null; updatedAt: string }
interface SettingsData {
  settings: { placesMonthlyCap: number; placesPaused: boolean; commissionQualifiedFee: number; commissionOneTimePct: number; commissionMonthlyPct: number; assignmentWindowHours: number; contactedRule: 'any_attempt' | 'reached_only' };
  usage: PlacesUsage;
  placesEnabled: boolean;
}
interface AuditEntry { id: string; at: string; action: string; before: string; after: string; actor: string }

const ROLE: Record<ManagedUser['role'], { label: string; tone: TagTone }> = {
  super_admin: { label: 'Super admin', tone: 'brand' },
  admin: { label: 'Admin', tone: 'info' },
  employee: { label: 'Employee', tone: 'violet' },
};

function ManageUser({ u, onClose, onSaved }: { u: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const [typed, setTyped] = useState('');
  const [issued, setIssued] = useState('');
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAction();
  const issue = async () => {
    const r = await run(() => api<{ tempPassword: string }>('POST', `/users/${u.id}/temp-password`, typed.trim() ? { tempPassword: typed.trim() } : {}));
    if (r) {
      setIssued(r.tempPassword);
      setTyped('');
      onSaved();
    }
  };
  const patch = async (body: { role?: string; active?: boolean }) => {
    if (await run(() => api('PATCH', `/users/${u.id}`, { ...body, expectedUpdatedAt: u.updatedAt }))) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={u.name} subtitle={u.email} open onClose={onClose}>
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium">{u.hasPassword ? 'Reset password' : 'Create password'}</p>
          {issued ? (
            <div className="rounded-2xl border border-brand/40 bg-brand/5 p-4">
              <p className="text-xs text-fg-2">One-time password — shown only once. Share it privately; they choose their own at first sign-in.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded-xl bg-bg-3 px-3 py-2.5 font-mono tracking-wider">{issued}</code>
                <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(issued).catch(() => undefined); setCopied(true); }}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <BoxInput aria-label="Temporary password (leave blank to generate)" autoComplete="off" placeholder="Type one (10+), or leave blank" value={typed} onChange={(e) => setTyped(e.target.value)} className="flex-1" />
              <Button size="sm" busy={busy} onClick={issue}>{typed.trim() ? 'Set' : 'Generate'}</Button>
            </div>
          )}
        </div>
        <Segmented label="Role" options={[{ value: 'admin', label: 'Admin' }, { value: 'employee', label: 'Employee' }]} value={u.role === 'employee' ? 'employee' : 'admin'} onChange={(v) => v !== u.role && patch({ role: v })} />
        <Toggle label="Can sign in" hint={u.active ? 'Turning this off signs them out and returns their leads to Unclaimed.' : 'Deactivated.'} checked={u.active} onChange={(v) => patch({ active: v })} />
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

function Team({ me }: { me: TeamUser }) {
  const state = useApi<{ users: ManagedUser[] }>('/users');
  const [managing, setManaging] = useState<ManagedUser | null>(null);
  const [changingOwn, setChangingOwn] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader title="Team" action={<Button variant="ghost" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add teammate</Button>} />
      <Async state={state}>
        {({ users }) => (
          <ul>
            {users.map((u) => {
              const self = u.id === me.id;
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0">
                  <Avatar name={u.name} tone={ROLE[u.role].tone} />
                  <div className="min-w-0 flex-1">
                    <p className={cx('truncate', u.active ? 'text-fg' : 'text-fg-3 line-through')}>{u.name}</p>
                    <p className="truncate text-xs text-fg-3">{u.email}{!u.hasPassword && ' · no password yet'}{u.mustChangePassword && u.hasPassword && ' · must change password'}</p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-3 pl-11 sm:w-auto sm:pl-0">
                    <Tag tone={ROLE[u.role].tone}>{ROLE[u.role].label}</Tag>
                    <Button variant="ghost" onClick={() => (self ? setChangingOwn(true) : setManaging(u))}>
                      {self ? 'Change password' : u.hasPassword ? 'Reset password' : 'Create password'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Async>
      <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-fg-3"><Lock className="h-3.5 w-3.5" /> Only @azumco.com emails can sign in. There's no public sign-up.</p>
      {managing && <ManageUser u={managing} onClose={() => setManaging(null)} onSaved={() => void state.reload()} />}
      <Modal title="Change" accent="password" open={changingOwn} onClose={() => setChangingOwn(false)}>
        <ChangePassword onChanged={() => setChangingOwn(false)} />
      </Modal>
      <Modal title="Add" accent="teammate" open={adding} onClose={() => setAdding(false)}>
        <div className="space-y-3 text-sm text-fg-2">
          <p>Accounts can't be created from the app — there is no sign-up, by design.</p>
          <p>Add the person to <code className="rounded bg-bg-3 px-1.5">TEAM_USERS</code> on the server (name, @azumco.com email, role "admin" or "employee") and restart. They appear here; then use <strong className="text-fg">Create password</strong>.</p>
        </div>
      </Modal>
    </Card>
  );
}

function Audit() {
  const [open, setOpen] = useState(false);
  const state = useApi<{ entries: AuditEntry[] }>(open ? '/audit' : null);
  return (
    <Card>
      <CardHeader title="Audit log" action={<Button variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'}</Button>} />
      {open && (
        <Async state={state}>
          {({ entries }) => (
            <ul className="space-y-2">
              {entries.map((a) => (
                <li key={a.id} className="rounded-2xl bg-bg-3 px-4 py-2">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{a.action}</span>
                      <span className="text-xs text-fg-3">{a.actor} · {formatDateTime(a.at)}</span>
                    </summary>
                    <div className="grid gap-2 pb-2 text-xs sm:grid-cols-2">
                      <pre className="whitespace-pre-wrap break-all rounded-xl bg-bg p-3 text-fg-2">Before: {a.before || '—'}</pre>
                      <pre className="whitespace-pre-wrap break-all rounded-xl bg-bg p-3 text-fg-2">After: {a.after || '—'}</pre>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Async>
      )}
    </Card>
  );
}

function Rules({ data, onSaved, team }: { data: SettingsData; onSaved: () => void; team: React.ReactNode }) {
  const [f, setF] = useState(data.settings);
  useEffect(() => setF(data.settings), [data.settings]);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const save = async (patch: Partial<typeof f> = f) => {
    setSaved(false);
    if (await run(() => api('PUT', '/settings', patch))) {
      setSaved(true);
      onSaved();
    }
  };
  const pct = data.usage.cap ? (data.usage.used / data.usage.cap) * 100 : 0;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_400px]">
      <div className="space-y-5">
      {team}
      <Card>
        <CardHeader title="Google Places" />
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-fg-2">Monthly limit</span>
            <BoxInput aria-label="Monthly limit" type="number" min={0} inputMode="numeric" value={String(f.placesMonthlyCap)} onChange={(e) => setF({ ...f, placesMonthlyCap: Number(e.target.value) })} suffix={<span className="whitespace-nowrap text-xs text-fg-3">calls / month</span>} className="w-48" />
          </div>
          <Toggle label="Pause all Google calls" hint="Takes effect at once, even for searches already waiting." checked={f.placesPaused} onChange={(v) => { setF({ ...f, placesPaused: v }); void save({ placesPaused: v }); }} />
          <div className="flex justify-between text-sm"><span className="text-fg-2">Used this month</span><span className="tabular-nums">{data.usage.used} / {data.usage.cap.toLocaleString('en-IN')}</span></div>
          <ProgressBar percent={pct} tone="good" label="Google usage" />
          <p className="text-xs text-fg-3">{data.placesEnabled ? 'Resets on the 1st (IST). At the limit, searches and lookups stop until next month.' : 'No API key on the server — Find clients is off.'}</p>
        </div>
      </Card>
      </div>
      <div className="space-y-5">
      <Card>
        <CardHeader title="Lead timer" />
        <div className="space-y-5">
          <ChipGroup label="Assigned leads disappear after" options={[{ value: '12', label: '12 hours' }, { value: '24', label: '24 hours' }, { value: '48', label: '48 hours' }]} value={String(f.assignmentWindowHours) as '24'} onChange={(v) => v && setF({ ...f, assignmentWindowHours: Number(v) })} required />
          <Segmented label="Counts as contacted" options={[{ value: 'any_attempt', label: 'Any call logged' }, { value: 'reached_only', label: 'Only when reached' }]} value={f.contactedRule} onChange={(v) => setF({ ...f, contactedRule: v })} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Caller commission" />
        <div className="space-y-3">
          {[
            ['Per qualified lead', 'commissionQualifiedFee', '₹', ''],
            ['One-time project', 'commissionOneTimePct', '', '%'],
            ['Monthly package', 'commissionMonthlyPct', '', '% of 1st month'],
          ].map(([label, key, pre, post]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-sm text-fg-2">{label}</span>
              <BoxInput aria-label={label} type="number" min={0} inputMode="decimal" value={String(f[key as keyof typeof f])} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} icon={pre ? <span className="text-fg-3">{pre}</span> : undefined} suffix={post ? <span className="whitespace-nowrap text-xs text-fg-3">{post}</span> : undefined} className="w-44" />
            </div>
          ))}
          <ErrorText>{error}</ErrorText>
          {saved && !error && <p role="status" className="text-sm text-good">Saved.</p>}
          <Button variant="secondary" busy={busy} className="mt-2 w-full" onClick={() => save()}>Save changes</Button>
        </div>
      </Card>
      <Audit />
      </div>
    </div>
  );
}

export default function Settings({ me }: { me: TeamUser }) {
  const state = useApi<SettingsData>('/settings');
  return (
    <div>
      <PageTitle title="Team" accent="settings" subtitle="Only you can see this page.">
        <Tag tone="brand">Super admin only</Tag>
      </PageTitle>
      <Async state={state}>{(d) => <Rules data={d} onSaved={() => void state.reload()} team={<Team me={me} />} />}</Async>
    </div>
  );
}
