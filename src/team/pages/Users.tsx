// User management (super_admin). The API enforces the same rule; this page is
// only shown to the super_admin for convenience.

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Eyebrow } from '../../components/ui';
import { formatDateTime } from '../../../shared/time';
import { ApiError, api } from '../api';
import type { TeamUser } from '../TeamApp';
import { Button, Card, ErrorText, Loading } from '../ui';

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'employee';
  active: boolean;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
}

const ROLE_LABEL = { super_admin: 'Super admin', admin: 'Admin', employee: 'Employee' } as const;

function status(u: ManagedUser): string {
  if (!u.active) return 'Deactivated';
  if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) return 'Locked (too many attempts)';
  if (!u.hasPassword) return 'No password yet';
  if (u.mustChangePassword) return 'Must change password';
  return 'Active';
}

export default function Users({ me }: { me: TeamUser }) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<{ users: ManagedUser[] }>('GET', '/users')
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load users.'));
  }, []);
  useEffect(load, [load]);

  const run = async (id: string, fn: () => Promise<void>) => {
    setError('');
    setBusy(id);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
      load();
    } finally {
      setBusy('');
    }
  };

  const issueTemp = (u: ManagedUser) =>
    run(u.id, async () => {
      const { tempPassword } = await api<{ tempPassword: string }>('POST', `/users/${u.id}/temp-password`);
      setCopied(false);
      setIssued({ name: u.name, password: tempPassword });
    });

  const patch = (u: ManagedUser, body: { role?: string; active?: boolean }) =>
    run(u.id, () => api('PATCH', `/users/${u.id}`, { ...body, expectedUpdatedAt: u.updatedAt }));

  if (!users && !error) return <Loading />;

  return (
    <div>
      <Eyebrow>Settings</Eyebrow>
      <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-5xl">
        Team <span className="font-serif font-normal italic tracking-normal text-brand">users</span>
      </h1>

      {issued && (
        <Card className="mt-8 border-brand/40">
          <p className="text-sm text-fg-2">
            One-time password for <span className="text-fg">{issued.name}</span>. It is shown only once — share it
            privately. They will choose their own password at first sign-in.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="rounded-2xl bg-bg-3 px-4 py-3 font-mono text-lg tracking-wider text-fg">{issued.password}</code>
            <Button
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(issued.password).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <ErrorText>{error}</ErrorText>
      </div>

      <div className="mt-6 space-y-4">
        {users?.map((u) => {
          const self = u.id === me.id;
          return (
            <Card key={u.id} className="!p-5 sm:!p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-fg">
                    {u.name} {self && <span className="text-fg-3">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-fg-2">{u.email}</p>
                  <p className="mt-1 text-xs text-fg-3">
                    {ROLE_LABEL[u.role]} · {status(u)}
                    {u.lastLoginAt && ` · last sign-in ${formatDateTime(u.lastLoginAt)}`}
                  </p>
                </div>
                {u.role !== 'super_admin' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Role for ${u.name}`}
                      value={u.role}
                      disabled={busy === u.id}
                      onChange={(e) => patch(u, { role: e.target.value })}
                      className="min-h-10 cursor-pointer rounded-full border border-line-2 bg-bg px-4 text-sm text-fg"
                    >
                      <option value="admin">Admin</option>
                      <option value="employee">Employee</option>
                    </select>
                    <Button variant="ghost" className="!min-h-10" busy={busy === u.id} onClick={() => issueTemp(u)}>
                      <KeyRound className="h-4 w-4" />
                      {u.hasPassword ? 'Reset password' : 'Create password'}
                    </Button>
                    <Button
                      variant="ghost"
                      className="!min-h-10"
                      disabled={busy === u.id}
                      onClick={() => patch(u, { active: !u.active })}
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
