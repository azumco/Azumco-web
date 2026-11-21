// Founders only: every rupee in and out, and how close we are to registering.
// Real finance + milestone data; the API refuses employees on every route.

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Pencil } from 'lucide-react';
import { COMPANY_FUND, type ExpenseSummary, type MilestoneNumbers } from '../../../shared/rules';
import { formatDate, formatInr, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Avatar, Button, Card, CardHeader, Checkbox, ChipGroup, Empty, ErrorText, Field, Modal, PageTitle, ProgressBar, SearchableSelect, Stat, Tag, Toggle } from '../ui';
import type { TeamUser } from '../types';

interface Expense { id: string; date: string; item: string; amount: number; paidBy: string; project: string; repaid: boolean; updatedAt: string }
interface Project { id: string; name: string; dealTotal: number; received: number; status: string; updatedAt: string }
interface Finance { expenses: Expense[]; projects: Project[]; summary: ExpenseSummary; members: string[] }
interface Item { id: string; label: string; amount: number; amountWithoutGst: number | null; effectiveAmount: number; note: string; paid: boolean; paidBy: string; paidAmount: number; updatedAt: string }
interface Milestone { id: string; name: string; gstIncluded: boolean; targetOverride: number | null; updatedAt: string; items: Item[]; numbers: MilestoneNumbers }
interface MilestoneData { milestones: Milestone[]; contributions: { id: string; date: string; founder: string; amount: number; note: string }[]; founders: string[] }

const first = (name: string) => name.split(' ')[0];
const shortDate = (d: string) => formatDate(d).slice(0, 6);
const itemShort = (label: string) => label.replace(/\s*\(.*\)$/, '').replace(/^Government fee: (.*)$/, '$1 · govt').replace(/^./, (c) => c.toUpperCase());

function ExpenseForm({ initial, members, projects, onClose, onSaved }: { initial: Expense | null; members: string[]; projects: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ date: initial?.date ?? istDate(), item: initial?.item ?? '', amount: initial ? String(initial.amount) : '', paidBy: initial?.paidBy ?? COMPANY_FUND, project: initial?.project ?? 'General', repaid: initial?.repaid ?? false });
  const { busy, error, run } = useAction();
  const save = async () => {
    const body = { date: f.date, item: f.item, amount: Number(f.amount), paidBy: f.paidBy, project: f.project, repaid: f.paidBy === COMPANY_FUND ? false : f.repaid };
    if (await run(() => (initial ? api('PUT', `/finance/expenses/${initial.id}`, { ...body, expectedUpdatedAt: initial.updatedAt }) : api('POST', '/finance/expenses', body)))) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={initial ? 'Edit' : 'Add'} accent="expense" open onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <Field label="Date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Field label="Amount (₹)" type="number" min={1} inputMode="decimal" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </div>
        <Field label="Item" required value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />
        <SearchableSelect label="Paid by" value={f.paidBy} options={[COMPANY_FUND, ...members]} onChange={(v) => setF({ ...f, paidBy: v })} />
        <SearchableSelect label="Project" value={f.project} options={['General', ...projects]} allowCustom onChange={(v) => setF({ ...f, project: v })} />
        {f.paidBy !== COMPANY_FUND && <Toggle label="Repaid to member" checked={f.repaid} onChange={(v) => setF({ ...f, repaid: v })} />}
        <ErrorText>{error}</ErrorText>
        <Button busy={busy} className="w-full" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

function ProjectForm({ initial, onClose, onSaved }: { initial: Project | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', dealTotal: String(initial?.dealTotal ?? ''), received: String(initial?.received ?? ''), status: initial?.status ?? 'Active' });
  const { busy, error, run } = useAction();
  const save = async () => {
    const body = { name: f.name, dealTotal: Number(f.dealTotal) || 0, received: Number(f.received) || 0, status: f.status };
    if (await run(() => (initial ? api('PUT', `/finance/projects/${initial.id}`, { ...body, expectedUpdatedAt: initial.updatedAt }) : api('POST', '/finance/projects', body)))) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={initial ? 'Edit' : 'Add'} accent="project" open onClose={onClose}>
      <div className="space-y-5">
        <Field label="Client / project" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-5">
          <Field label="Deal (₹)" type="number" min={0} inputMode="numeric" value={f.dealTotal} onChange={(e) => setF({ ...f, dealTotal: e.target.value })} />
          <Field label="Received (₹)" type="number" min={0} inputMode="numeric" value={f.received} onChange={(e) => setF({ ...f, received: e.target.value })} />
        </div>
        <ChipGroup label="Status" options={['Active', 'Completed', 'On Hold', 'Cancelled']} value={f.status as 'Active'} onChange={(v) => setF({ ...f, status: v || f.status })} required />
        <ErrorText>{error}</ErrorText>
        <Button busy={busy} className="w-full" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

function PayItem({ item, founders, onClose, onSaved }: { item: Item; founders: string[]; onClose: () => void; onSaved: () => void }) {
  const [paidBy, setPaidBy] = useState(COMPANY_FUND);
  const { busy, error, run } = useAction();
  return (
    <Modal title="Mark" accent="paid" subtitle={`${itemShort(item.label)} — ${formatInr(item.effectiveAmount)}. This also records the expense under "Company registration".`} open onClose={onClose}>
      <div className="space-y-5">
        <ChipGroup label="Paid by" options={[COMPANY_FUND, ...founders].map((n) => ({ value: n, label: n === COMPANY_FUND ? n : first(n) }))} value={paidBy} onChange={(v) => setPaidBy(v || paidBy)} required />
        <ErrorText>{error}</ErrorText>
        <Button busy={busy} className="w-full" onClick={async () => { if (await run(() => api('POST', `/milestone-items/${item.id}/pay`, { paidBy }))) { onSaved(); onClose(); } }}>Mark paid</Button>
      </div>
    </Modal>
  );
}

function ContributionForm({ founders, onClose, onSaved }: { founders: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ date: istDate(), founder: founders[0] ?? '', amount: '', note: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title="Add" accent="contribution" subtitle="Founder money put into the company. It counts as company funds." open onClose={onClose}>
      <div className="space-y-5">
        <ChipGroup label="Founder" options={founders.map((n) => ({ value: n, label: first(n) }))} value={f.founder} onChange={(v) => setF({ ...f, founder: v || f.founder })} required />
        <div className="grid grid-cols-2 gap-5">
          <Field label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Field label="Amount (₹)" type="number" min={1} inputMode="numeric" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </div>
        <Field label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <ErrorText>{error}</ErrorText>
        <Button busy={busy} className="w-full" onClick={async () => { if (await run(() => api('POST', '/contributions', { ...f, amount: Number(f.amount) }))) { onSaved(); onClose(); } }}>Add contribution</Button>
      </div>
    </Modal>
  );
}

/** Super admin: line-item amounts and the target. */
function EditMilestone({ m, onClose, onSaved }: { m: Milestone; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState(m.items.map((i) => ({ ...i, amountText: String(i.amount), withoutText: i.amountWithoutGst === null ? '' : String(i.amountWithoutGst) })));
  const [target, setTarget] = useState(m.targetOverride === null ? '' : String(m.targetOverride));
  const { busy, error, run } = useAction();
  const save = async () => {
    const ok = await run(async () => {
      for (const r of rows) {
        if (r.paid) continue;
        const amount = Number(r.amountText) || 0;
        const without = r.withoutText === '' ? null : Number(r.withoutText);
        if (amount !== r.amount || without !== r.amountWithoutGst) await api('PATCH', `/milestone-items/${r.id}`, { amount, amountWithoutGst: without, expectedUpdatedAt: r.updatedAt });
      }
      const t = target === '' ? null : Number(target);
      if (t !== m.targetOverride) await api('PATCH', `/milestones/${m.id}`, { targetOverride: t, expectedUpdatedAt: m.updatedAt });
      return true;
    });
    if (ok) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title="Edit" accent="milestone" open onClose={onClose} wide>
      <div className="space-y-5">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[1fr_110px_110px] items-end gap-3">
            <p className="pb-2.5 text-sm text-fg-2">{itemShort(r.label)}{r.paid && ' · paid'}</p>
            <Field label="Amount ₹" type="number" min={0} disabled={r.paid} value={r.amountText} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amountText: e.target.value } : x)))} />
            <Field label="No GST ₹" type="number" min={0} disabled={r.paid} placeholder="Same" value={r.withoutText} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, withoutText: e.target.value } : x)))} />
          </div>
        ))}
        <Field label="Target override (₹)" type="number" min={0} placeholder="Auto: sum of items" value={target} onChange={(e) => setTarget(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <Button busy={busy} className="w-full" onClick={save}>Save</Button>
      </div>
    </Modal>
  );
}

export default function Money({ user }: { user: TeamUser }) {
  const fin = useApi<Finance>('/finance');
  const ms = useApi<MilestoneData>('/milestones');
  const [expense, setExpense] = useState<Expense | null | 'new'>(null);
  const [project, setProject] = useState<Project | null | 'new'>(null);
  const [paying, setPaying] = useState<Item | null>(null);
  const [contributing, setContributing] = useState(false);
  const [editingM, setEditingM] = useState(false);
  const act = useAction();
  const isSuper = user.role === 'super_admin';
  const reload = () => {
    void fin.reload();
    void ms.reload();
  };

  return (
    <div>
      <PageTitle title="Company" accent="money" subtitle="Every rupee in and out, and how close we are to registering.">
        <Tag tone="warn">Founders only</Tag>
        <Button onClick={() => setExpense('new')}>Add expense</Button>
      </PageTitle>
      <Async state={fin} label="Loading money…">
        {({ expenses, projects, summary, members }) => {
          const projectNames = projects.map((p) => p.name);
          const owed = summary.members.filter((m) => m.toPay > 0);
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Received" value={formatInr(summary.received)} hint={projects.length ? `from ${projectNames.join(', ')}` : 'no projects yet'} />
                <Stat label="Spent by company" value={formatInr(summary.spentByCompany)} hint="company-paid + repaid" />
                <Stat label="Cash now" value={formatInr(summary.cashInCompany)} tone="good" hint={summary.contributions ? `incl. ${formatInr(summary.contributions)} from founders` : 'received − spent'} />
                <Stat label="Owed to members" value={formatInr(summary.owedToMembers)} tone={summary.owedToMembers ? 'bad' : undefined} hint={owed.map((m) => first(m.name)).join(', ') || 'nothing owed'} />
              </div>

              <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
                <div className="flex flex-col gap-5">
                  <Card>
                    <CardHeader title="Expenses" />
                    {expenses.length === 0 ? (
                      <Empty title="No expenses yet" />
                    ) : (
                      <>
                      <ul className="sm:hidden">
                        {expenses.map((e) => (
                          <li key={e.id}>
                            <button type="button" onClick={() => setExpense(e)} className="flex w-full items-start justify-between gap-3 border-t border-line py-3 text-left first:border-0">
                              <span className="min-w-0">
                                <span className="block truncate">{e.item}</span>
                                <span className="block text-xs text-fg-3">{shortDate(e.date)} · {e.paidBy === COMPANY_FUND ? 'company' : `paid by ${first(e.paidBy)}`}</span>
                              </span>
                              <span className="flex shrink-0 flex-col items-end gap-1">
                                <span className="tabular-nums">{formatInr(e.amount)}</span>
                                {e.paidBy === COMPANY_FUND ? <Tag tone="good">Paid</Tag> : e.repaid ? <Tag>Repaid</Tag> : <Tag tone="bad">Owe {first(e.paidBy)}</Tag>}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="-mx-1 hidden overflow-x-auto sm:block">
                        <table className="w-full min-w-[520px] text-left text-sm">
                          <thead>
                            <tr className="text-[11px] uppercase tracking-[0.14em] text-fg-3">
                              <th className="px-1 py-2 font-normal">Date</th><th className="px-1 py-2 font-normal">Item</th><th className="px-1 py-2 font-normal">Amount</th><th className="px-1 py-2 font-normal">Paid by</th><th className="px-1 py-2 font-normal">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expenses.map((e) => (
                              <tr key={e.id} onClick={() => setExpense(e)} className="cursor-pointer border-t border-line hover:bg-bg-3/40">
                                <td className="px-1 py-3 text-fg-2">{shortDate(e.date)}</td>
                                <td className="px-1 py-3">{e.item}</td>
                                <td className="px-1 py-3 tabular-nums">{formatInr(e.amount)}</td>
                                <td className="px-1 py-3 text-fg-2">{e.paidBy === COMPANY_FUND ? 'Company' : first(e.paidBy)}</td>
                                <td className="px-1 py-3">{e.paidBy === COMPANY_FUND ? <Tag tone="good">Company paid</Tag> : e.repaid ? <Tag>Repaid</Tag> : <Tag tone="bad">Owe {first(e.paidBy)}</Tag>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </>
                    )}
                  </Card>

                  <Card>
                    <CardHeader title="Projects" action={<Button variant="ghost" onClick={() => setProject('new')}>Add project <ArrowRight className="h-3.5 w-3.5" /></Button>} />
                    {summary.projects.length === 0 ? (
                      <p className="text-sm text-fg-3">No client projects yet.</p>
                    ) : (
                      <div className="space-y-6">
                        {summary.projects.map((p) => {
                          const row = projects.find((x) => x.name === p.name)!;
                          const pct = p.dealTotal ? (p.received / p.dealTotal) * 100 : 0;
                          return (
                            <div key={p.name}>
                              <div className="flex items-center gap-3">
                                <p className="text-xl font-medium">{p.name}</p>
                                <Tag tone={p.pending === 0 ? 'good' : p.received > 0 ? 'warn' : 'neutral'}>{p.pending === 0 ? 'Paid' : p.received > 0 ? 'Partly paid' : 'Not paid yet'}</Tag>
                                <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setProject(row)} className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-3 hover:text-fg"><Pencil className="h-4 w-4" /></button>
                              </div>
                              <div className="mt-3"><ProgressBar percent={pct} tone="good" label={`${p.name} paid`} /></div>
                              <dl className="mt-4 space-y-2.5 text-sm">
                                <div className="flex justify-between"><dt className="text-fg-2">Deal</dt><dd className="tabular-nums">{formatInr(p.dealTotal)}</dd></div>
                                <div className="flex justify-between"><dt className="text-fg-2">Received</dt><dd className="tabular-nums">{formatInr(p.received)}</dd></div>
                                <div className="flex justify-between"><dt className="text-fg-2">Still to receive</dt><dd className="tabular-nums text-warn">{formatInr(p.pending)}</dd></div>
                                <div className="flex justify-between"><dt className="text-fg-2">Profit so far</dt><dd className={p.profit < 0 ? 'tabular-nums text-bad' : 'tabular-nums text-good'}>{formatInr(p.profit)}</dd></div>
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  <Card className="flex-1">
                    <CardHeader title="To pay members" />
                    {owed.length === 0 ? (
                      <p className="text-sm text-fg-3">Nobody is owed anything.</p>
                    ) : (
                      <ul className="space-y-4">
                        {owed.map((m) => {
                          const theirs = expenses.filter((e) => e.paidBy === m.name && !e.repaid);
                          return (
                            <li key={m.name}>
                              <div className="flex items-center gap-3">
                                <Avatar name={m.name} tone="good" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-fg">{m.name}</p>
                                  <p className="truncate text-xs text-fg-3">{theirs.map((e) => `${e.item} · ${shortDate(e.date)}`).join(', ')}</p>
                                </div>
                                <span className="tabular-nums text-bad">{formatInr(m.toPay)}</span>
                              </div>
                              <Button
                                variant="ghost"
                                busy={act.busy}
                                onClick={async () => {
                                  await act.run(async () => {
                                    for (const e of theirs) await api('PUT', `/finance/expenses/${e.id}`, { date: e.date, item: e.item, amount: e.amount, paidBy: e.paidBy, project: e.project, repaid: true, expectedUpdatedAt: e.updatedAt });
                                  });
                                  reload();
                                }}
                              >
                                Mark repaid <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <ErrorText>{act.error}</ErrorText>
                  </Card>
                </div>

                <Async state={ms}>
                  {({ milestones, contributions, founders }) => {
                    const m = milestones[0];
                    if (!m) return <Card><p className="text-sm text-fg-3">No milestone set up.</p></Card>;
                    const n = m.numbers;
                    return (
                      <Card className="order-first h-full lg:order-none">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-fg-3">Milestone</p>
                          {isSuper && <button type="button" onClick={() => setEditingM(true)} className="inline-flex min-h-11 items-center gap-1 text-xs text-fg-3 hover:text-fg"><Pencil className="h-3.5 w-3.5" /> Edit</button>}
                        </div>
                        <h2 className="mt-2 text-xl font-medium">Register <span className="font-serif italic text-brand">Azumco</span></h2>
                        <p className="mt-3 text-3xl font-medium tabular-nums">{formatInr(n.target - n.stillNeeded)} <span className="text-sm text-fg-3">of {formatInr(n.target)}</span></p>
                        <div className="mt-3"><ProgressBar percent={n.percent} label="Registration funded" /></div>
                        {n.fullyFunded && <p className="mt-3 flex items-center gap-2 text-sm text-good"><CheckCircle2 className="h-4 w-4" /> Fully funded</p>}

                        <ul className="mt-5 rounded-2xl bg-bg-3 p-2">
                          {m.items.map((i) => (
                            <li key={i.id} className="flex items-center gap-1 pr-2 text-sm">
                              <Checkbox
                                checked={i.paid}
                                label={`${itemShort(i.label)} paid`}
                                disabled={!i.paid && i.effectiveAmount <= 0}
                                title={!i.paid && i.effectiveAmount <= 0 ? 'Set the amount first (ask the CS)' : undefined}
                                onChange={async (v) => {
                                  if (v) setPaying(i);
                                  else if ((await act.run(() => api('POST', `/milestone-items/${i.id}/unpay`))) !== undefined) reload();
                                }}
                              />
                              <span className={i.paid ? 'flex-1 text-fg-3 line-through' : 'flex-1 text-fg-2'}>{itemShort(i.label)}{i.paid && ` · ${first(i.paidBy)}`}</span>
                              <span className="tabular-nums">{i.effectiveAmount > 0 || i.paid ? formatInr(i.paid ? i.paidAmount : i.effectiveAmount) : <span className="text-fg-3">ask CS</span>}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-4 space-y-3 text-sm">
                          <Toggle
                            label="GST registration included"
                            disabled={!isSuper}
                            hint={isSuper ? undefined : 'Only the super admin can change this'}
                            checked={m.gstIncluded}
                            onChange={async (v) => (await act.run(() => api('PATCH', `/milestones/${m.id}`, { gstIncluded: v, expectedUpdatedAt: m.updatedAt }))) !== undefined && reload()}
                          />
                          <div className="flex justify-between"><span className="text-fg-2">Still needed</span><span className="tabular-nums text-brand">{formatInr(n.stillNeeded)}</span></div>
                          <div className="flex justify-between"><span className="text-fg-2">After pending income</span><span className="tabular-nums">{formatInr(n.expectedAfterPending)}</span></div>
                          <div className="flex justify-between"><span className="text-fg-2">Each founder (÷3)</span><span className="tabular-nums">{formatInr(n.sharePerFounder)}</span></div>
                        </div>

                        {contributions.length === 0 ? (
                          <p className="mt-4 text-xs text-fg-3">No founder contributions yet.</p>
                        ) : (
                          <ul className="mt-4 space-y-1.5 text-sm">
                            {contributions.map((c) => (
                              <li key={c.id} className="flex justify-between gap-3"><span className="text-fg-2">{first(c.founder)} · {shortDate(c.date)}</span><span className="tabular-nums">{formatInr(c.amount)}</span></li>
                            ))}
                          </ul>
                        )}
                        <Button variant="secondary" className="mt-5 w-full" onClick={() => setContributing(true)}>Add contribution</Button>

                        {paying && <PayItem item={paying} founders={founders} onClose={() => setPaying(null)} onSaved={reload} />}
                        {contributing && <ContributionForm founders={founders} onClose={() => setContributing(false)} onSaved={reload} />}
                        {editingM && <EditMilestone m={m} onClose={() => setEditingM(false)} onSaved={reload} />}
                      </Card>
                    );
                  }}
                </Async>
              </div>

              {expense && <ExpenseForm initial={expense === 'new' ? null : expense} members={members} projects={projectNames} onClose={() => setExpense(null)} onSaved={reload} />}
              {project && <ProjectForm initial={project === 'new' ? null : project} onClose={() => setProject(null)} onSaved={reload} />}
            </div>
          );
        }}
      </Async>
    </div>
  );
}
