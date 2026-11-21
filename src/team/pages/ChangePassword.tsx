import { useState, type FormEvent } from 'react';
import { Eyebrow } from '../../components/ui';
import { ApiError, api } from '../api';
import type { Session } from '../TeamApp';
import { Button, Card, ErrorText, Field } from '../ui';

const MIN = 10;

export default function ChangePassword({ forced, onChanged }: { forced?: boolean; onChanged: (s: Session) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      onChanged(await api<Session>('POST', '/auth/change-password', { currentPassword: current, newPassword: next }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Eyebrow>Security</Eyebrow>
      <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-5xl">
        New <span className="font-serif font-normal italic tracking-normal text-brand">password</span>
      </h1>
      {forced && (
        <p className="mt-4 text-fg-2">You signed in with a one-time password. Choose your own to continue.</p>
      )}
      <Card className="mt-8">
        <form onSubmit={submit} className="space-y-6">
          <Field
            label={forced ? 'One-time password' : 'Current password'}
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN}
            hint={`At least ${MIN} characters.`}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} className="w-full">
            Save password
          </Button>
        </form>
      </Card>
    </div>
  );
}
