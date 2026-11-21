// Team-area building blocks, made only from the public site's tokens and
// patterns: underline inputs (Contact form), pill buttons, rounded-3xl
// bordered surfaces, Eyebrow labels and serif-italic accent headings.
// Status colours use the site's palette: neutral greys, brand-2 for warnings,
// solid brand (with dark text, for contrast) for urgent states.

import {
  useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, Inbox, Loader2, RotateCw, X } from 'lucide-react';
import { Eyebrow } from '../components/ui';
import { formatDuration, urgencyOf } from '../../shared/rules';
import { onSlow } from './api';

/** Same as the Contact form's inputs. */
export const inputClass =
  'w-full border-b border-line-2 bg-transparent py-3 text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-brand disabled:opacity-60';

const labelClass = 'text-xs uppercase tracking-[0.18em] text-fg-3';

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input className={inputClass} {...props} />
      {hint && <span className="mt-1.5 block text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea className={`${inputClass} min-h-20 resize-y`} {...props} />
    </label>
  );
}

export function Select({ label, options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: (string | { value: string; label: string })[] }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select className={`${inputClass} cursor-pointer bg-bg`} {...props}>
        {options.map((o) => {
          const { value, label: l } = typeof o === 'string' ? { value: o, label: o || '—' } : o;
          return (
            <option key={value} value={value} className="bg-bg-2">
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="text-sm text-fg">{label}</span>
        {hint && <span className="block text-xs text-fg-3">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full border border-line-2 bg-bg-3 transition-colors peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-brand after:absolute after:left-1 after:top-1 after:h-4.5 after:w-4.5 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet' | 'danger'; busy?: boolean; size?: 'md' | 'sm' };

/** The site's pill buttons. All sizes keep a 44px+ tap target. */
export function Button({ variant = 'primary', busy, size = 'md', children, className = '', disabled, ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-brand text-white hover:bg-brand-2',
    ghost: 'border border-line-2 text-fg hover:border-fg/40 hover:bg-white/[0.03]',
    quiet: 'text-fg-2 hover:text-fg hover:bg-white/[0.04]',
    danger: 'border border-line-2 text-fg-2 hover:border-brand hover:text-brand-2',
  }[variant];
  const sizing = size === 'sm' ? 'min-h-11 px-4' : 'min-h-12 px-6';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${sizing} ${styles} ${className}`}
      disabled={disabled || busy}
      {...props}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Selectable chip (one-handed choices: outcome, rating, filters). */
export function Chip({ selected, children, onClick, className = '' }: { selected?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
        selected ? 'border-brand bg-brand/15 text-fg' : 'border-line-2 text-fg-2 hover:border-fg/40 hover:text-fg'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function ChipGroup<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | ''; onChange: (v: T | '') => void }) {
  return (
    <fieldset>
      <legend className={labelClass}>{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} selected={value === o} onClick={() => onChange(value === o ? '' : o)}>
            {o}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'urgent' | 'ok' | 'muted' }) {
  const styles = {
    neutral: 'border-line-2 text-fg-2',
    muted: 'border-line text-fg-3',
    ok: 'border-fg/30 text-fg',
    warn: 'border-brand-2/60 text-brand-2',
    urgent: 'border-brand bg-brand text-bg font-medium',
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${styles}`}>{children}</span>;
}

/** Assignment countdown: normal > 12h, warning ≤ 12h, urgent ≤ 3h. */
export function Countdown({ expiresAt, now }: { expiresAt: string; now: number }) {
  const left = Date.parse(expiresAt) - now;
  const u = urgencyOf(left);
  if (u === 'expired') return <Badge tone="urgent">Expired</Badge>;
  return <Badge tone={u === 'urgent' ? 'urgent' : u === 'warning' ? 'warn' : 'neutral'}>Expires in {formatDuration(left)}</Badge>;
}

/** The site's card surface. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-bg-2 p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-3xl border border-line bg-bg-2 p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-fg-3">{label}</p>
      <p className={`mt-2 text-3xl font-medium tracking-[-0.03em] ${accent ? 'text-brand' : 'text-fg'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-3">{hint}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, accent, children }: { eyebrow: string; title: string; accent?: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-3xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-5xl">
          {title} {accent && <span className="font-serif font-normal italic tracking-normal text-brand">{accent}</span>}
        </h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-fg">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <span>{children}</span>
    </p>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-fg-2">
      <Loader2 className="h-5 w-5 animate-spin text-brand" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line-2 px-6 py-12 text-center">
      <Inbox className="h-6 w-6 text-fg-3" />
      <p className="mt-3 font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-2">{children}</div>}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-line bg-bg-2 px-6 py-12 text-center">
      <AlertCircle className="h-6 w-6 text-brand" />
      <p className="mt-3 max-w-sm text-sm text-fg-2">{message}</p>
      <Button variant="ghost" size="sm" className="mt-5" onClick={onRetry}>
        <RotateCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}

/** Shows loading / error / content for a useApi result. */
export function Async<T>({ state, children, label }: { state: { data: T | null; error: { message: string } | null; loading: boolean; reload: () => void }; children: (data: T) => ReactNode; label?: string }) {
  if (state.error && !state.data) return <LoadError message={state.error.message} onRetry={state.reload} />;
  if (!state.data) return <Loading label={label} />;
  return <>{children(state.data)}</>;
}

/** Dialog: a centred panel on desktop, a bottom sheet on phones. */
export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-bg-2 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl sm:p-7"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id={id} className="text-xl font-medium tracking-[-0.02em]">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-2 hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Required wherever Google Places content is shown. */
export function GoogleAttribution() {
  return <p className="text-xs text-fg-3">Data from <span className="text-fg-2">Google Maps</span></p>;
}

/** A thin notice shown while any request is taking long (Render cold start). */
export function WakingBanner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => onSlow(setSlow), []);
  if (!slow) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 bg-bg-3 px-4 py-2 text-xs text-fg-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
      Waking up the server — this can take up to a minute after a quiet period.
    </div>
  );
}

/** A labelled horizontal bar list for small breakdowns (counts by category). */
export function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Card>
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-fg-3">No data yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map(([k, v]) => (
            <li key={k}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate text-fg-2">{k}</span>
                <span className="tabular-nums text-fg">{v}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-bg-3">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
