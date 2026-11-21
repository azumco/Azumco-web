// Founders: money still needed to register Azumco, with line items, payments
// and founder contributions. Super admin edits items, amounts, target and GST.

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { COMPANY_FUND, type MilestoneNumbers } from '../../../shared/rules';
import { formatDate, formatInr, istDate } from '../../../shared/time';
import { api } from '../api';
import { useAction, useApi } from '../hooks';
import { Async, Badge, Button, Card, Empty, ErrorText, Field, Modal, PageHeader, Select, Stat, Toggle } from '../ui';
import type { TeamUser } from '../types';

interface Item {
  id: string;
  label: string;
  amount: number;
  amountWithoutGst: number | null;
  effectiveAmount: number;
  note: string;
  paid: boolean;
  paidBy: string;
  paidAmount: number;
  paidAt: string | null;
  updatedAt: string;
}
interface Milestone {
  id: string;
  name: string;
  provider: string;
  notes: string;
  gstIncluded: boolean;
  targetOverride: number | null;
  updatedAt: string;
  items: Item[];
  numbers: MilestoneNumbers;
}
interface Overview {
  milestones: Milestone[];
  contributions: { id: string; date: string; founder: string; amount: number; note: string }[];
  founders: string[];
}

function ItemForm({ item, milestoneId, open, onClose, onSaved }: { item: Item | null; milestoneId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    label: item?.label ?? '',
    amount: String(item?.amount ?? ''),
    amountWithoutGst: item?.amountWithoutGst === null || item?.amountWithoutGst === undefined ? '' : String(item.amountWithoutGst),
    note: item?.note ?? '',
  });
  const { busy, error, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { label: f.label, amount: Number(f.amount) || 0, amountWithoutGst: f.amountWithoutGst === '' ? null : Number(f.amountWithoutGst), note: f.note };
    const ok = await run(() =>
      item ? api('PATCH', `/milestone-items/${item.id}`, { ...body, expectedUpdatedAt: item.updatedAt }) : api('POST', `/milestones/${milestoneId}/items`, body),
    );
    if (ok) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal title={item ? 'Edit line item' : 'Add line item'} open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Item" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <div className="grid grid-cols-2 gap-5">
          <Field label="Amount (₹)" type="number" min={0} inputMode="numeric" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Field label="Without GST (₹)" type="number" min={0} inputMode="numeric" placeholder="Same" value={f.amountWithoutGst} onChange={(e) => setF({ ...f, amountWithoutGst: e.target.value })} />
        </div>
        <Field label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          Save
        </Button>
      </form>
    </Modal>
  );
}

function PayDialog({ item, founders, onClose, onSaved }: { item: Item; founders: string[]; onClose: () => void; onSaved: () => void }) {
  const [paidBy, setPaidBy] = useState(COMPANY_FUND);
  const { busy, error, run } = useAction();
  return (
    <Modal title="Mark as paid" open onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-fg-2">
          {item.label} — <span className="text-fg">{formatInr(item.effectiveAmount)}</span>. This also adds the expense under "Company registration".
        </p>
        <Select label="Paid by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} options={[COMPANY_FUND, ...founders]} />
        <ErrorText>{error}</ErrorText>
        <Button
          busy={busy}
          className="w-full"
          onClick={async () => {
            if (await run(() => api('POST', `/milestone-items/${item.id}/pay`, { paidBy }))) {
              onSaved();
              onClose();
            }
          }}
        >
          Mark paid
        </Button>
      </div>
    </Modal>
  );
}

function ContributionForm({ founders, onSaved }: { founders: string[]; onSaved: () => void }) {
  const [f, setF] = useState({ date: istDate(), founder: founders[0] ?? '', amount: '', note: '' });
  const { busy, error, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api('POST', '/contributions', { ...f, amount: Number(f.amount) }))) {
      setF({ ...f, amount: '', note: '' });
      onSaved();
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[150px_1fr_140px_1fr_auto] lg:items-end">
      <Field label="Date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <Select label="Founder" value={f.founder} onChange={(e) => setF({ ...f, founder: e.target.value })} options={founders} />
      <Field label="Amount (₹)" type="number" min={1} inputMode="numeric" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      <Field label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <Button type="submit" size="sm" busy={busy}>
        <Plus className="h-4 w-4" /> Add
      </Button>
      <div className="sm:col-span-2 lg:col-span-5">
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}

export default function MilestonePage({ user }: { user: TeamUser }) {
  const state = useApi<Overview>('/milestones');
  const isSuper = user.role === 'super_admin';
  const [editing, setEditing] = useState<{ item: Item | null; milestoneId: string } | null>(null);
  const [paying, setPaying] = useState<Item | null>(null);
  const action = useAction();
  const reload = () => void state.reload();

  return (
    <div>
      <PageHeader eyebrow="Founders only" title="Company" accent="registration" />
      <Async state={state} label="Loading milestone…">
        {({ milestones, contributions, founders }) => {
          const m = milestones[0];
          if (!m) return <Empty title="No milestone yet" />;
          const n = m.numbers;
          return (
            <div className="space-y-8">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-medium tracking-[-0.02em]">{m.name}</h2>
                    <p className="mt-1 text-sm text-fg-3">{m.provider}</p>
                  </div>
                  {n.fullyFunded ? (
                    <Badge tone="ok">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Fully funded
                    </Badge>
                  ) : (
                    <Badge tone="warn">{formatInr(n.stillNeeded)} still needed</Badge>
                  )}
                </div>
                <div className="mt-5" role="progressbar" aria-valuenow={n.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Funded">
                  <div className="flex justify-between text-sm">
                    <span className="text-fg-2">
                      {formatInr(n.target - n.stillNeeded)} of {formatInr(n.target)}
                    </span>
                    <span className="tabular-nums text-fg">{n.percent}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-bg-3">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${n.percent}%` }} />
                  </div>
                </div>
                {isSuper && (
                  <div className="mt-5 border-t border-line pt-4">
                    <Toggle
                      label="GST registration included"
                      hint="When off, the CS fee drops by ₹1,500."
                      checked={m.gstIncluded}
                      onChange={async (v) => (await action.run(() => api('PATCH', `/milestones/${m.id}`, { gstIncluded: v, expectedUpdatedAt: m.updatedAt }))) && reload()}
                    />
                    <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <Field
                        label="Target override (₹)"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder={`Auto: sum of items`}
                        defaultValue={m.targetOverride ?? ''}
                        onBlur={async (e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          if (v !== m.targetOverride && (await action.run(() => api('PATCH', `/milestones/${m.id}`, { targetOverride: v, expectedUpdatedAt: m.updatedAt })))) reload();
                        }}
                      />
                    </div>
                  </div>
                )}
                {!isSuper && <p className="mt-4 text-xs text-fg-3">GST registration {m.gstIncluded ? 'included' : 'not included'}.</p>}
                <div className="mt-3">
                  <ErrorText>{action.error}</ErrorText>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Stat label="Target" value={formatInr(n.target)} />
                <Stat label="Funds available" value={formatInr(n.fundsAvailable)} hint="Cash after paying members, incl. contributions" />
                <Stat label="Still needed" value={formatInr(n.stillNeeded)} accent={!n.fullyFunded} />
                <Stat label="Per founder (÷3)" value={formatInr(n.sharePerFounder)} />
                <Stat label="After pending income" value={formatInr(n.expectedAfterPending)} hint="If money still to receive comes in" />
                <Stat label="Per founder after pending" value={formatInr(n.sharePerFounderAfterPending)} />
              </div>

              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs uppercase tracking-[0.18em] text-fg-3">Line items</h2>
                  {isSuper && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ item: null, milestoneId: m.id })}>
                      <Plus className="h-4 w-4" /> Item
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {m.items.map((i) => (
                    <div key={i.id} className="flex flex-col gap-3 rounded-3xl border border-line bg-bg-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-fg">{i.label}</p>
                        <p className="mt-0.5 text-xs text-fg-3">
                          {i.note}
                          {i.paid && `${i.note ? ' · ' : ''}Paid by ${i.paidBy}${i.paidAt ? ` on ${formatDate(i.paidAt)}` : ''}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className={`tabular-nums ${i.paid ? 'text-fg-3 line-through' : 'text-fg'}`}>{formatInr(i.paid ? i.paidAmount : i.effectiveAmount)}</span>
                        {i.paid ? (
                          <Button size="sm" variant="quiet" busy={action.busy} onClick={async () => (await action.run(() => api('POST', `/milestone-items/${i.id}/unpay`))) && reload()}>
                            Undo paid
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={i.effectiveAmount <= 0} onClick={() => setPaying(i)}>
                            Mark paid
                          </Button>
                        )}
                        {isSuper && !i.paid && (
                          <>
                            <button type="button" aria-label={`Edit ${i.label}`} onClick={() => setEditing({ item: i, milestoneId: m.id })} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-3 hover:text-fg">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${i.label}`}
                              onClick={async () => (await action.run(() => api('DELETE', `/milestone-items/${i.id}`))) && reload()}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-3 hover:text-brand-2"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-fg-3">Founder contributions</h2>
                <Card>
                  <ContributionForm founders={founders} onSaved={reload} />
                </Card>
                {contributions.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-3">No contributions yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {contributions.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-bg-2 px-5 py-3 text-sm">
                        <span className="min-w-0">
                          <span className="text-fg">{c.founder}</span>
                          <span className="text-fg-3"> · {formatDate(c.date)}{c.note && ` · ${c.note}`}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{formatInr(c.amount)}</span>
                          {isSuper && (
                            <button
                              type="button"
                              aria-label="Delete contribution"
                              onClick={async () => (await action.run(() => api('DELETE', `/contributions/${c.id}`))) && reload()}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-3 hover:text-brand-2"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {editing && <ItemForm key={editing.item?.id ?? 'new'} item={editing.item} milestoneId={editing.milestoneId} open onClose={() => setEditing(null)} onSaved={reload} />}
              {paying && <PayDialog item={paying} founders={founders} onClose={() => setPaying(null)} onSaved={reload} />}
            </div>
          );
        }}
      </Async>
    </div>
  );
}
