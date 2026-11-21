// Notifications: icon, message and relative time per item. Tapping marks it
// read and opens the related lead or booking.

import { ArrowLeft, CalendarDays, Clock, IndianRupee, List, Undo2 } from 'lucide-react';
import { api } from '../api';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Empty, cx } from '../ui';

interface Note { id: string; type: string; message: string; at: string; read: boolean; link: string }

const ICON: Record<string, { icon: typeof List; tone: string }> = {
  leads_assigned: { icon: List, tone: 'bg-brand/15 text-brand' },
  lead_expiring: { icon: Clock, tone: 'bg-bad/15 text-bad' },
  booking_confirmed: { icon: CalendarDays, tone: 'bg-info/15 text-info' },
  booking_created: { icon: CalendarDays, tone: 'bg-info/15 text-info' },
  booking_cancelled: { icon: CalendarDays, tone: 'bg-bg-3 text-fg-3' },
  booking_rescheduled: { icon: CalendarDays, tone: 'bg-info/15 text-info' },
  lead_expired: { icon: Undo2, tone: 'bg-bg-3 text-fg-3' },
  assignment_expired: { icon: Undo2, tone: 'bg-bg-3 text-fg-3' },
  commission_paid: { icon: IndianRupee, tone: 'bg-good/15 text-good' },
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
  const openItem = async (n: Note) => {
    if (!n.read) await api('POST', `/notifications/${n.id}/read`).catch(() => undefined);
    navigate(n.link);
  };
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <button type="button" onClick={() => history.back()} aria-label="Back" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-fg-2 hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="flex-1 text-2xl font-medium tracking-[-0.02em]">Notifications</h1>
        {Boolean(state.data?.unread) && (
          <button type="button" className="min-h-11 text-sm font-medium text-brand" onClick={async () => { await api('POST', '/notifications/read-all').catch(() => undefined); void state.reload(); }}>
            Mark all read
          </button>
        )}
      </div>
      <Async state={state}>
        {({ notifications }) =>
          notifications.length === 0 ? (
            <Empty title="Nothing new">Assignments, expiring leads, bookings and payments show up here.</Empty>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const meta = ICON[n.type] ?? { icon: List, tone: 'bg-bg-3 text-fg-3' };
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className={cx('flex w-full items-start gap-3 rounded-3xl border px-4 py-4 text-left', n.read ? 'border-line bg-bg-2' : 'border-brand/50 bg-bg-2')}>
                      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', meta.tone)}><meta.icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={cx('block text-sm', n.read ? 'text-fg-2' : 'font-medium text-fg')}>{n.message}</span>
                        <span className="mt-1 block text-xs text-fg-3">{relativeTime(n.at)}</span>
                      </span>
                      {!n.read && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Async>
    </div>
  );
}
