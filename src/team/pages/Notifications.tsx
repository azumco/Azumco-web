import { formatDateTime } from '../../../shared/time';
import { api } from '../api';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Async, Button, Empty, PageTitle, cx } from '../ui';

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
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Your" accent="inbox">
        {Boolean(state.data?.unread) && (
          <Button variant="secondary" size="sm" onClick={async () => { await api('POST', '/notifications/read-all').catch(() => undefined); void state.reload(); }}>
            Mark all read
          </Button>
        )}
      </PageTitle>
      <Async state={state}>
        {({ notifications }) =>
          notifications.length === 0 ? (
            <Empty title="Nothing new">Assignments, expiries and bookings show up here.</Empty>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const lead = ['assignment_expired', 'leads_assigned'].includes(n.type) ? n.refId : '';
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      disabled={!lead}
                      onClick={() => lead && navigate(`/team/leads/${lead}`)}
                      className={cx('w-full rounded-3xl border px-5 py-4 text-left', n.read ? 'border-line bg-bg' : 'border-line-2 bg-bg-2', lead ? 'hover:border-fg/30' : 'cursor-default')}
                    >
                      <p className={cx('text-sm', n.read ? 'text-fg-2' : 'text-fg')}>
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
