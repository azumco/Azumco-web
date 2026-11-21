import { ChevronRight, MapPin, Phone } from 'lucide-react';
import { formatDuration } from '../../../shared/rules';
import { formatDate } from '../../../shared/time';
import { navigate } from '../router';
import { Badge, Countdown } from '../ui';
import type { Lead } from '../types';

/** One lead as a tappable card — used for every lead list, phone first. */
export default function LeadCard({ lead, now, showAssignee, selected, onSelect }: {
  lead: Lead;
  now: number;
  showAssignee?: boolean;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
}) {
  const href = `/team/leads/${lead.id}`;
  const left = lead.expiresAt ? Date.parse(lead.expiresAt) - now : null;
  return (
    <div className={`flex items-stretch gap-2 rounded-3xl border bg-bg-2 transition-colors ${selected ? 'border-brand/60' : 'border-line hover:border-line-2'}`}>
      {onSelect && (
        <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-l-3xl">
          <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${lead.label}`} />
        </label>
      )}
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          navigate(href);
        }}
        className={`flex min-w-0 flex-1 items-center gap-3 py-4 pr-4 ${onSelect ? '' : 'pl-5'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-fg">{lead.label}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
            {lead.businessName && lead.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {lead.city}
              </span>
            )}
            {lead.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {lead.phone}
              </span>
            )}
            <span>{lead.status}</span>
            {lead.attempts > 0 && <span>{lead.attempts} call{lead.attempts === 1 ? '' : 's'}</span>}
            {showAssignee && <span>{lead.assigneeName ? `→ ${lead.assigneeName}` : 'Unclaimed'}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lead.timerRunning && lead.expiresAt && <Countdown expiresAt={lead.expiresAt} now={now} />}
            {lead.followUp === 'overdue' && <Badge tone="urgent">Follow-up overdue · {formatDate(lead.followUpDate)}</Badge>}
            {lead.followUp === 'today' && <Badge tone="warn">Follow-up today</Badge>}
            {lead.rating && <Badge>{lead.rating}</Badge>}
          </div>
          {lead.timerRunning && left !== null && left > 0 && !showAssignee && (
            <p className="mt-2 text-xs text-fg-2">This lead disappears in {formatDuration(left)} unless you contact them.</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-3" />
      </a>
    </div>
  );
}
