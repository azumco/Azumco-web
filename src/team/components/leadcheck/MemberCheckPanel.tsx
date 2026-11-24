// One lead's Google check for a team member (Figma: Lead check · Member side,
// states a–j). Laptop: the detail panel beside the lead cards. Phone: a full
// screen with a sticky action bar. The server enforces every rule; this only
// reflects them (who may check, the 7-day rule, the allowance, the pause).

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, ExternalLink, History, Info, Lock, MapPin, RefreshCw, Search, Star, Store, WifiOff } from 'lucide-react';
import { CHECK_FIELD_LABEL, ourSide, type CheckField, type FieldCodes } from '../../../../shared/leadCheck';
import { ApiError } from '../../api';
import { navigate } from '../../router';
import { Button, Checkbox, ErrorText, cx } from '../../ui';
import {
  applyCheck, canRunLeadCheck, markNotOnGoogle, pickCandidate, recallCheck, runCheck, tally, viewCheck,
  type Allowance, type CheckResult, type Choice, type Offer,
} from '../../leadCheck';
import type { Lead, TeamUser } from '../../types';
import { AllowanceLine, CodeBadge, FieldRow, LeadPill, shortDate, type RowCode } from './parts';

type Layout = 'panel' | 'screen';
const DAY = 86_400_000;

// ─── Small pieces ───────────────────────────────────────────────────────────

const Note = ({ tone = 'neutral', icon, title, children }: { tone?: 'neutral' | 'good' | 'warn' | 'info' | 'bad' | 'violet'; icon: ReactNode; title: ReactNode; children?: ReactNode }) => (
  <div className={cx('flex items-start gap-3 rounded-2xl border px-4 py-3.5', {
    neutral: 'border-line bg-bg-3/40', good: 'border-good/40 bg-good/[0.07]', warn: 'border-warn/40 bg-warn/[0.07]', info: 'border-info/40 bg-info/[0.07]', bad: 'border-bad/40 bg-bad/[0.07]', violet: 'border-violet/40 bg-violet/[0.06]',
  }[tone])}>
    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', {
      neutral: 'bg-bg-3 text-fg-2', good: 'bg-good/15 text-good', warn: 'bg-warn/15 text-warn', info: 'bg-info/15 text-info', bad: 'bg-bad/15 text-bad', violet: 'bg-violet/15 text-violet',
    }[tone])}>{icon}</span>
    <div className="min-w-0">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-0.5 text-sm text-fg-2">{children}</p>}
    </div>
  </div>
);

/** Panel: buttons inline. Screen (phones): a sticky bar at the bottom; inline again from md. */
function Actions({ layout, children, note }: { layout: Layout; children: ReactNode; note?: ReactNode }) {
  if (layout === 'panel') {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {children}
        {note && <p className="text-xs text-fg-3">{note}</p>}
      </div>
    );
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-4 [&>button]:w-full md:[&>button]:w-auto">
        {children}
      </div>
      {note && <p className="mt-2 text-center text-xs text-fg-3 md:text-left">{note}</p>}
    </div>
  );
}

const who = (user: TeamUser, id: string, name: string) => (id && id === user.id ? 'you' : name || 'a founder');
const left = (a?: Allowance) => (a?.mine ? `${a.mine.remaining.toLocaleString('en-IN')} left` : '');

/** Rows for a summary: area and city share a row when neither needs a choice. */
function rowsFor(lead: Lead, fields: FieldCodes, google?: Partial<Record<CheckField, string>>) {
  const ours = ourSide(lead as unknown as Record<string, string>);
  const v = (f: CheckField) => ours[f];
  const rows: { key: string; label: string; ours: string; theirs: string; code: RowCode; fields: CheckField[] }[] = [];
  const open = (f: CheckField) => fields[f] === 'different' || fields[f] === 'google_only';
  for (const f of ['businessName', 'phone', 'area', 'website', 'category'] as CheckField[]) {
    if (f === 'area') {
      if (!open('area') && !open('city')) {
        const code: RowCode = fields.area === 'same' || fields.city === 'same' ? 'same' : fields.city === 'ours_only' || fields.area === 'ours_only' ? 'ours_only' : 'empty';
        rows.push({ key: 'place', label: 'Area · City', ours: [v('area'), v('city')].filter(Boolean).join(', '), theirs: [google?.area, google?.city].filter(Boolean).join(', '), code, fields: ['area', 'city'] });
      } else {
        for (const g of ['area', 'city'] as CheckField[]) rows.push({ key: g, label: CHECK_FIELD_LABEL[g], ours: v(g), theirs: google?.[g] ?? '', code: fields[g], fields: [g] });
      }
      continue;
    }
    rows.push({ key: f, label: CHECK_FIELD_LABEL[f], ours: v(f), theirs: google?.[f] ?? '', code: fields[f], fields: [f] });
  }
  return rows;
}

// ─── States ─────────────────────────────────────────────────────────────────

function Loading({ lead }: { lead: Lead }) {
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="space-y-4 rounded-3xl bg-bg-3/40 p-5">
        <p className="flex items-center gap-3 font-medium">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-bg-3 border-t-brand" aria-hidden="true" />
          Looking up {lead.businessName || 'this business'} on Google Maps…
        </p>
        {[0, 1, 2, 3].map((i) => <span key={i} className="block h-3 animate-pulse rounded-full bg-bg-3" />)}
      </div>
      <p className="text-xs text-fg-3">This takes a few seconds. You can leave this screen; we'll keep the result.</p>
    </div>
  );
}

function Differences({ lead, result, layout, onSaved }: { lead: Lead; result: CheckResult & { google: Offer; fields: FieldCodes }; layout: Layout; onSaved: (r: CheckResult) => void }) {
  const g = result.google.place;
  const codes = result.fields;
  const rows = rowsFor(lead, codes, g);
  const openRows = rows.filter((r) => r.code === 'different' || r.code === 'google_only');
  const [choices, setChoices] = useState<Partial<Record<CheckField, Choice>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const t = tally(codes);
  const changes = openRows.filter((r) => choices[r.fields[0]] === 'google').length;
  const choose = (f: CheckField, c: Choice) => setChoices((x) => ({ ...x, [f]: c }));
  const save = async (all: boolean) => {
    setBusy(all ? 'mine' : 'save');
    setError('');
    try {
      const body = Object.fromEntries(openRows.map((r) => [r.fields[0], all ? 'mine' : choices[r.fields[0]] ?? 'mine'])) as Partial<Record<CheckField, Choice>>;
      onSaved(await applyCheck(lead.id, result.google.token, body, confirmed));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy('');
    }
  };
  const headline = [t.different ? `${t.different} difference${t.different === 1 ? '' : 's'}` : '', t.googleOnly ? `${t.googleOnly} ${layout === 'screen' ? 'only on Google' : `thing${t.googleOnly === 1 ? '' : 's'} only Google has`}` : ''].filter(Boolean).join(layout === 'screen' ? ', ' : ', and ');

  return (
    <div className="space-y-4">
      <Note tone="warn" icon={<Info className="h-4 w-4" />} title={headline.charAt(0).toUpperCase() + headline.slice(1)}>
        {layout === 'screen' ? 'Pick one for each.' : 'Pick what to keep. Matching details are marked Same.'}
      </Note>

      {/* Wide: side by side */}
      <div className="hidden grid-cols-2 gap-3 @min-[600px]:grid">
        <section className="overflow-hidden rounded-3xl bg-bg-3/40">
          <header className="border-b border-line px-4 py-3.5"><p className="font-medium">What you added</p><p className="text-xs text-fg-3">You{lead.dateAdded ? ` · ${shortDate(lead.dateAdded)}` : ''}</p></header>
          {rows.map((r) => {
            const isOpen = r.code === 'different' || r.code === 'google_only';
            const replaced = choices[r.fields[0]] === 'google';
            return (
              <div key={r.key} className={cx('min-h-[96px] border-b border-line px-4 py-3.5 last:border-0', isOpen && 'bg-warn/[0.04]')}>
                <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">{r.label}</p>
                <p className={cx('mt-1 break-words', !r.ours ? 'text-fg-3' : replaced ? 'text-fg-3 line-through' : 'text-fg')}>{r.ours || 'Not added'}</p>
                <p className={cx('mt-1 text-xs', r.code === 'same' ? 'text-good' : 'text-fg-3')}>
                  {r.code === 'same' ? 'Same ✓' : isOpen ? (replaced ? (r.code === 'google_only' ? 'Will be added' : 'Will be replaced') : r.ours ? 'Keeping yours' : 'Not added') : r.code === 'ours_only' ? 'Only yours' : ''}
                </p>
              </div>
            );
          })}
        </section>
        <section className="overflow-hidden rounded-3xl border border-info/40 bg-bg-3/40">
          <header className="border-b border-line px-4 py-3.5"><p className="font-medium">What Google found</p><p className="text-xs text-fg-3">Shown now, not kept</p></header>
          {rows.map((r) => {
            const isOpen = r.code === 'different' || r.code === 'google_only';
            const using = choices[r.fields[0]] === 'google';
            return (
              <div key={r.key} className={cx('min-h-[96px] border-b border-line px-4 py-3.5 last:border-0', isOpen && 'bg-warn/[0.04]')}>
                <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">
                  {r.label}
                  {r.code === 'different' && <span className="ml-1.5 normal-case tracking-normal text-warn">· Different</span>}
                  {r.code === 'google_only' && <span className="ml-1.5 normal-case tracking-normal text-info">· Only on Google</span>}
                </p>
                <p className={cx('mt-1 break-words', r.theirs ? 'text-fg' : 'text-fg-3')}>{r.theirs || 'Not on Google'}</p>
                {isOpen ? (
                  <button
                    type="button"
                    aria-pressed={using}
                    onClick={() => choose(r.fields[0], using ? 'mine' : 'google')}
                    className={cx('mt-2 inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors', using ? 'border-info bg-info/12 text-info' : 'border-line-2 text-fg hover:border-fg/40')}
                  >
                    {using && <Check className="h-3 w-3" />}
                    {r.code === 'google_only' ? (using ? 'Adding to lead' : 'Add to lead') : using ? "Using Google's" : "Use Google's"}
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-fg-3">{r.code === 'same' ? 'Same' : ''}</p>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {/* Narrow: one choice per field */}
      <div className="space-y-3 @min-[600px]:hidden">
        {openRows.map((r) => {
          const pick = choices[r.fields[0]] ?? 'mine';
          const option = (side: Choice, value: string) => (
            <label className={cx('flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3', pick === side ? 'border-brand/60 bg-brand/[0.07]' : 'border-transparent bg-bg-3/50')}>
              <input type="radio" name={`m-${lead.id}-${r.key}`} className="h-4 w-4 shrink-0 accent-[var(--color-brand)]" checked={pick === side} onChange={() => choose(r.fields[0], side)} />
              <span className="min-w-0">
                <span className="block text-[11px] text-fg-3">{side === 'mine' ? 'Your team' : 'Google'}</span>
                <span className={cx('block break-words', value ? 'text-fg' : 'text-fg-3')}>{value || 'Not added'}</span>
              </span>
            </label>
          );
          return (
            <section key={r.key} className="space-y-2 rounded-3xl border border-warn/30 bg-bg-2 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">
                {r.label}
                <span className={cx('ml-1.5 normal-case tracking-normal', r.code === 'different' ? 'text-warn' : 'text-info')}>· {r.code === 'different' ? 'Different' : 'Only on Google'}</span>
              </p>
              {option('mine', r.ours)}
              {option('google', r.theirs)}
            </section>
          );
        })}
        {rows.filter((r) => !(r.code === 'different' || r.code === 'google_only')).map((r) => (
          <section key={r.key} className="rounded-3xl border border-line bg-bg-2 px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">{r.label}{r.code === 'same' && <span className="ml-1.5 normal-case tracking-normal text-good">· Same</span>}</p>
            <p className={cx('mt-1 break-words', r.ours ? 'text-fg' : 'text-fg-3')}>{r.ours || 'Not added'}</p>
          </section>
        ))}
      </div>

      <Actions layout={layout} note={changes > 0 && !confirmed ? "Tick the box once you've confirmed this with the business." : undefined}>
        <div className="flex w-full items-start gap-1 rounded-2xl md:rounded-3xl md:bg-bg-3/40 md:py-2 md:pr-4">
          <span className="-ml-1 -mt-1"><Checkbox checked={confirmed} onChange={setConfirmed} label="I've confirmed this with the business" /></span>
          <span className="min-w-0 pt-2">
            <span className="block text-sm font-medium">I've confirmed this with the business</span>
            <span className="hidden text-xs text-fg-3 md:block">Needed only when you use Google's details.</span>
          </span>
        </div>
        <Button busy={busy === 'save'} disabled={Boolean(busy) || changes === 0 || !confirmed} onClick={() => save(false)} className="md:order-2">
          Save {changes} change{changes === 1 ? '' : 's'}
        </Button>
        {layout === 'screen' ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => save(true)} className="min-h-11 text-sm font-medium text-brand md:order-1 md:rounded-full md:border md:border-line-2 md:px-5 md:text-fg">Keep all mine</button>
        ) : (
          <Button variant="secondary" busy={busy === 'mine'} disabled={Boolean(busy)} onClick={() => save(true)} className="md:order-1">Keep all mine</Button>
        )}
      </Actions>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function Summary({ lead, user, fields, title, sub, icon, values }: { lead: Lead; user: TeamUser; fields: FieldCodes; title: ReactNode; sub?: ReactNode; icon?: ReactNode; values?: 'ours' }) {
  const rows = rowsFor(lead, fields);
  void user;
  return (
    <section className="overflow-hidden rounded-3xl bg-bg-3/40">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet/15 text-violet">{icon}</span>}
        <div className="min-w-0"><p className="font-medium">{title}</p>{sub && <p className="text-xs text-fg-3">{sub}</p>}</div>
      </header>
      {rows.map((r) => (
        <FieldRow key={r.key} label={r.label} value={r.ours} code={r.code} note={values !== 'ours' && (r.code === 'different' || r.code === 'google_only') ? "Google's value not kept" : undefined} />
      ))}
    </section>
  );
}

function Pick({ lead, result, layout, onDone, onEdit }: { lead: Lead; result: CheckResult & { candidates: Offer[] }; layout: Layout; onDone: (r: CheckResult) => void; onEdit: () => void }) {
  const [chosen, setChosen] = useState(result.candidates[0]?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ours = ourSide(lead as unknown as Record<string, string>);
  const compare = async () => {
    setBusy(true);
    setError('');
    try {
      onDone(await pickCandidate(lead.id, chosen));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not compare. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Note tone="info" icon={<Search className="h-4 w-4" />} title={`Google found ${result.candidates.length} business${result.candidates.length === 1 ? '' : 'es'} that could be this one`}>
        Pick the right one. This doesn't use another check.
      </Note>
      <div className="rounded-2xl bg-bg-3/40 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">You added</p>
        <p className="mt-0.5 break-words text-sm">{[ours.businessName, [ours.area, ours.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
      </div>
      <fieldset className="space-y-2.5">
        <legend className="sr-only">Pick the right business</legend>
        {result.candidates.map((c) => (
          <label key={c.token} className={cx('flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3', chosen === c.token ? 'border-brand/70 bg-brand/[0.07]' : 'border-transparent bg-bg-3/50 hover:border-line-2')}>
            <input type="radio" name={`pick-${lead.id}`} className="h-4 w-4 shrink-0 accent-[var(--color-brand)]" checked={chosen === c.token} onChange={() => setChosen(c.token)} />
            <span className="min-w-0 flex-1">
              <span className="block break-words font-medium">{c.place.businessName}</span>
              <span className="block break-words text-xs text-fg-3">{c.place.address || [c.place.area, c.place.city].filter(Boolean).join(', ')}</span>
            </span>
            {c.place.rating !== null && (
              <span className="flex shrink-0 items-center gap-1 text-sm">
                <Star className="h-3.5 w-3.5 fill-warn text-warn" /><span className="font-medium">{c.place.rating.toFixed(1)}</span>
                {c.place.ratingCount !== null && <span className="text-xs text-fg-3">({c.place.ratingCount.toLocaleString('en-IN')})</span>}
              </span>
            )}
          </label>
        ))}
      </fieldset>
      <ErrorText>{error}</ErrorText>
      <Actions layout={layout}>
        <button type="button" onClick={onEdit} className="min-h-11 text-sm font-medium text-brand md:mr-auto">None of these? Edit the search</button>
        <Button busy={busy} disabled={!chosen || busy} onClick={compare}>Compare with this one</Button>
      </Actions>
    </div>
  );
}

function NotFound({ lead, query, searched, marked, allowance, layout, onResult, onError, onMarked, blocked }: {
  lead: Lead; query: string; searched: boolean; marked: boolean; allowance?: Allowance; layout: Layout; blocked: boolean;
  onResult: (r: CheckResult) => void; onError: (e: unknown) => void; onMarked: () => void;
}) {
  const [q, setQ] = useState(query);
  const [busy, setBusy] = useState('');
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('search');
    try {
      onResult(await runCheck(lead.id, q.trim() || undefined));
    } catch (err) {
      onError(err);
    } finally {
      setBusy('');
    }
  };
  const mark = async () => {
    setBusy('mark');
    try {
      await markNotOnGoogle(lead.id);
      onMarked();
    } catch (err) {
      onError(err);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-bg-3/40 px-4 py-6 text-center sm:px-6">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bad/15 text-bad"><MapPin className="h-5 w-5" /></span>
        <h3 className="mt-4 text-lg font-medium">{searched ? "Google couldn't find this business" : 'Search Google again'}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-fg-2">{searched ? 'Check the spelling, or add the area, and try again.' : 'Change the name or add the area, then search.'}</p>
        <form onSubmit={search} className="mx-auto mt-5 flex max-w-lg flex-col gap-2 sm:flex-row">
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line-2 bg-bg px-4 focus-within:border-brand">
            <Search className="h-4 w-4 shrink-0 text-fg-3" />
            <input aria-label="Search Google" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-fg outline-none" />
          </label>
          <Button type="submit" busy={busy === 'search'} disabled={Boolean(busy) || !q.trim() || blocked}>Search again</Button>
        </form>
        <p className="mt-2 text-xs text-fg-3">Searching again uses 1 check{allowance?.mine ? ` · ${left(allowance)}` : ''}</p>
      </section>
      {searched && (
        <Note tone="good" icon={<MapPin className="h-4 w-4" />} title="Not on Google Maps? That's a sales opportunity.">
          Getting this business on Google is something Azumco can help with.
        </Note>
      )}
      {marked ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-fg-2"><Check className="h-4 w-4 text-good" /> Marked as not on Google</p>
      ) : (
        <Actions layout={layout} note={layout === 'screen' ? 'Free' : undefined}>
          <Button variant="secondary" busy={busy === 'mark'} disabled={Boolean(busy)} onClick={mark}>Mark as not on Google</Button>
          {layout === 'panel' && <span className="text-xs text-fg-3">Free</span>}
        </Actions>
      )}
    </div>
  );
}

// ─── The panel ──────────────────────────────────────────────────────────────

export default function MemberCheckPanel({ lead, user, allowance, layout, onChanged }: { lead: Lead; user: TeamUser; allowance?: Allowance; layout: Layout; onChanged: () => void }) {
  const [result, setResult] = useState<CheckResult | undefined>(() => recallCheck(lead.id));
  const [phase, setPhase] = useState<'idle' | 'checking' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const gc = lead.googleCheck;
  const mine = canRunLeadCheck(user, lead);
  const paused = Boolean(allowance?.google.paused);
  const zero = Boolean(allowance?.mine && allowance.mine.remaining <= 0);
  const nextAt = gc.nextCheckAt && Date.parse(gc.nextCheckAt) > Date.now() ? gc.nextCheckAt : null;
  const defaultQuery = [lead.businessName, lead.area, lead.city].filter(Boolean).join(', ');

  const done = (r: CheckResult) => {
    setResult(r);
    setPhase('idle');
    setEditing(false);
    setMessage('');
    onChanged();
  };
  const fail = (e: unknown) => {
    onChanged();
    if (e instanceof ApiError && (e.status >= 500 || e.status === 0)) {
      setPhase('error');
      return;
    }
    setPhase('idle');
    setMessage(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
  };
  const last = useRef<() => Promise<CheckResult>>(() => runCheck(lead.id));
  const run = async (fn: () => Promise<CheckResult>) => {
    last.current = fn;
    setBusy(true);
    setPhase('checking');
    setMessage('');
    try {
      done(await fn());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const check = () => run(() => runCheck(lead.id));
  const searchAgain = () => run(() => runCheck(lead.id, defaultQuery));
  const lookup = () => run(() => viewCheck(lead.id));

  const blockedNote = paused ? 'Google checks are paused' : zero ? `Your checks reset on ${allowance ? shortDate(allowance.resetsOn) : 'the 1st'}` : nextAt ? `You can check this again from ${shortDate(nextAt)}` : '';
  const costNote = allowance?.mine ? `Uses 1 of your checks · ${left(allowance)}` : 'Uses 1 Google call';

  const header = layout === 'panel' ? (
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-3 text-fg-3"><Store className="h-4.5 w-4.5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-xl font-medium tracking-[-0.02em] sm:text-2xl">{lead.businessName || lead.label}</h2>
        <p className="text-sm text-fg-3">{subline(lead, user)}</p>
      </div>
      <span className="shrink-0"><LeadPill lead={lead} /></span>
    </div>
  ) : (
    <LeadPill lead={lead} />
  );

  const body = (() => {
    if (lead.origin === 'find_clients') {
      return <Note icon={<MapPin className="h-4 w-4" />} title="From Find clients">This lead came from Google already, so it isn't checked.</Note>;
    }
    if (!mine) {
      return (
        <div className="space-y-4">
          {gc.fields && <Summary lead={lead} user={user} fields={gc.fields} values="ours" title={`Checked by ${who(user, gc.checkedById, gc.checkedByName)}${gc.checkedAt ? ` on ${shortDate(gc.checkedAt)}` : ''}`} />}
          <Note icon={<Lock className="h-4 w-4" />} title="Only the person who added a lead can check it">
            This lead was given to you by {lead.addedByName || 'a founder'}, so it's view-only here.
          </Note>
        </div>
      );
    }
    if (phase === 'checking') return <Loading lead={lead} />;
    if (phase === 'error') {
      return (
        <section className="rounded-3xl bg-bg-3/40 px-4 py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bad/15 text-bad"><WifiOff className="h-5 w-5" /></span>
          <h3 className="mt-4 text-lg font-medium">Couldn't reach Google</h3>
          <p className="mt-1 text-sm text-fg-2">This didn't use a check. Try again in a minute.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={() => void run(last.current)}><RefreshCw className="h-4 w-4" /> Try again</Button>
            <Button variant="secondary" onClick={() => navigate('/team/leads')}>Back to list</Button>
          </div>
        </section>
      );
    }

    // A search result from this visit.
    if (result && editing) {
      return <NotFound lead={lead} query={result.query ?? defaultQuery} searched={false} marked={false} allowance={allowance} layout={layout} blocked={paused || zero} onResult={done} onError={fail} onMarked={onChanged} />;
    }
    if (result?.status === 'pick' && result.candidates?.length) {
      return <Pick lead={lead} result={result as CheckResult & { candidates: Offer[] }} layout={layout} onDone={done} onEdit={() => setEditing(true)} />;
    }
    if (result?.status === 'not_found') {
      return <NotFound key={result.query} lead={lead} query={result.query ?? defaultQuery} searched marked={gc.status === 'not_on_google'} allowance={allowance} layout={layout} blocked={paused || zero} onResult={done} onError={fail} onMarked={onChanged} />;
    }
    if (result?.google && result.fields) {
      const t = tally(result.fields);
      if (t.different + t.googleOnly > 0 && result.status === 'needs_review') {
        return <Differences key={`${result.google.token}:${lead.updatedAt}`} lead={lead} result={result as CheckResult & { google: Offer; fields: FieldCodes }} layout={layout} onSaved={done} />;
      }
      return <Matched lead={lead} user={user} fields={result.fields} status={result.status} calls={result.calls} mapsUrl={result.google.place.mapsUrl} />;
    }

    // Nothing fetched on this visit: the stored result, or the first check.
    if (gc.status === 'matches' && gc.fields) return <Matched lead={lead} user={user} fields={gc.fields} status="matches" calls={0} mapsUrl={gc.mapsUrl} />;
    if ((gc.status === 'needs_review' || gc.status === 'reviewed') && gc.fields) {
      const t = tally(gc.fields);
      const found = [t.different ? `${t.different} difference${t.different === 1 ? '' : 's'}` : '', t.googleOnly ? `${t.googleOnly} only on Google` : ''].filter(Boolean).join(', ') || 'Nothing different';
      return (
        <div className="space-y-4">
          <Summary lead={lead} user={user} fields={gc.fields} icon={<History className="h-4 w-4" />}
            title={`Last checked ${gc.checkedAt ? shortDate(gc.checkedAt) : ''} by ${who(user, gc.checkedById, gc.checkedByName)}`}
            sub={`${found} found · ${gc.status === 'reviewed' ? 'you kept yours' : 'not reviewed yet'}`} />
          <p className="flex items-start gap-2.5 rounded-2xl bg-bg-3/40 px-4 py-3 text-sm text-fg-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" />We don't keep Google's details. To see them again, we look them up fresh.</p>
          <Actions layout={layout} note={blockedNote || costNote}>
            <Button variant="secondary" busy={busy} disabled={busy || Boolean(blockedNote)} onClick={lookup}><Search className="h-4 w-4" /> Show Google's details</Button>
          </Actions>
        </div>
      );
    }
    if (gc.status === 'pick') {
      return (
        <div className="space-y-4">
          <Note tone="info" icon={<Search className="h-4 w-4" />} title={`Google found ${gc.candidates} businesses that could be this one`}>We don't keep Google's details, so showing them again is a fresh search.</Note>
          <Actions layout={layout} note={paused || zero ? blockedNote : costNote}>
            <Button busy={busy} disabled={busy || paused || zero} onClick={searchAgain}><Search className="h-4 w-4" /> Show the matches again</Button>
          </Actions>
        </div>
      );
    }
    if (gc.status === 'not_found' || gc.status === 'not_on_google') {
      return <NotFound lead={lead} query={defaultQuery} searched marked={gc.status === 'not_on_google'} allowance={allowance} layout={layout} blocked={paused || zero} onResult={done} onError={fail} onMarked={onChanged} />;
    }

    // Not checked yet.
    if (nextAt) {
      const days = gc.lastCallAt ? Math.max(0, Math.floor((Date.now() - Date.parse(gc.lastCallAt)) / DAY)) : 0;
      return (
        <div className="space-y-4">
          <Note icon={<History className="h-4 w-4" />} title={days === 0 ? 'Checked today' : `Checked ${days} day${days === 1 ? '' : 's'} ago`}>Each lead can be checked once every {allowance?.cooldownDays ?? 7} days, whoever checked it last.</Note>
          <Actions layout={layout} note={`You can check this again from ${shortDate(nextAt)}`}>
            <Button variant="secondary" disabled><Search className="h-4 w-4" /> Check with Google</Button>
          </Actions>
        </div>
      );
    }
    if (paused || zero) {
      return (
        <div className="space-y-4">
          {paused ? (
            <Note tone="violet" icon={<Info className="h-4 w-4" />} title="Google checks are paused">A super admin has paused them for now. No checks are used while paused.</Note>
          ) : (
            <Note icon={<Info className="h-4 w-4" />} title="You've used all your checks this month">They reset on {allowance ? shortDate(allowance.resetsOn) : 'the 1st'}. If you need more, ask a founder.</Note>
          )}
          <Actions layout={layout}>
            <Button variant="secondary" disabled><Search className="h-4 w-4" /> Check with Google</Button>
          </Actions>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <section className="rounded-3xl bg-bg-3/40 p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-info/15 text-info"><Search className="h-4.5 w-4.5" /></span>
          <h3 className="mt-4 text-lg font-medium">Check this lead against Google Maps</h3>
          <ul className="mt-3 space-y-2 text-sm text-fg-2">
            {['We look up this business on Google Maps.', "You see what matches and what's different.", 'You choose what to keep.'].map((t) => (
              <li key={t} className="flex items-start gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-good" />{t}</li>
            ))}
          </ul>
        </section>
        <Actions layout={layout} note={costNote}>
          <Button busy={busy} disabled={busy} onClick={check}><Search className="h-4 w-4" /> Check with Google</Button>
        </Actions>
      </div>
    );
  })();

  return (
    <div className={cx('space-y-5', layout === 'screen' && 'pb-44 md:pb-0')}>
      {mine && (zero || paused) && <AllowanceLine allowance={allowance} compact />}
      {header}
      {body}
      {message && <ErrorText>{message}</ErrorText>}
    </div>
  );
}

function Matched({ lead, user, fields, status, calls, mapsUrl }: { lead: Lead; user: TeamUser; fields: FieldCodes; status: string; calls: number; mapsUrl: string | null }) {
  const gc = lead.googleCheck;
  const rows = rowsFor(lead, fields);
  const allSame = rows.every((r) => r.code === 'same' || r.code === 'empty' || r.code === 'ours_only');
  return (
    <div className="space-y-4">
      {allSame ? (
        <Note tone="good" icon={<Check className="h-4 w-4" />} title="Everything matches Google">What you added is the same as the Google Maps listing.</Note>
      ) : (
        <Note tone="violet" icon={<Check className="h-4 w-4" />} title={status === 'reviewed' ? 'Saved' : 'Checked'}>You chose what to keep. Google's details aren't kept.</Note>
      )}
      <section className="overflow-hidden rounded-3xl bg-bg-3/40">
        {rows.map((r) => <FieldRow key={r.key} label={r.label} value={r.ours} code={r.code} note={r.code === 'different' || r.code === 'google_only' ? "Google's value not kept" : undefined} />)}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-3">
        <span>
          {calls ? `Checked just now by you · used ${calls} check` : `Checked ${gc.checkedAt ? shortDate(gc.checkedAt) : ''} by ${who(user, gc.checkedById, gc.checkedByName)}`}
        </span>
        {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand">Open in Google Maps <ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
    </div>
  );
}

/** "Added by you · Bhopal", "Given to you by Founder 2 · Bhopal", "From Find clients · Indore". */
export function subline(lead: Lead, user: TeamUser) {
  const place = [lead.area, lead.city].filter(Boolean).join(', ');
  const source = lead.origin === 'find_clients' ? 'From Find clients' : lead.addedBy === user.id ? 'Added by you' : `Given to you by ${lead.addedByName || 'a founder'}`;
  return [source, place].filter(Boolean).join(' · ');
}

export { CodeBadge };
