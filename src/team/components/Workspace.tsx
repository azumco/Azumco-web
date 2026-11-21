// Team member workspace layout: a lead list, and on laptops (≥1024px) the
// selected lead's Log a call panel beside it. Selecting a lead swaps the
// panel without leaving the page; on smaller screens a lead opens its page.

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Store } from 'lucide-react';
import { navigate } from '../router';
import { cx } from '../ui';
import { LeadPanel } from '../pages/LeadDetail';
import type { Lead, TeamUser } from '../types';

function useIsLaptop() {
  const query = '(min-width: 1024px)';
  const [laptop, setLaptop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setLaptop(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return laptop;
}

export function LeadRow({ title, sub, right, selected, onOpen }: { title: string; sub: ReactNode; right: ReactNode; selected?: boolean; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={cx('flex w-full items-center gap-4 rounded-3xl border bg-bg-2 p-4 text-left transition-colors', selected ? 'border-brand/70' : 'border-line hover:border-line-2')}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-3 text-fg-3"><Store className="h-4.5 w-4.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{title}</span>
          <span className="block truncate text-xs text-fg-3">{sub}</span>
        </span>
        {right}
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-3 lg:hidden" />
      </button>
    </li>
  );
}

export default function Workspace({ user, leads, header, renderList, onChanged }: {
  user: TeamUser;
  leads: Lead[];
  header: ReactNode;
  renderList: (selectedId: string, open: (id: string) => void) => ReactNode;
  onChanged: () => void;
}) {
  const laptop = useIsLaptop();
  const [selected, setSelected] = useState('');
  const current = leads.find((l) => l.id === selected) ? selected : leads[0]?.id ?? '';
  const open = (id: string) => (laptop ? setSelected(id) : navigate(`/team/leads/${id}`));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_1fr] lg:items-start">
      <div>
        {header}
        {renderList(laptop ? current : '', open)}
      </div>
      {laptop && current && (
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl border border-line bg-bg-2 p-6">
          <LeadPanel key={current} id={current} user={user} embedded onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}
