// Team member: goals assigned to them or that they support. Only the person a
// goal is assigned to can tick it (the server enforces it too). Laptop: a
// table (Goal, Assigned to, Due, Time left, Status). Phone: one card per goal.

import { Clock, Lock, Target } from 'lucide-react';
import type { TimeLeft } from '../../../shared/rules';
import { formatDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Checkbox, ErrorText, Tag, cx, type TagTone } from '../ui';
import { firstName, type TeamUser } from '../types';

interface Goal { id: string; task: string; owner: string; support?: string[]; deadline: string; status: string; timeLeft: TimeLeft; canChangeStatus: boolean; updatedAt: string }

const TONE: Record<string, TagTone> = { Done: 'good', 'In Progress': 'info', 'Not Started': 'neutral', 'On Hold': 'warn' };
const LABEL: Record<string, string> = { Done: 'Done', 'In Progress': 'In progress', 'Not Started': 'Not started', 'On Hold': 'On hold' };
const dayLabel = (d: string) => `${new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${formatDate(d).slice(0, 6)}`;

function Left({ t }: { t: TimeLeft }) {
  if (t.kind === 'done' || t.kind === 'none') return <span className="text-fg-3">—</span>;
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs', t.kind === 'overdue' ? 'bg-bad/12 text-bad' : t.kind === 'today' ? 'bg-warn/12 text-warn' : 'bg-bg-3 text-fg-2')}>
      <Clock className="h-3 w-3" /> {t.label}
    </span>
  );
}

const Status = ({ s }: { s: string }) => <Tag tone={TONE[s] ?? 'neutral'}>{LABEL[s] ?? s}</Tag>;

export default function MyGoals({ user }: { user: TeamUser }) {
  const state = useApi<{ goals: Goal[] }>('/goals');
  const act = useAction();
  const tick = async (g: Goal, done: boolean) => {
    await act.run(() => api('PATCH', `/goals/${g.id}`, { status: done ? 'Done' : 'In Progress', expectedUpdatedAt: g.updatedAt }));
    void state.reload();
  };
  const mine = (g: Goal) => g.owner === user.name;
  const supporting = (g: Goal) => (g.support ?? []).includes(user.name);
  const lockHint = (g: Goal) => `Only ${firstName(g.owner)} can mark this done`;
  const due = (g: Goal) => (g.status === 'Done' ? 'Done' : g.deadline ? dayLabel(g.deadline) : 'No deadline');

  const box = (g: Goal) => (
    <Checkbox
      checked={g.status === 'Done'}
      tone="good"
      disabled={!g.canChangeStatus}
      title={g.canChangeStatus ? undefined : lockHint(g)}
      label={g.canChangeStatus ? `Mark “${g.task}” done` : lockHint(g)}
      onChange={(v) => tick(g, v)}
    />
  );
  const lock = (g: Goal, extra = '') =>
    !g.canChangeStatus && (
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-3">
        <Lock className="h-3 w-3 shrink-0" /> {lockHint(g)}{extra}
      </p>
    );

  return (
    <div>
      <h1 className="text-[2.2rem] font-medium leading-tight tracking-[-0.035em] md:text-[2.6rem]">
        My <span className="font-serif font-normal italic tracking-normal text-brand">goals</span>
      </h1>
      <p className="mt-1 text-fg-2">Set by the founders. You can tick off the ones assigned to you.</p>
      <Async state={state} label="Loading goals…">
        {({ goals }) => {
          const count = (s: string) => goals.filter((g) => g.status === s).length;
          return (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                {[
                  ['Done', 'done', 'done', 'bg-good'],
                  ['In Progress', 'in progress', 'active', 'bg-info'],
                  ['Not Started', 'not started', 'to start', 'bg-fg-3'],
                ].map(([s, l, short, dot]) => (
                  <div key={s} className="flex items-center gap-2.5 rounded-2xl border border-line bg-bg-2 px-3 py-3 md:rounded-3xl md:px-6 md:py-5">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', dot)} />
                    <span className="text-xl font-medium tabular-nums md:text-2xl">{count(s)}</span>
                    <span className="truncate text-xs text-fg-3 md:text-sm md:text-fg-2"><span className="md:hidden">{short}</span><span className="hidden md:inline">{l}</span></span>
                  </div>
                ))}
              </div>
              <ErrorText>{act.error}</ErrorText>

              {goals.length === 0 ? (
                <section className="flex flex-col items-center rounded-3xl border border-line bg-bg-2 px-6 py-12 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/15 text-brand"><Target className="h-6 w-6" /></span>
                  <p className="mt-5 text-lg font-medium">No goals yet</p>
                  <p className="mt-1 max-w-sm text-sm text-fg-2">Goals the founders assign to you, or ask you to support, show up here.</p>
                </section>
              ) : (
                <>
                  {/* Laptop and tablet: table */}
                  <div className="hidden overflow-hidden rounded-3xl border border-line bg-bg-2 md:block">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-fg-3">
                          <th className="w-16 py-4 pl-6 font-normal"><span className="sr-only">Done</span></th>
                          <th className="py-4 font-normal">Goal</th>
                          <th className="w-[18%] py-4 font-normal">Assigned to</th>
                          <th className="w-[14%] py-4 font-normal">Due</th>
                          <th className="hidden w-[14%] py-4 font-normal lg:table-cell">Time left</th>
                          <th className="w-[16%] py-4 pr-6 text-right font-normal">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goals.map((g) => {
                          const done = g.status === 'Done';
                          return (
                            <tr key={g.id} className="border-b border-line last:border-0">
                              <td className="py-3 pl-4 align-middle">{box(g)}</td>
                              <td className="py-4 pr-4 align-middle">
                                <p className={cx('font-medium', done ? 'text-fg-3' : 'text-fg')}>{g.task}</p>
                                {lock(g)}
                              </td>
                              <td className="py-4 pr-3 align-middle">
                                {mine(g) ? <Tag tone="brand" dot={false}>You</Tag> : (
                                  <>
                                    <p className="truncate text-fg">{firstName(g.owner)}</p>
                                    {supporting(g) && <p className="text-xs text-fg-3">You're supporting</p>}
                                  </>
                                )}
                              </td>
                              <td className="py-4 pr-3 align-middle text-fg-2">{done && g.deadline ? 'Done' : due(g)}</td>
                              <td className="hidden py-4 pr-3 align-middle lg:table-cell"><Left t={g.timeLeft} /></td>
                              <td className="py-4 pr-6 text-right align-middle"><Status s={g.status} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Phone: cards */}
                  <ul className="space-y-3 md:hidden">
                    {goals.map((g) => {
                      const done = g.status === 'Done';
                      return (
                        <li key={g.id} className="rounded-3xl border border-line bg-bg-2 p-4">
                          <div className="flex items-start gap-1">
                            {box(g)}
                            <div className="min-w-0 flex-1 pt-2.5">
                              <p className={cx('font-medium', done ? 'text-fg-3' : 'text-fg')}>{g.task}</p>
                              {lock(g, supporting(g) ? " · you're supporting" : '')}
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-3">
                                <span>{done ? 'Done' : g.deadline ? `Due ${dayLabel(g.deadline)}` : 'No deadline'}</span>
                                {!done && <Left t={g.timeLeft} />}
                                <Status s={g.status} />
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <p className="text-sm text-fg-3">Tick a goal when it's done. Founders see your progress on their Goals page.</p>
            </div>
          );
        }}
      </Async>
    </div>
  );
}
