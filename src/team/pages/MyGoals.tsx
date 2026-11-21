// Team member: goals assigned to them or that they support. Only goals
// assigned to them can be ticked (the server enforces it too).

import { Clock } from 'lucide-react';
import type { TimeLeft } from '../../../shared/rules';
import { formatDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Checkbox, Empty, ErrorText, Tag, cx, type TagTone } from '../ui';
import { firstName, type TeamUser } from '../types';

interface Goal { id: string; task: string; owner: string; deadline: string; status: string; timeLeft: TimeLeft; canChangeStatus: boolean; updatedAt: string }

const TONE: Record<string, TagTone> = { Done: 'good', 'In Progress': 'info', 'Not Started': 'neutral', 'On Hold': 'warn' };
const LABEL: Record<string, string> = { Done: 'Done', 'In Progress': 'In progress', 'Not Started': 'Not started', 'On Hold': 'On hold' };
const dayLabel = (d: string) => `${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${formatDate(d).slice(0, 6)}`;

function Left({ t }: { t: TimeLeft }) {
  if (t.kind === 'done' || t.kind === 'none') return <span className="text-fg-3">—</span>;
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs', t.kind === 'overdue' ? 'bg-bad/12 text-bad' : t.kind === 'today' ? 'bg-warn/12 text-warn' : 'bg-bg-3 text-fg-2')}>
      <Clock className="h-3 w-3" /> {t.label}
    </span>
  );
}

export default function MyGoals(_props: { user: TeamUser }) {
  const state = useApi<{ goals: Goal[] }>('/goals');
  const act = useAction();
  const tick = async (g: Goal, done: boolean) => {
    await act.run(() => api('PATCH', `/goals/${g.id}`, { status: done ? 'Done' : 'In Progress', expectedUpdatedAt: g.updatedAt }));
    void state.reload();
  };
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em]">
        My <span className="font-serif font-normal italic tracking-normal text-brand">goals</span>
      </h1>
      <p className="mt-1 text-fg-2">Set by the founders. Only you can tick these off.</p>
      <Async state={state} label="Loading goals…">
        {({ goals }) => {
          const count = (s: string) => goals.filter((g) => g.status === s).length;
          return (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-2 lg:gap-3">
                {[
                  ['Done', 'done', 'text-good', 'bg-good'],
                  ['In Progress', 'in progress', 'text-info', 'bg-info'],
                  ['Not Started', 'not started', 'text-fg', 'bg-fg-3'],
                ].map(([s, l, c, dot]) => (
                  <div key={s} className="rounded-2xl border border-line bg-bg-2 p-3 lg:flex lg:items-center lg:gap-3 lg:rounded-3xl lg:p-5">
                    <span className={cx('hidden h-2 w-2 rounded-full lg:inline-block', dot)} />
                    <p className={cx('text-xl font-medium tabular-nums lg:text-2xl', c)}>{count(s)}</p>
                    <p className="text-xs text-fg-3 lg:text-sm lg:text-fg-2">{l}</p>
                  </div>
                ))}
              </div>
              <ErrorText>{act.error}</ErrorText>
              {goals.length === 0 ? (
                <Empty title="No goals yet">Goals the founders assign to you will show up here.</Empty>
              ) : (
                <ul className="space-y-2 lg:space-y-0 lg:overflow-hidden lg:rounded-3xl lg:border lg:border-line lg:bg-bg-2">
                  {goals.map((g) => {
                    const done = g.status === 'Done';
                    const hint = `Only ${firstName(g.owner)} can mark this done`;
                    return (
                      <li key={g.id} className="rounded-3xl border border-line bg-bg-2 p-3 lg:grid lg:grid-cols-[auto_1fr_140px_140px_120px] lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:border-b lg:px-5 lg:last:border-0">
                        <div className="flex items-start gap-1 lg:contents">
                          <Checkbox checked={done} tone="good" disabled={!g.canChangeStatus} title={g.canChangeStatus ? undefined : hint} label={g.canChangeStatus ? `Mark “${g.task}” done` : hint} onChange={(v) => tick(g, v)} />
                          <div className="min-w-0 flex-1 pt-2.5 lg:pt-0">
                            <p className={cx('font-medium', done ? 'text-fg-3' : 'text-fg')}>{g.task}</p>
                            {!g.canChangeStatus && <p className="text-xs text-fg-3">Assigned to {firstName(g.owner)} — {hint}</p>}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-3 lg:hidden">
                              <span>{done ? 'Done' : g.deadline ? `Due ${dayLabel(g.deadline)}` : 'No deadline'}</span>
                              <Left t={g.timeLeft} />
                              <Tag tone={TONE[g.status] ?? 'neutral'} dot={false}>{LABEL[g.status] ?? g.status}</Tag>
                            </div>
                          </div>
                        </div>
                        <span className="hidden text-sm text-fg-2 lg:block">{g.deadline ? (done ? `Done` : dayLabel(g.deadline)) : '—'}</span>
                        <span className="hidden lg:block"><Left t={g.timeLeft} /></span>
                        <span className="hidden justify-self-end lg:block"><Tag tone={TONE[g.status] ?? 'neutral'} dot={false}>{LABEL[g.status] ?? g.status}</Tag></span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-sm text-fg-3">Tick a goal when it's done. Founders see your progress on their Goals page.</p>
            </div>
          );
        }}
      </Async>
    </div>
  );
}
