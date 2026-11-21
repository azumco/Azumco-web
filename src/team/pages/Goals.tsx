// Goals. Founders see everything and edit details; the employee sees only her
// own. ONLY a goal's owner can change its status — the server enforces it,
// and here everyone else gets a disabled checkbox with a hint.

import { useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import { GOAL_STATUSES, type TimeLeft } from '../../../shared/rules';
import { formatDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Avatar, Button, Checkbox, ChipGroup, ChoiceChip, Empty, ErrorText, Field, Modal, MultiChips, PageTitle, SearchableSelect, Tag, colourTone, cx, type TagTone } from '../ui';
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
  note: string;
  timeLeft: TimeLeft;
  canChangeStatus: boolean;
  updatedAt: string;
}

const first = (n: string) => n.split(' ')[0];
const STATUS_TONE: Record<string, TagTone> = { Done: 'good', 'In Progress': 'info', 'Not Started': 'neutral', 'On Hold': 'warn' };

function when(g: Goal) {
  if (g.start && g.deadline) {
    const s = formatDate(g.start), d = formatDate(g.deadline);
    return s.slice(3) === d.slice(3) ? `${s.slice(0, 2)} – ${d.slice(0, 6)}` : `${s.slice(0, 6)} – ${d.slice(0, 6)}`;
  }
  if (g.deadline) return `by ${formatDate(g.deadline).slice(0, 6)}`;
  return g.note && g.status === 'On Hold' ? 'on hold' : 'no deadline';
}

function GoalForm({ initial, people, goals, onClose, onSaved }: { initial: Goal | null; people: string[]; goals: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    goal: initial?.goal ?? '',
    task: initial?.task ?? '',
    owner: initial?.owner ?? people[0] ?? '',
    support: initial?.support ?? [],
    start: initial?.start ?? '',
    deadline: initial?.deadline ?? '',
    note: initial?.note ?? '',
  });
  const { busy, error, run } = useAction();
  const save = async () => {
    // Status is never sent from here: only the owner changes it, via the checkbox.
    if (await run(() => (initial ? api('PATCH', `/goals/${initial.id}`, { ...f, expectedUpdatedAt: initial.updatedAt }) : api('POST', '/goals', f)))) {
      onSaved();
      onClose();
    }
  };
  const remove = async () => {
    if (initial && (await run(() => api('DELETE', `/goals/${initial.id}`)))) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={initial ? 'Edit' : 'Add'} accent="goal" open onClose={onClose} wide>
      <div className="space-y-5">
        <SearchableSelect label="Goal" value={f.goal} options={goals} allowCustom onChange={(v) => setF({ ...f, goal: v })} placeholder="Choose or type a goal" />
        <Field label="Task" required value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} />
        <ChipGroup label="Assigned to — only they can mark it done" options={people.map((p) => ({ value: p, label: first(p) }))} value={f.owner} onChange={(v) => setF({ ...f, owner: v || f.owner, support: f.support.filter((s) => s !== v) })} required />
        <MultiChips label="Tester / support" options={people.filter((p) => p !== f.owner).map((p) => ({ value: p, label: first(p) }))} value={f.support} onChange={(v) => setF({ ...f, support: v })} />
        <div className="grid grid-cols-2 gap-5">
          <Field label="Start" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <Field label="Deadline" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
        </div>
        <Field label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        {initial && <p className="text-xs text-fg-3">Status: {initial.status}. Changing who it's assigned to keeps the status.</p>}
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          {initial && <Button variant="danger" busy={busy} onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button>}
          <Button busy={busy} className="flex-1" onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function StatusDialog({ g, onClose, onSaved }: { g: Goal; onClose: () => void; onSaved: () => void }) {
  const { busy, error, run } = useAction();
  return (
    <Modal title="Update" accent="status" subtitle={g.task} open onClose={onClose}>
      <div className="space-y-5">
        <ChipGroup
          options={GOAL_STATUSES}
          value={g.status as (typeof GOAL_STATUSES)[number]}
          required
          onChange={async (v) => {
            if (v && v !== g.status && (await run(() => api('PATCH', `/goals/${g.id}`, { status: v, expectedUpdatedAt: g.updatedAt })))) {
              onSaved();
              onClose();
            }
          }}
        />
        {busy && <p className="text-sm text-fg-3">Saving…</p>}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

export default function Goals({ user }: { user: TeamUser }) {
  const founder = isFounder(user);
  const state = useApi<{ goals: Goal[] }>('/goals');
  const team = useApi<{ users: TeamMember[] }>(founder ? '/team' : null);
  const [person, setPerson] = useState('all');
  const [editing, setEditing] = useState<Goal | null | 'new'>(null);
  const [statusOf, setStatusOf] = useState<Goal | null>(null);
  const act = useAction();

  const setDone = async (g: Goal, done: boolean) => {
    await act.run(() => api('PATCH', `/goals/${g.id}`, { status: done ? 'Done' : 'In Progress', expectedUpdatedAt: g.updatedAt }));
    void state.reload();
  };

  return (
    <div>
      <PageTitle title={founder ? 'Team' : 'Your'} accent="goals" subtitle={founder ? 'Founders see everything. The team only sees their own goals.' : 'Goals you own or support.'}>
        {founder && <Button onClick={() => setEditing('new')}>Add goal</Button>}
      </PageTitle>
      <Async state={state} label="Loading goals…">
        {({ goals }) => {
          const people = founder
            ? (team.data?.users ?? []).map((u) => u.name)
            : [...new Set(goals.flatMap((g) => [g.owner, ...g.support]))];
          const mine = (g: Goal, p: string) => g.owner === p;
          const shown = goals.filter((g) => person === 'all' || mine(g, person));
          const count = (s: string) => shown.filter((g) => g.status === s).length;
          const groups = [...new Set(shown.map((g) => g.goal))];
          const toneOf = (name: string) => colourTone(team.data?.users.find((u) => u.name === name)?.calendarColor);

          return (
            <div className="space-y-5">
              {founder && (
                <div className="flex flex-wrap gap-2">
                  <ChoiceChip on={person === 'all'} onClick={() => setPerson('all')}>All · {goals.length}</ChoiceChip>
                  {people.map((p) => (
                    <ChoiceChip key={p} on={person === p} onClick={() => setPerson(person === p ? 'all' : p)}>{first(p)} · {goals.filter((g) => mine(g, p)).length}</ChoiceChip>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Done', 'done', 'bg-good'],
                  ['In Progress', 'in progress', 'bg-info'],
                  ['Not Started', 'not started', 'bg-fg-3'],
                  ['On Hold', 'on hold', 'bg-warn'],
                ].map(([s, label, dot]) => (
                  <div key={s} className="flex items-center gap-3 rounded-3xl border border-line bg-bg-2 p-5">
                    <span className={cx('h-2 w-2 rounded-full', dot)} />
                    <span className="text-2xl font-medium tabular-nums">{count(s)}</span>
                    <span className="text-sm text-fg-2">{label}</span>
                  </div>
                ))}
              </div>
              <ErrorText>{act.error}</ErrorText>
              {shown.length === 0 ? (
                <Empty title="No goals here">{founder ? 'Add the first goal.' : 'Goals you own or support will show up here.'}</Empty>
              ) : (
                <div className="overflow-hidden rounded-3xl border border-line bg-bg-2">
                  {groups.map((name) => (
                    <section key={name}>
                      <h2 className="border-b border-line bg-bg-3/40 px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] text-fg-3">{name}</h2>
                      <ul>
                        {shown.filter((g) => g.goal === name).map((g) => {
                          const done = g.status === 'Done';
                          const hint = `Only ${first(g.owner)} can mark this done`;
                          return (
                            <li key={g.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-3 last:border-0 sm:grid-cols-[auto_1fr_140px_120px_120px_auto] sm:px-5">
                              <Checkbox checked={done} tone="good" disabled={!g.canChangeStatus} title={g.canChangeStatus ? undefined : hint} label={g.canChangeStatus ? `Mark “${g.task}” done` : hint} onChange={(v) => setDone(g, v)} />
                              <button type="button" disabled={!founder} onClick={() => founder && setEditing(g)} className="min-w-0 text-left disabled:cursor-default">
                                <span className={cx('block truncate', done ? 'text-fg-3' : 'text-fg')}>{g.task}</span>
                                {(g.support.length > 0 || g.note) && (
                                  <span className="block truncate text-xs text-fg-3">{[g.support.length ? `Tested by ${g.support.map(first).join(' / ')}` : '', g.note].filter(Boolean).join(' · ')}</span>
                                )}
                                {!g.canChangeStatus && <span className="block text-[11px] text-fg-3 sm:hidden">{hint}</span>}
                              </button>
                              <span className="hidden items-center gap-2 text-sm text-fg-2 sm:inline-flex"><Avatar name={g.owner} tone={toneOf(g.owner)} />{first(g.owner)}</span>
                              <span className="hidden text-sm text-fg-2 sm:block">{when(g)}</span>
                              <span className="hidden sm:block">
                                {g.timeLeft.kind === 'left' || g.timeLeft.kind === 'today' || g.timeLeft.kind === 'overdue' ? (
                                  <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs', g.timeLeft.kind === 'overdue' ? 'bg-bad/12 text-bad' : g.timeLeft.kind === 'today' ? 'bg-warn/12 text-warn' : 'bg-bg-3 text-fg-2')}>
                                    <Clock className="h-3 w-3" /> {g.timeLeft.label}
                                  </span>
                                ) : (
                                  <span className="text-fg-3">—</span>
                                )}
                              </span>
                              <button type="button" onClick={() => g.canChangeStatus && setStatusOf(g)} disabled={!g.canChangeStatus} title={g.canChangeStatus ? 'Change status' : hint} className="justify-self-end disabled:cursor-default">
                                <Tag tone={STATUS_TONE[g.status] ?? 'neutral'}>{g.status === 'In Progress' ? 'In progress' : g.status === 'Not Started' ? 'Not started' : g.status === 'On Hold' ? 'On hold' : g.status}</Tag>
                              </button>
                              <span className="col-start-2 flex flex-wrap items-center gap-2 text-xs text-fg-3 sm:hidden">{first(g.owner)} · {when(g)} · {g.timeLeft.label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              {editing && <GoalForm initial={editing === 'new' ? null : editing} people={people} goals={[...new Set(goals.map((g) => g.goal))]} onClose={() => setEditing(null)} onSaved={() => void state.reload()} />}
              {statusOf && <StatusDialog g={statusOf} onClose={() => setStatusOf(null)} onSaved={() => void state.reload()} />}
            </div>
          );
        }}
      </Async>
    </div>
  );
}
