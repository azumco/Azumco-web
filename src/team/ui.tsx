// The team area's shared components — each built once and reused everywhere.
// Site tokens and patterns only: underline inputs, pill buttons, rounded-3xl
// bordered surfaces, Satoshi + Instrument Serif italic accent words.
// There is deliberately no native select element: ≤6 options use chips or a
// segmented control, long lists use SearchableSelect, dates use quick chips.

import {
  useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';
import { AlertCircle, CalendarDays, Check, ChevronDown, Clock, Inbox, Loader2, Minus, Plus, RotateCw, Search, X } from 'lucide-react';
import { formatDuration, statusTone, urgencyOf } from '../../shared/rules';
import { addDays } from '../../shared/slots';
import { formatDate, istDate } from '../../shared/time';
import { onSlow } from './api';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const labelClass = 'text-xs text-fg-3';

// ─── Buttons ────────────────────────────────────────────────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean; size?: 'md' | 'sm' };

/** Pill buttons: primary (brand fill), secondary (outline), ghost (orange text link). */
export function Button({ variant = 'primary', busy, size = 'md', children, className = '', disabled, ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-brand text-bg font-medium hover:bg-brand-2 rounded-full',
    secondary: 'border border-line-2 text-fg hover:border-fg/40 hover:bg-white/[0.03] rounded-full',
    ghost: 'text-brand hover:text-brand-2 rounded-full',
    danger: 'border border-line-2 text-fg-2 hover:border-bad hover:text-bad rounded-full',
  }[variant];
  const sizing = variant === 'ghost' ? 'min-h-11 px-1' : size === 'sm' ? 'min-h-11 px-4' : 'min-h-12 px-6';
  return (
    <button
      type="button"
      className={cx('inline-flex items-center justify-center gap-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50', sizing, styles, className)}
      disabled={disabled || busy}
      {...props}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────

/**
 * Two-panel page layouts. Every track is minmax(0, …) so wide content (a chip
 * row, a day strip) can never push a column past the main area. Below 1100px
 * the panels stack in one column.
 */
export const SPLIT_LIST = 'grid grid-cols-[minmax(0,1fr)] gap-6 min-[1100px]:grid-cols-[400px_minmax(0,1fr)] min-[1100px]:items-start';
export const SPLIT_SUMMARY = 'grid grid-cols-[minmax(0,1fr)] gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_360px] min-[1100px]:items-start';
export const WIDE_QUERY = '(min-width: 1100px)';

/** A numbered step heading: ① How did the call go? */
export function StepLabel({ step, children }: { step?: number; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5 text-sm font-medium text-fg">
      {step !== undefined && <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-medium tabular-nums text-brand">{step}</span>}
      {children}
    </span>
  );
}

// ─── Choice chips & segmented control ───────────────────────────────────────

export function ChoiceChip({ on, children, onClick, disabled, className = '' }: { on?: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors disabled:opacity-40',
        on ? 'border-brand bg-brand/10 text-brand' : 'border-line-2 text-fg-2 hover:border-fg/40 hover:text-fg',
        className,
      )}
    >
      {on && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

type Opt<T extends string> = T | { value: T; label: ReactNode };
const optValue = <T extends string>(o: Opt<T>) => (typeof o === 'string' ? o : o.value);
const optLabel = <T extends string>(o: Opt<T>) => (typeof o === 'string' ? o : o.label);

/** Single choice (click again to clear unless `required`). */
export function ChipGroup<T extends string>({ label, options, value, onChange, required, step }: { label?: string; options: readonly Opt<T>[]; value: T | ''; onChange: (v: T | '') => void; required?: boolean; step?: number }) {
  return (
    <fieldset>
      {label && <legend className={step !== undefined ? 'mb-3' : 'mb-2'}><StepLabel step={step}>{label}</StepLabel></legend>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const v = optValue(o);
          return (
            <ChoiceChip key={v} on={value === v} onClick={() => onChange(value === v && !required ? '' : v)}>
              {optLabel(o)}
            </ChoiceChip>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Multiple choice. */
export function MultiChips<T extends string>({ label, options, value, onChange, step }: { label?: string; options: readonly Opt<T>[]; value: T[]; onChange: (v: T[]) => void; step?: number }) {
  return (
    <fieldset>
      {label && <legend className={step !== undefined ? 'mb-3' : 'mb-2'}><StepLabel step={step}>{label}</StepLabel></legend>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const v = optValue(o);
          const on = value.includes(v);
          return (
            <ChoiceChip key={v} on={on} onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}>
              {optLabel(o)}
            </ChoiceChip>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label, className = '', step }: { options: readonly Opt<T>[]; value: T; onChange: (v: T) => void; label?: string; className?: string; step?: number }) {
  return (
    <div className={className}>
      {label && <p className={step !== undefined ? 'mb-3' : 'mb-2'}><StepLabel step={step}>{label}</StepLabel></p>}
      <div role="radiogroup" aria-label={label} className="flex rounded-full border border-line bg-bg-2 p-1">
        {options.map((o) => {
          const v = optValue(o);
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(v)}
              className={cx('flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm transition-colors', on ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:text-fg')}
            >
              {optLabel(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Quick dates: Today / Tomorrow / In 3 days / Pick date. */
export function QuickDate({ label, value, onChange, step }: { label?: string; value: string; onChange: (v: string) => void; step?: number }) {
  const today = istDate();
  const quick = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'In 3 days', value: addDays(today, 3) },
  ];
  const custom = Boolean(value) && !quick.some((q) => q.value === value);
  const pickRef = useRef<HTMLInputElement>(null);
  return (
    <fieldset>
      {label && <legend className={step !== undefined ? 'mb-3' : 'mb-2'}><StepLabel step={step}>{label}</StepLabel></legend>}
      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <ChoiceChip key={q.label} on={value === q.value} onClick={() => onChange(value === q.value ? '' : q.value)}>
            {q.label}
          </ChoiceChip>
        ))}
        <label className={cx('relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm', custom ? 'border-brand bg-brand/10 text-brand' : 'border-line-2 text-fg-2 hover:text-fg')}>
          <CalendarDays className="h-3.5 w-3.5" />
          {custom ? formatDate(value) : 'Pick date'}
          <input
            ref={pickRef}
            type="date"
            min={today}
            value={custom ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Pick a date"
          />
        </label>
      </div>
    </fieldset>
  );
}

// ─── Status, countdown and tags ─────────────────────────────────────────────

const TONES = {
  new: 'bg-bg-3 text-fg-2',
  contacted: 'bg-warn/12 text-warn',
  qualified: 'bg-info/12 text-info',
  proposal: 'bg-violet/12 text-violet',
  won: 'bg-good/12 text-good',
  lost: 'bg-bad/12 text-bad',
} as const;

export function StatusPill({ status }: { status: string }) {
  const { label, tone } = statusTone(status);
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', TONES[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export type TagTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'violet' | 'brand' | 'muted';
const TAG: Record<TagTone, string> = {
  neutral: 'bg-bg-3 text-fg-2',
  muted: 'border border-line text-fg-3',
  good: 'bg-good/12 text-good',
  warn: 'bg-warn/12 text-warn',
  bad: 'bg-bad/12 text-bad',
  info: 'bg-info/12 text-info',
  violet: 'bg-violet/12 text-violet',
  brand: 'bg-brand/12 text-brand',
};

export function Tag({ children, tone = 'neutral', dot = true }: { children: ReactNode; tone?: TagTone; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', TAG[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Countdown chip: normal, warning ≤ 12h, urgent ≤ 3h, or "No deadline". */
export function Countdown({ expiresAt, now }: { expiresAt: string | null; now: number }) {
  if (!expiresAt) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line-2 px-2.5 py-1 text-xs text-fg-3">
        <Clock className="h-3 w-3" /> No deadline
      </span>
    );
  }
  const left = Date.parse(expiresAt) - now;
  const u = urgencyOf(left);
  const style = u === 'urgent' || u === 'expired' ? 'bg-bad/12 text-bad' : u === 'warning' ? 'bg-warn/12 text-warn' : 'bg-bg-3 text-fg-2';
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium tabular-nums', style)}>
      <Clock className="h-3 w-3" /> {u === 'expired' ? 'Expired' : formatDuration(left)}
    </span>
  );
}

/** Initials from the person's real name: "First Last" → "FL", "First" → "F". */
export const initials = (name: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

/** A user's stored calendar colour as a tag tone (team members are neutral). */
export const colourTone = (c: string | undefined): TagTone =>
  (['brand', 'info', 'good', 'violet', 'warn', 'bad'] as const).includes(c as 'brand') ? (c as TagTone) : 'neutral';

export function Avatar({ name, tone = 'brand', size = 'md' }: { name: string; tone?: TagTone; size?: 'md' | 'lg' }) {
  return (
    <span aria-hidden="true" className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-medium', size === 'lg' ? 'h-11 w-11 text-sm' : 'h-8 w-8 text-[11px]', TAG[tone])}>
      {initials(name)}
    </span>
  );
}

// ─── Inputs ─────────────────────────────────────────────────────────────────

export const inputClass =
  'w-full border-b border-line-2 bg-transparent py-2.5 text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-brand disabled:opacity-60';

export function Field({ label, hint, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className={labelClass}>{label}</span>
      <input className={inputClass} {...props} />
      {hint && <span className="mt-1.5 block text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

/** Boxed field used in compact forms (search bars, time inputs, amounts). */
export function BoxInput({ label, suffix, icon, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; suffix?: ReactNode; icon?: ReactNode }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className={cx(labelClass, 'mb-1.5 block')}>{label}</span>}
      <span className="flex min-h-12 items-center gap-2 rounded-2xl border border-line-2 bg-bg-2 px-4 focus-within:border-brand">
        {icon}
        <input className="w-full min-w-0 bg-transparent text-fg placeholder:text-fg-3 outline-none" {...props} />
        {suffix}
      </span>
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={cx('flex min-h-11 items-center justify-between gap-4', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <span>
        <span className="text-sm text-fg">{label}</span>
        {hint && <span className="block text-xs text-fg-3">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full border border-line-2 bg-bg-3 transition-colors peer-checked:border-brand peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-brand after:absolute after:left-1 after:top-1 after:h-4.5 after:w-4.5 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-bg"
      />
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled, title, tone = 'brand' }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean; title?: string; tone?: 'brand' | 'good' }) {
  return (
    <label title={title} className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} aria-label={label} />
      <span
        aria-hidden="true"
        className={cx(
          'flex h-5 w-5 items-center justify-center rounded-md border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-brand',
          checked ? (tone === 'good' ? 'border-good bg-good text-bg' : 'border-brand bg-brand text-bg') : 'border-line-2 bg-transparent',
          disabled && 'opacity-40',
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </label>
  );
}

export function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <div>
      <span className={cx(labelClass, 'mb-1.5 block')}>{label}</span>
      <div className="flex min-h-12 items-center gap-1 rounded-2xl border border-line-2 bg-bg-2 px-1.5">
        <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-bg-3 text-fg disabled:opacity-40">
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-10 text-center tabular-nums" aria-live="polite">{value}</span>
        <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-bg-3 text-fg disabled:opacity-40">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Searchable select for long lists: a closed field, then a popover with a
 * search box, the options and a check on the selected one. Keyboard: ↑ ↓ to
 * move, Enter to choose, Esc to close. `allowCustom` offers "Use “…”" for
 * values not in the list.
 */
export function SearchableSelect({
  label, value, options, onChange, placeholder = 'Choose…', allowCustom, required, icon, className = '',
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  required?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.toLowerCase().includes(t)) : [...options];
  }, [q, options]);
  const custom = allowCustom && q.trim() && !options.some((o) => o.toLowerCase() === q.trim().toLowerCase()) ? q.trim() : '';
  const items = custom ? [...filtered, custom] : filtered;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ('');
    button.current?.focus();
  };

  return (
    <div ref={wrap} className={cx('relative', className)}>
      <span id={`${id}-label`} className={cx(labelClass, 'mb-1.5 block')}>
        {label}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        onClick={() => {
          setOpen((v) => !v);
          setActive(Math.max(0, options.indexOf(value)));
        }}
        className={cx('flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border bg-bg-2 px-4 text-left', open ? 'border-brand' : 'border-line-2')}
      >
        <span className={cx('truncate', value ? 'text-fg' : 'text-fg-3')}>{value || placeholder}</span>
        {icon ?? <ChevronDown className="h-4 w-4 shrink-0 text-fg-3" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-[60] mt-2 min-w-64 rounded-2xl border border-line-2 bg-bg-2 p-2 shadow-2xl">
          <label className="flex min-h-11 items-center gap-2 rounded-xl bg-bg-3 px-3">
            <Search className="h-4 w-4 text-fg-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(items.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (items[active]) choose(items[active]);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setOpen(false);
                  button.current?.focus();
                }
              }}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-controls={`${id}-list`}
              aria-activedescendant={items[active] ? `${id}-opt-${active}` : undefined}
              className="w-full bg-transparent text-sm text-fg placeholder:text-fg-3 outline-none"
            />
          </label>
          <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="mt-1 max-h-64 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-3 text-sm text-fg-3">No matches.</li>}
            {items.map((o, i) => (
              <li
                key={`${o}-${i}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={o === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                className={cx('flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-sm', i === active ? 'bg-bg-3 text-fg' : 'text-fg-2')}
              >
                <span className="truncate">{o === custom ? `Use “${o}”` : o}</span>
                {o === value && <Check className="h-4 w-4 shrink-0 text-brand" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Surfaces & page chrome ─────────────────────────────────────────────────

export function Card({ children, className = '', as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  return <As className={cx('rounded-3xl border border-line bg-bg-2 p-5 sm:p-6', className)}>{children}</As>;
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-medium text-fg">{title}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'brand' }) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'brand' ? 'text-brand' : 'text-fg';
  return (
    <div className="rounded-3xl border border-line bg-bg-2 p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">{label}</p>
      <p className={cx('mt-2 text-3xl font-medium tracking-[-0.03em] tabular-nums', color)}>{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-fg-3">{hint}</p>}
    </div>
  );
}

/** Page title with the orange serif-italic accent word. */
export function PageTitle({ title, accent, eyebrow, subtitle, children }: { title: string; accent?: ReactNode; eyebrow?: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-fg-3">{eyebrow}</p>}
        <h1 className="text-3xl font-medium leading-[1.05] tracking-[-0.035em] sm:text-[2.6rem]">
          {title} {accent !== undefined && <span className="font-serif font-normal italic tracking-normal text-brand">{accent}</span>}
        </h1>
        {subtitle && <p className="mt-2 text-fg-2">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-fg">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
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

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line-2 px-6 py-10 text-center">
      <Inbox className="h-6 w-6 text-fg-3" />
      <p className="mt-3 font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-line bg-bg-2 px-6 py-12 text-center">
      <AlertCircle className="h-6 w-6 text-bad" />
      <p className="mt-3 max-w-sm text-sm text-fg-2">{message}</p>
      <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
        <RotateCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  );
}

/** Loading / error / content for a useApi result. */
export function Async<T>({ state, children, label }: { state: { data: T | null; error: { message: string } | null; loading: boolean; reload: () => void }; children: (data: T) => ReactNode; label?: string }) {
  if (state.error && !state.data) return <LoadError message={state.error.message} onRetry={state.reload} />;
  if (!state.data) return <Loading label={label} />;
  return <>{children(state.data)}</>;
}

/**
 * Dialog: centred on desktop, bottom sheet on phones. Esc or X closes, focus
 * moves into the dialog and returns to whatever opened it.
 */
export function Modal({ title, accent, subtitle, open, onClose, children, wide }: { title: string; accent?: string; subtitle?: ReactNode; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the effect: callers often pass a new
  // function on every render, and re-running would move focus back to the
  // first field after each keystroke.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && ref.current) {
        // Keep focus inside the dialog.
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, textarea, [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('[data-autofocus], input, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-bg-2 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-7', wide ? 'sm:max-w-xl' : 'sm:max-w-lg')}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={id} className="text-2xl font-medium tracking-[-0.02em]">
              {title} {accent && <span className="font-serif font-normal italic tracking-normal text-brand">{accent}</span>}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-3 text-fg-2 hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ percent, tone = 'brand', label }: { percent: number; tone?: 'brand' | 'good'; label?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-1.5 rounded-full bg-bg-3">
      <div className={cx('h-1.5 rounded-full', tone === 'good' ? 'bg-good' : 'bg-brand')} style={{ width: `${p}%` }} />
    </div>
  );
}

/** Required wherever Google Places content is shown. */
export function GoogleAttribution() {
  return <span className="text-xs text-fg-3">Google Maps</span>;
}

export const WAKING_TEXT = 'Waking up the server — this can take up to a minute after a quiet period.';

/** A thin notice shown while any request is slow (Render cold start). */
export function WakingBanner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => onSlow(setSlow), []);
  if (!slow) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 bg-bg-3 px-4 py-2 text-xs text-fg-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
      {WAKING_TEXT}
    </div>
  );
}

export { cx };
