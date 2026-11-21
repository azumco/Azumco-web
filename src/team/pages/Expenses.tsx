// Founders only (the API refuses employees on every finance route).

import { useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { COMPANY_FUND, type ExpenseSummary } from '../../../shared/rules';
import { formatDate, formatInr, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Badge, Button, Card, Empty, ErrorText, Field, Modal, PageHeader, Select, Stat, Toggle } from '../ui';

interface Expense { id: string; date: string; item: string; amount: number; paidBy: string; project: string; repaid: boolean; updatedAt: string }
interface Project { id: string; name: string; dealTotal: number; received: number; status: string; updatedAt: string }
interface Overview { expenses: Expense[]; projects: Project[]; summary: ExpenseSummary; members: string[] }

function ExpenseForm({ initial, members, projects, open, onClose, onSaved }: { initial: Expense | null; members: string[]; projects: string[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const blank = { date: istDate(), item: '', amount: '', paidBy: COMPANY_FUND, project: 'General', repaid: false };
  const [f, setF] = useState(initial ? { ...initial, amount: String(initial.amount) } : blank);
  const { busy, error, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { date: f.date, item: f.item, amount: Number(f.amount), paidBy: f.paidBy, project: f.project, repaid: f.paidBy === COMPANY_FUND ? false : f.repaid };
    const ok = await run(() => (initial ? api('PUT', `/finance/expenses/${initial.id}`, { ...body, expectedUpdatedAt: initial.updatedAt }) : api('POST', '/finance/expenses', body)));
    if (ok) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={initial ? 'Edit expense' : 'Add expense'} open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <Field label="Date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Field label="Amount (₹)" type="number" min={1} step="0.01" inputMode="decimal" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </div>
        <Field label="Item" required value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />
        <Select label="Paid by" value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })} options={[...new Set([COMPANY_FUND, ...members, f.paidBy])]} />
        <Field label="Project" list="expense-projects" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} />
        <datalist id="expense-projects">
          {['General', ...projects].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {f.paidBy !== COMPANY_FUND && <Toggle label="Repaid to member" checked={f.repaid} onChange={(v) => setF({ ...f, repaid: v })} />}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Save
        </Button>
      </form>
    </Modal>
  );
}

function ProjectForm({ initial, open, onClose, onSaved }: { initial: Project | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', dealTotal: String(initial?.dealTotal ?? ''), received: String(initial?.received ?? ''), status: initial?.status ?? 'Active' });
  const { busy, error, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name: f.name, dealTotal: Number(f.dealTotal) || 0, received: Number(f.received) || 0, status: f.status };
    const ok = await run(() => (initial ? api('PUT', `/finance/projects/${initial.id}`, { ...body, expectedUpdatedAt: initial.updatedAt }) : api('POST', '/finance/projects', body)));
    if (ok) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={initial ? 'Edit project' : 'Add project'} open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Project" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-5">
          <Field label="Deal total (₹)" type="number" min={0} inputMode="numeric" value={f.dealTotal} onChange={(e) => setF({ ...f, dealTotal: e.target.value })} />
          <Field label="Received (₹)" type="number" min={0} inputMode="numeric" value={f.received} onChange={(e) => setF({ ...f, received: e.target.value })} />
        </div>
        <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={['Active', 'Completed', 'On Hold', 'Cancelled']} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Save
        </Button>
      </form>
    </Modal>
  );
}

export default function Expenses() {
  const state = useApi<Overview>('/finance');
  const [editing, setEditing] = useState<Expense | null | 'new'>(null);
  const [project, setProject] = useState<Project | null | 'new'>(null);

  return (
    <div>
      <PageHeader eyebrow="Founders only" title="Money" accent="in & out">
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Expense
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setProject('new')}>
          <Plus className="h-4 w-4" /> Project
        </Button>
      </PageHeader>
      <Async state={state}>
        {({ expenses, projects, summary, members }) => (
          <div className="space-y-10">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label="Money received" value={formatInr(summary.received)} hint={summary.contributions ? `+ ${formatInr(summary.contributions)} founder contributions` : undefined} />
              <Stat label="Spent by company" value={formatInr(summary.spentByCompany)} hint="Company-paid + repaid to members" />
              <Stat label="Cash in company" value={formatInr(summary.cashInCompany)} accent />
              <Stat label="Still to receive" value={formatInr(summary.stillToReceive)} />
              <Stat label="Owed to members" value={formatInr(summary.owedToMembers)} />
              <Stat label="Cash after paying members" value={formatInr(summary.cashAfterPayingMembers)} />
            </div>

            <section>
              <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">Projects & income</h2>
              {summary.projects.length === 0 ? (
                <Empty title="No projects yet" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {summary.projects.map((p) => {
                    const row = projects.find((x) => x.name === p.name)!;
                    return (
                      <Card key={p.name}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{p.name}</p>
                            <Badge tone="muted">{row?.status}</Badge>
                          </div>
                          <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setProject(row)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-3 hover:text-fg">
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          {[
                            ['Deal total', p.dealTotal],
                            ['Received', p.received],
                            ['Pending', p.pending],
                            ['Expenses charged', p.expenses],
                          ].map(([k, v]) => (
                            <div key={k as string}>
                              <dt className="text-xs text-fg-3">{k}</dt>
                              <dd className="tabular-nums">{formatInr(v as number)}</dd>
                            </div>
                          ))}
                          <div className="col-span-2 border-t border-line pt-3">
                            <dt className="text-xs text-fg-3">Profit so far</dt>
                            <dd className={`text-lg tabular-nums ${p.profit < 0 ? 'text-brand-2' : 'text-fg'}`}>{formatInr(p.profit)}</dd>
                          </div>
                        </dl>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">To pay members</h2>
              {summary.members.length === 0 ? (
                <p className="text-sm text-fg-3">No one has paid from their own pocket.</p>
              ) : (
                <div className="space-y-2">
                  {summary.members.map((m) => (
                    <div key={m.name} className="grid grid-cols-2 gap-2 rounded-3xl border border-line bg-bg-2 px-5 py-4 text-sm sm:grid-cols-4">
                      <span className="col-span-2 font-medium sm:col-span-1">{m.name}</span>
                      <span className="text-fg-2">Spent {formatInr(m.spent)}</span>
                      <span className="text-fg-2">Repaid {formatInr(m.repaid)}</span>
                      <span className={m.toPay ? 'text-brand-2' : 'text-fg-3'}>To pay {formatInr(m.toPay)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">Expenses</h2>
              {expenses.length === 0 ? (
                <Empty title="No expenses yet" />
              ) : (
                <div className="space-y-2">
                  {expenses.map((e) => (
                    <button key={e.id} type="button" onClick={() => setEditing(e)} className="flex w-full items-center justify-between gap-3 rounded-3xl border border-line bg-bg-2 px-5 py-4 text-left hover:border-line-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-fg">{e.item}</p>
                        <p className="text-xs text-fg-3">
                          {formatDate(e.date)} · {e.paidBy} · {e.project}
                          {e.paidBy !== COMPANY_FUND && (e.repaid ? ' · repaid' : ' · not repaid')}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums">{formatInr(e.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {editing && (
              <ExpenseForm
                key={editing === 'new' ? 'new' : editing.id}
                initial={editing === 'new' ? null : editing}
                members={members}
                projects={projects.map((p) => p.name)}
                open
                onClose={() => setEditing(null)}
                onSaved={state.reload}
              />
            )}
            {project && <ProjectForm key={project === 'new' ? 'new' : project.id} initial={project === 'new' ? null : project} open onClose={() => setProject(null)} onSaved={state.reload} />}
          </div>
        )}
      </Async>
    </div>
  );
}
