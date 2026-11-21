import { formatDateTime } from '../../../shared/time';
import { api } from '../api';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Button, Empty, PageHeader } from '../ui';

interface Note {
  id: string;
  type: string;
  message: string;
  refId: string;
  at: string;
  read: boolean;
}

export default function Notifications() {
  const state = useApi<{ unread: number; notifications: Note[] }>('/notifications');
  return (
    <div>
      <PageHeader eyebrow="Inbox" title="Notifi" accent="cations">
        {Boolean(state.data?.unread) && (
          <Button variant="ghost" size="sm" onClick={async () => { await api('POST', '/notifications/read-all').catch(() => undefined); void state.reload(); }}>
            Mark all read
          </Button>
        )}
      </PageHeader>
      <Async state={state}>
        {({ notifications }) =>
          notifications.length === 0 ? (
            <Empty title="Nothing new">Assignments, expiries and bookings will show up here.</Empty>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const lead = n.type === 'assignment_expired' || n.type === 'leads_assigned' ? n.refId : '';
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      disabled={!lead}
                      onClick={() => lead && navigate(`/team/leads/${lead}`)}
                      className={`w-full rounded-3xl border px-5 py-4 text-left transition-colors ${n.read ? 'border-line bg-bg' : 'border-line-2 bg-bg-2'} ${lead ? 'hover:border-fg/30' : 'cursor-default'}`}
                    >
                      <p className={`text-sm ${n.read ? 'text-fg-2' : 'text-fg'}`}>
                        {!n.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand align-middle" />}
                        {n.message}
                      </p>
                      <p className="mt-1 text-xs text-fg-3">{formatDateTime(n.at)}</p>
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
