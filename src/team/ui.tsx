// Team-area building blocks, made from the public site's existing tokens and
// patterns: the Contact form's underline inputs, the site's pill buttons, the
// bg-2 / line card surface, and Eyebrow from components/ui.

import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { onSlow } from './api';

/** Same as the Contact form's inputs. */
export const inputClass =
  'w-full border-b border-line-2 bg-transparent py-3.5 text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-brand';

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-fg-3">{label}</span>
      <input className={inputClass} {...props} />
      {hint && <span className="mt-1.5 block text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost'; busy?: boolean };

/** The site's pill buttons (primary = brand fill, ghost = outline). */
export function Button({ variant = 'primary', busy, children, className = '', disabled, ...props }: ButtonProps) {
  const styles =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand-2'
      : 'border border-line-2 text-fg hover:border-fg/40 hover:bg-white/[0.03]';
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium transition-colors disabled:opacity-60 ${styles} ${className}`}
      disabled={disabled || busy}
      {...props}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** The site's card surface (as used by Contact and the section blocks). */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-bg-2 p-6 sm:p-8 ${className}`}>{children}</div>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-fg">
      {children}
    </p>
  );
}

/** Full-height loading state, used while the server wakes from a cold start. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-fg-2">
      <Loader2 className="h-5 w-5 animate-spin text-brand" />
      {label}
    </div>
  );
}

/** A thin notice shown while any request is taking long (Render cold start). */
export function WakingBanner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => onSlow(setSlow), []);
  if (!slow) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-bg-3 px-4 py-2 text-xs text-fg-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
      Waking up the server — this can take up to a minute after a quiet period.
    </div>
  );
}
