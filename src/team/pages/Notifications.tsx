// Notifications: icon, message and relative time per item. Tapping marks it
// read and opens the related lead or booking.

import { AlertTriangle, ArrowLeft, Bell, CalendarDays, ChevronRight, Clock, IndianRupee, List, Target, Undo2 } from 'lucide-react';
import { api } from '../api';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Button, cx } from '../ui';

interface Note { id: string; type: string; message: string; at: string; read: boolean; link: string }

const ICON: Record<string, { icon: typeof List; tone: string }> = {
  leads_assigned: { icon: List, tone: 'bg-brand/15 text-brand' },
  lead_added: { icon: List, tone: 'bg-brand/15 text-brand' },
  lead_expiring: { icon: Clock, tone: 'bg-bad/15 text-bad' },
  booking_confirmed: { icon: CalendarDays, tone: 'bg-info/15 text-info' },
  booking_created: { icon: CalendarDays, tone: 'bg-info/15 text-info' },
  booking_cancelled: { icon: CalendarDays, tone: 'bg-bg-3 text-fg-3' },
  booking_rescheduled: { icon: CalendarDays, tone: 'bg-info/15 text-info' },
  lead_expired: { icon: AlertTriangle, tone: 'bg-bg-3 text-fg-3' },
  assignment_expired: { icon: Undo2, tone: 'bg-bg-3 text-fg-3' },
  commission_paid: { icon: IndianRupee, tone: 'bg-good/15 text-good' },
  goal_updated: { icon: Target, tone: 'bg-violet/15 text-violet' },
};

/** "2h ago", "Yesterday", "3 days ago". */
export function relativeTime(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86_400);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

export default function Notifications() {
  const state = useApi<{ unread: number; notifications: Note[] }>('/notifications');
  const unread = state.data?.unread ?? 0;
  const openItem = async (n: Note) => {
    if (!n.read) await api('POST', `/notifications/${n.id}/read`).catch(() => undefined);
    navigate(n.link);
  };
  return (
    <div>
      <div className="mb-6 flex items-end gap-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="mb-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg md:hidden">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
            Your <span className="font-serif font-normal italic tracking-normal text-brand">notifications</span>
          </h1>
          <p className="mt-1 text-fg-2">{state.data ? (unread ? `${unread} unread` : 'All caught up') : ' '}</p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={async () => { await api('POST', '/notifications/read-all').catch(() => undefined); void state.reload(); }}>
            Mark all read
          </Button>
        )}
      </div>
      <Async state={state} label="Loading notifications…">
        {({ notifications }) =>
          notifications.length === 0 ? (
            <section className="flex flex-col items-center rounded-3xl border border-line bg-bg-2 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-3 text-fg-3"><Bell className="h-6 w-6" /></span>
              <p className="mt-5 text-lg font-medium">Nothing new</p>
              <p className="mt-1 max-w-sm text-sm text-fg-2">New leads, expiring leads, bookings and payments show up here.</p>
            </section>
          ) : (
            <>
              <ul className="overflow-hidden rounded-3xl border border-line bg-bg-2">
                {notifications.map((n) => {
                  const meta = ICON[n.type] ?? { icon: Bell, tone: 'bg-bg-3 text-fg-3' };
                  return (
                    <li key={n.id} className="border-b border-line last:border-0">
                      <button type="button" onClick={() => openItem(n)} className={cx('flex w-full items-center gap-4 px-4 py-4 text-left transition-colors sm:px-6', n.read ? 'hover:bg-bg-3/40' : 'bg-brand/[0.06] hover:bg-brand/10')}>
                        <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', meta.tone)}><meta.icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className={cx('block text-sm', n.read ? 'text-fg-2' : 'font-medium text-fg')}>{n.message}</span>
                          <span className="mt-1 block text-xs text-fg-3">{relativeTime(n.at)}</span>
                        </span>
                        {!n.read && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                        <ChevronRight className="h-4 w-4 shrink-0 text-fg-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-sm text-fg-3">Tap a notification to open the lead or booking it is about.</p>
            </>
          )
        }
      </Async>
    </div>
  );
}
