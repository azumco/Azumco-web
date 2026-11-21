import { useState, type FormEvent } from 'react';
import { ChevronLeft, Lock } from 'lucide-react';
import { ApiError, api } from '../api';
import type { Session } from '../types';
import { Button, ErrorText, Field } from '../ui';

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
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-line bg-bg-2 p-7 sm:p-10">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
          <span className="text-lg font-bold tracking-[-0.02em]">Azumco</span>
        </div>
        <h1 className="mt-8 text-[2rem] font-medium leading-tight tracking-[-0.03em]">
          Team <span className="font-serif font-normal italic tracking-normal text-brand">sign in</span>
        </h1>
        <p className="mt-2 text-fg-2">For Azumco founders and team only.</p>
        <form onSubmit={submit} className="mt-8 space-y-6">
          <Field label="Email" type="email" autoComplete="username" placeholder="name@azumco.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-6 flex items-start gap-2 text-xs text-fg-3">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Only @azumco.com accounts. Forgot your password? Ask Zeeshan.
        </p>
      </div>
      <a href="/" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-3 hover:text-fg">
        <ChevronLeft className="h-4 w-4" /> Back to azumco.com
      </a>
    </div>
  );
}
