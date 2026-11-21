// Goals & tasks. Founders: all tasks, full edit. Employees: only tasks where
// they own or support, status only.

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { GOAL_STATUSES, type TimeLeft } from '../../../shared/rules';
import { formatDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Badge, Button, Card, Empty, ErrorText, Field, Modal, PageHeader, Select } from '../ui';
import { isFounder, type TeamMember, type TeamUser } from '../types';

interface Goal {
  id: string;
  goal: string;
  task: string;
  owner: string;
  support: string[];
  start: string;
  deadline: string;
  status: string;
  timeLeft: TimeLeft;
  updatedAt: string;
}

function TimeLeftBadge({ t }: { t: TimeLeft }) {
  const tone = t.kind === 'overdue' ? 'urgent' : t.kind === 'today' ? 'warn' : t.kind === 'done' ? 'ok' : t.kind === 'none' ? 'muted' : 'neutral';
  return <Badge tone={tone}>{t.label}</Badge>;
}

function GoalForm({ initial, open, onClose, onSaved }: { initial: Goal | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const team = useApi<{ users: TeamMember[] }>(open ? '/team' : null);
  const [f, setF] = useState({
    goal: initial?.goal ?? '',
    task: initial?.task ?? '',
    owner: initial?.owner ?? '',
    support: initial?.support ?? [],
    start: initial?.start ?? '',
    deadline: initial?.deadline ?? '',
    status: initial?.status ?? 'Not Started',
  });
  const { busy, error, run } = useAction();
  const names = [...new Set([...(team.data?.users ?? []).map((u) => u.name), f.owner, ...f.support].filter(Boolean))];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => (initial ? api('PATCH', `/goals/${initial.id}`, { ...f, expectedUpdatedAt: initial.updatedAt }) : api('POST', '/goals', f)));
    if (ok) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={initial ? 'Edit task' : 'Add task'} open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Goal" required value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
        <Field label="Task" required value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} />
        <Select label="Owner" required value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} options={['', ...names]} />
        <fieldset>
          <legend className="text-xs uppercase tracking-[0.18em] text-fg-3">Tester / support</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {names.filter((n) => n !== f.owner).map((n) => {
              const on = f.support.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setF({ ...f, support: on ? f.support.filter((x) => x !== n) : [...f.support, n] })}
                  className={`min-h-11 rounded-full border px-4 text-sm ${on ? 'border-brand bg-brand/15 text-fg' : 'border-line-2 text-fg-2'}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-5">
          <Field label="Start" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <Field label="Deadline" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
        </div>
        <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={[...GOAL_STATUSES]} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Save
        </Button>
      </form>
    </Modal>
  );
}

export default function Goals({ user }: { user: TeamUser }) {
  const state = useApi<{ goals: Goal[] }>('/goals');
  const founder = isFounder(user);
  const [editing, setEditing] = useState<Goal | null | 'new'>(null);
  const status = useAction();

  const setStatus = async (g: Goal, value: string) => {
    if ((await status.run(() => api('PATCH', `/goals/${g.id}`, { status: value, expectedUpdatedAt: g.updatedAt }))) !== undefined) void state.reload();
    else void state.reload();
  };

  return (
    <div>
      <PageHeader eyebrow={founder ? 'Team' : 'Your tasks'} title="Goals &" accent="tasks">
        {founder && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Task
          </Button>
        )}
      </PageHeader>
      <div className="mb-4">
        <ErrorText>{status.error}</ErrorText>
      </div>
      <Async state={state}>
        {({ goals }) => {
          if (!goals.length) return <Empty title="No tasks">{founder ? 'Add the first task.' : 'Tasks you own or support will show here.'}</Empty>;
          const groups = [...new Set(goals.map((g) => g.goal))];
          return (
            <div className="space-y-8">
              {groups.map((name) => (
                <section key={name}>
                  <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">{name}</h2>
                  <div className="space-y-2">
                    {goals
                      .filter((g) => g.goal === name)
                      .map((g) => (
                        <Card key={g.id} className="!p-4 sm:!p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-fg">{g.task}</p>
                              <p className="mt-1 text-xs text-fg-3">
                                {g.owner}
                                {g.support.length > 0 && ` · support ${g.support.join(', ')}`}
                                {g.start && ` · from ${formatDate(g.start)}`}
                                {g.deadline && ` · due ${formatDate(g.deadline)}`}
                              </p>
                              <div className="mt-2">
                                <TimeLeftBadge t={g.timeLeft} />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                aria-label={`Status of ${g.task}`}
                                value={g.status}
                                onChange={(e) => setStatus(g, e.target.value)}
                                className="min-h-11 cursor-pointer rounded-full border border-line-2 bg-bg px-4 text-sm text-fg"
                              >
                                {GOAL_STATUSES.map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                              {founder && (
                                <Button size="sm" variant="quiet" onClick={() => setEditing(g)}>
                                  Edit
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          );
        }}
      </Async>
      {editing && (
        <GoalForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} open onClose={() => setEditing(null)} onSaved={state.reload} />
      )}
    </div>
  );
}
