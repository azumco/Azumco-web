// Team member workspace: a 400px lead list and, from 1100px, a detail panel
// that fills the rest. Selecting a lead swaps the panel without leaving the
// page; below 1100px the panels stack and a lead opens its own page.

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Store } from 'lucide-react';
import { navigate } from '../router';
import { SPLIT_LIST, WIDE_QUERY, cx } from '../ui';

export function useIsWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

export function LeadRow({ title, sub, right, selected, onOpen }: { title: string; sub: ReactNode; right: ReactNode; selected?: boolean; onOpen: () => void }) {
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
          <span className="block truncate font-medium text-fg">{title}</span>
          <span className="block truncate text-xs text-fg-3">{sub}</span>
        </span>
        <span className="shrink-0">{right}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-3 min-[1100px]:hidden" />
      </button>
    </li>
  );
}

/** The detail panel's frame beside the list; a container for its own breakpoints. */
export function DetailPanel({ children }: { children: ReactNode }) {
  return (
    <section className="@container rounded-3xl border border-line bg-bg-2 p-5 sm:p-7">
      {children}
    </section>
  );
}

/** Controlled selection: the page owns which lead is open (so a banner can open one). */
export function useSelection(ids: string[]) {
  const wide = useIsWide();
  const [picked, setPicked] = useState('');
  const current = ids.includes(picked) ? picked : ids[0] ?? '';
  const open = (id: string) => (wide ? setPicked(id) : navigate(`/team/leads/${id}`));
  return { wide, current: wide ? current : '', open };
}

export default function Workspace({ header, list, detail, empty }: {
  /** Full-width page header (title, stats, banner). */
  header: ReactNode;
  /** Left column: segmented control / chips and the list. */
  list: ReactNode;
  /** The selected lead's panel, or null when nothing is selected. */
  detail: ReactNode | null;
  /** Shown in the detail area when there is nothing to show. */
  empty: ReactNode;
}) {
  const wide = useIsWide();
  return (
    <div>
      {header}
      <div className={SPLIT_LIST}>
        <div className="min-w-0">{list}</div>
        {wide && <div className="min-w-0">{detail ?? empty}</div>}
      </div>
    </div>
  );
}
