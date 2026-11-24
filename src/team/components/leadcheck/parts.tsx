// "Check against Google" building blocks (Figma: Lead check · Member side →
// Components): the status pill, the allowance line, a field result row and the
// lead card. Real tokens from team.css / ui.tsx.

import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronRight, Gauge, History, MapPin, Pause, Search, Store } from 'lucide-react';
import { formatDate } from '../../../../shared/time';
import { tally, type Allowance } from '../../leadCheck';
import { cx } from '../../ui';
import type { Lead } from '../../types';

// ─── Status pill ────────────────────────────────────────────────────────────

export type PillKind = 'not_checked' | 'matches' | 'differences' | 'pick' | 'not_on_google' | 'reviewed' | 'find_clients' | 'recent';

const PILL: Record<PillKind, { cls: string; icon: typeof Check | null }> = {
  not_checked: { cls: 'bg-bg-3 text-fg-2', icon: null },
  matches: { cls: 'bg-good/12 text-good', icon: Check },
  differences: { cls: 'bg-warn/12 text-warn', icon: AlertTriangle },
  pick: { cls: 'bg-info/12 text-info', icon: Search },
  not_on_google: { cls: 'bg-bad/12 text-bad', icon: MapPin },
  reviewed: { cls: 'bg-violet/12 text-violet', icon: Check },
  find_clients: { cls: 'bg-bg-3 text-fg-2', icon: MapPin },
  recent: { cls: 'bg-bg-3 text-fg-2', icon: History },
};

export function StatusPill({ kind, children }: { kind: PillKind; children: ReactNode }) {
  const p = PILL[kind];
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', p.cls)}>
      {p.icon && <p.icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/** Which pill a lead shows, and its words. */
export function pillFor(lead: Pick<Lead, 'origin' | 'googleCheck'>, now = Date.now()): { kind: PillKind; label: string } {
  if (lead.origin === 'find_clients') return { kind: 'find_clients', label: 'From Find clients' };
  const g = lead.googleCheck;
  switch (g.status) {
    case 'matches':
      return { kind: 'matches', label: 'Matches Google' };
    case 'reviewed':
      return { kind: 'reviewed', label: 'Reviewed' };
    case 'needs_review': {
      const t = tally(g.fields);
      return t.different
        ? { kind: 'differences', label: `${t.different} difference${t.different === 1 ? '' : 's'}` }
        : { kind: 'differences', label: `${t.googleOnly} only on Google` };
    }
    case 'pick':
      return { kind: 'pick', label: `${g.candidates} possible match${g.candidates === 1 ? '' : 'es'}` };
    case 'not_found':
    case 'not_on_google':
      return { kind: 'not_on_google', label: 'Not on Google' };
    default:
      return g.nextCheckAt && Date.parse(g.nextCheckAt) > now ? { kind: 'recent', label: 'Checked recently' } : { kind: 'not_checked', label: 'Not checked' };
  }
}

export const LeadPill = ({ lead }: { lead: Pick<Lead, 'origin' | 'googleCheck'> }) => {
  const p = pillFor(lead);
  return <StatusPill kind={p.kind}>{p.label}</StatusPill>;
};

// ─── Allowance line ─────────────────────────────────────────────────────────

/** "1 Dec" (no year, no leading zero). */
export const shortDate = (iso: string) => formatDate(iso).replace(/\s\d{4}$/, '').replace(/^0/, '');

export function AllowanceLine({ allowance, compact }: { allowance: Allowance | undefined; compact?: boolean }) {
  if (!allowance?.mine) return null;
  const { mine, google } = allowance;
  if (google.paused) {
    return (
      <div className="flex min-h-11 items-center gap-3 rounded-2xl border border-violet/40 bg-violet/[0.06] px-4 py-2.5 text-sm">
        <Pause className="h-4 w-4 shrink-0 text-violet" />
        <span>Google checks are paused by the super admin</span>
      </div>
    );
  }
  const zero = mine.remaining <= 0;
  const low = !zero && mine.remaining <= Math.max(1, Math.ceil(mine.limit * 0.1));
  const pct = mine.limit ? Math.max(0, Math.min(100, (mine.remaining / mine.limit) * 100)) : 0;
  const tone = zero ? 'text-bad' : low ? 'text-warn' : 'text-good';
  const bar = zero ? 'bg-bad' : low ? 'bg-warn' : 'bg-good';
  return (
    <div className={cx('flex min-h-11 items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm', zero ? 'border-bad/40 bg-bad/[0.06]' : 'border-line bg-bg-2')}>
      <Gauge className={cx('h-4 w-4 shrink-0', tone)} />
      <span className="min-w-0 flex-1">
        {mine.remaining.toLocaleString('en-IN')} of your {mine.limit.toLocaleString('en-IN')} checks left{zero ? ` · resets on ${shortDate(allowance.resetsOn)}` : compact ? '' : ' this month'}
      </span>
      <span className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-bg-3 sm:block" aria-hidden="true">
        <span className={cx('block h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

// ─── Field result row ───────────────────────────────────────────────────────

export type RowCode = 'same' | 'different' | 'google_only' | 'ours_only' | 'empty';

export function CodeBadge({ code }: { code: RowCode }) {
  if (code === 'same') return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-good/12 px-2.5 py-1 text-xs font-medium text-good"><Check className="h-3 w-3" />Same</span>;
  if (code === 'different') return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-warn/12 px-2.5 py-1 text-xs font-medium text-warn"><span className="h-1.5 w-1.5 rounded-full bg-current" />Different</span>;
  if (code === 'google_only') return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-info/12 px-2.5 py-1 text-xs font-medium text-info"><span className="h-1.5 w-1.5 rounded-full bg-current" />Only on Google</span>;
  if (code === 'ours_only') return <span className="whitespace-nowrap text-xs text-fg-3">Only yours</span>;
  return <span className="text-xs text-fg-3">—</span>;
}

export function FieldRow({ label, value, code, note }: { label: string; value: string; code: RowCode; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">{label}</p>
        <p className={cx('mt-1 break-words', value ? 'text-fg' : 'text-fg-3')}>{value || 'Not added'}</p>
        {note && <p className="mt-0.5 text-xs text-fg-3">{note}</p>}
      </div>
      <CodeBadge code={code} />
    </div>
  );
}

// ─── Lead card ──────────────────────────────────────────────────────────────

export function LeadCard({ title, sub, pill, selected, muted, onOpen }: { title: string; sub: string; pill: ReactNode; selected?: boolean; muted?: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={cx('flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition-colors', selected ? 'border-brand/70 bg-bg-3/60' : 'border-line bg-bg-2 hover:border-line-2')}
      >
        <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-3', selected ? 'text-brand' : 'text-fg-3')}><Store className="h-4.5 w-4.5" /></span>
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate font-medium', muted ? 'text-fg-2' : 'text-fg')}>{title}</span>
          <span className="block truncate text-xs text-fg-3">{sub}</span>
          <span className="mt-1.5 block">{pill}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-3" />
      </button>
    </li>
  );
}
