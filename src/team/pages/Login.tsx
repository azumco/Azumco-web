import { useState, type FormEvent } from 'react';
import { Eyebrow } from '../../components/ui';
import { ApiError, api } from '../api';
import type { Session } from '../TeamApp';
import { Button, Card, ErrorText, Field } from '../ui';

export default function Login({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onSignedIn(await api<Session>('POST', '/auth/login', { email, password }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Eyebrow>Team</Eyebrow>
      <h1 className="mt-4 text-4xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-5xl">
        Sign <span className="font-serif font-normal italic tracking-normal text-brand">in</span>
      </h1>
      <Card className="mt-8">
        <form onSubmit={submit} className="space-y-6">
          <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
