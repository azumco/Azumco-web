// One lead checked against Google (founders). Screens:
//   matches       everything the team added is the same as the listing
//   differences   side by side on laptops, stacked with a choice per field on phones
//   pick          Google found several businesses that could be this one
//   not on Google an editable search, "Mark as not on Google" and the sales note
// Google's values are shown live and never saved, except the ones a founder
// confirms with the business and chooses to save into the lead.

import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronLeft, ExternalLink, Info, MapPin, RefreshCw, Search, Star } from 'lucide-react';
import { CHECK_FIELDS, CHECK_FIELD_LABEL, ourSide, type CheckField, type FieldCode } from '../../../shared/leadCheck';
import { formatDate, formatDateTime } from '../../../shared/time';
import { ApiError } from '../api';
import { useApi } from '../hooks';
import { navigate } from '../router';
import { Avatar, Button, Checkbox, ErrorText, Loading, LoadError, cx } from '../ui';
import {
  ALLOWANCE_PATH, applyCheck, canRunLeadCheck, checksLeft, leftText, markNotOnGoogle, pickCandidate, recallCheck, runCheck, tally, viewCheck,
  type Allowance, type CheckResult, type Choice, type Offer,
} from '../leadCheck';
import type { Lead, TeamUser } from '../types';

type PlacesUsage = Allowance;
const BACK = '/team/leads?tab=google';

function useCall() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const run = async <T,>(what: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(what);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      return undefined;
    } finally {
      setBusy('');
    }
  };
  return { busy, error, run };
}

/** Our side of a field, as shown. */
const oursValue = (lead: Lead, f: CheckField) => ourSide(lead as unknown as Record<string, string>)[f];

const Banner = ({ tone, icon, title, children }: { tone: 'good' | 'warn' | 'info' | 'bad'; icon: ReactNode; title: ReactNode; children?: ReactNode }) => (
  <div className={cx('flex items-center gap-4 rounded-3xl border px-4 py-4 sm:px-5', {
    good: 'border-good/40 bg-good/[0.07]', warn: 'border-warn/40 bg-warn/[0.07]', info: 'border-info/40 bg-info/[0.07]', bad: 'border-bad/40 bg-bad/[0.07]',
  }[tone])}>
    <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', { good: 'bg-good/15 text-good', warn: 'bg-warn/15 text-warn', info: 'bg-info/15 text-info', bad: 'bg-bad/15 text-bad' }[tone])}>{icon}</span>
    <div className="min-w-0">
      <p className="font-medium">{title}</p>
      {children && <p className="text-sm text-fg-2">{children}</p>}
    </div>
  </div>
);

const Badge = ({ code }: { code: FieldCode }) =>
  code === 'different' ? <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/12 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-warn"><span className="h-1.5 w-1.5 rounded-full bg-current" />Different</span>
  : code === 'google_only' ? <span className="inline-flex items-center gap-1.5 rounded-full bg-info/12 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-info"><span className="h-1.5 w-1.5 rounded-full bg-current" />Only on Google</span>
  : code === 'same' ? <span className="inline-flex items-center gap-1 rounded-full bg-good/12 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-good"><Check className="h-3 w-3" />Same</span>
  : null;

const SameMark = () => <span className="inline-flex items-center gap-1 text-xs font-medium text-good"><Check className="h-3.5 w-3.5" /> Same</span>;
const Label = ({ children }: { children: ReactNode }) => <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">{children}</p>;
const Value = ({ v, struck }: { v: string; struck?: boolean }) => (
  <p className={cx('mt-1 break-words', !v ? 'text-fg-3' : struck ? 'text-fg-3 line-through' : 'text-fg')}>{v || 'Not added'}</p>
);

function CallNote({ usage, children = 'Uses 1 Google call' }: { usage?: PlacesUsage; children?: ReactNode }) {
  return <p className="text-xs text-fg-3">{children}{usage ? ` · ${leftText(usage)}` : ''}.</p>;
}

// ─── Compare (matches / differences) ────────────────────────────────────────

function Compare({ lead, result, usage, onSaved }: { lead: Lead; result: CheckResult & { google: Offer; fields: NonNullable<CheckResult['fields']> }; usage?: PlacesUsage; onSaved: (r: CheckResult) => void }) {
  const g = result.google.place;
  const codes = result.fields;
  const open = CHECK_FIELDS.filter((f) => codes[f] === 'different' || codes[f] === 'google_only');
  const [choices, setChoices] = useState<Partial<Record<CheckField, Choice>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const call = useCall();
  const t = tally(codes);
  const changes = open.filter((f) => choices[f] === 'google').length;
  const choose = (f: CheckField, c: Choice) => setChoices((x) => ({ ...x, [f]: c }));
  const save = (all: 'mine' | 'chosen') => call.run(all, async () => {
    const body = Object.fromEntries(open.map((f) => [f, all === 'mine' ? 'mine' : choices[f] ?? 'mine'])) as Partial<Record<CheckField, Choice>>;
    onSaved(await applyCheck(lead.id, result.google.token, body, confirmed));
  });

  if (!open.length) {
    return (
      <div className="space-y-6">
        <Banner tone="good" icon={<Check className="h-5 w-5" />} title={result.status === 'reviewed' ? 'Checked against Google' : 'Everything matches Google'}>
          {result.status === 'reviewed' ? 'You chose which details to keep. Nothing else differs from the listing.' : 'What your team added is the same as the Google Maps listing.'}
        </Banner>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <section className="overflow-hidden rounded-3xl border border-line bg-bg-2">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <p className="font-medium">What your team added</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-good/12 px-2.5 py-1 text-xs font-medium text-good"><Check className="h-3 w-3" />Same as Google</span>
            </div>
            {CHECK_FIELDS.map((f) => (
              <div key={f} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-5 py-3.5 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                <span className="col-span-2 text-[11px] uppercase tracking-[0.16em] text-fg-3 sm:col-span-1">{CHECK_FIELD_LABEL[f]}</span>
                <span className={cx('min-w-0 break-words', oursValue(lead, f) ? 'text-fg' : 'text-fg-3')}>{oursValue(lead, f) || (codes[f] === 'empty' ? 'Neither has it' : 'Not added')}</span>
                {codes[f] === 'same' ? <SameMark /> : <span className="text-xs text-fg-3">{codes[f] === 'ours_only' ? 'Only ours' : '—'}</span>}
              </div>
            ))}
          </section>
          <Linked lead={lead} place={g} calls={result.calls} usage={usage} />
        </div>
      </div>
    );
  }

  const summary = [t.different ? `${t.different} difference${t.different === 1 ? '' : 's'}` : '', t.googleOnly ? `${t.googleOnly} detail${t.googleOnly === 1 ? '' : 's'} only Google has` : ''].filter(Boolean).join(', and ');
  const gValue = (f: CheckField) => g[f];

  return (
    <div className="space-y-6">
      <Banner tone="warn" icon={<AlertTriangle className="h-5 w-5" />} title={summary.charAt(0).toUpperCase() + summary.slice(1)}>
        Choose which version to keep for each one. Matching details are marked Same.
      </Banner>

      {/* Laptop: side by side */}
      <div className="hidden gap-5 lg:grid lg:grid-cols-2">
        <section className="overflow-hidden rounded-3xl border border-line bg-bg-2">
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <Avatar name={lead.addedByName || '?'} tone="violet" />
            <div className="min-w-0"><p className="font-medium">What your team added</p><p className="truncate text-xs text-fg-3">{[lead.addedByName, lead.dateAdded && formatDate(lead.dateAdded).slice(0, 6)].filter(Boolean).join(' · ')}</p></div>
          </header>
          {CHECK_FIELDS.map((f) => {
            const c = codes[f];
            const isOpen = open.includes(f);
            const replaced = choices[f] === 'google';
            return (
              <div key={f} className={cx('flex min-h-[76px] items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0', isOpen && 'bg-warn/[0.03]')}>
                <div className="min-w-0"><Label>{CHECK_FIELD_LABEL[f]}</Label><Value v={oursValue(lead, f)} struck={replaced} /></div>
                {c === 'same' ? <SameMark /> : isOpen && c === 'different' ? (
                  replaced ? <button type="button" onClick={() => choose(f, 'mine')} className="min-h-9 shrink-0 rounded-full px-3 text-xs text-fg-3 hover:text-fg">Replaced · undo</button>
                  : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg-3 px-3 py-1.5 text-xs font-medium text-fg"><Check className="h-3 w-3" /> Keep mine</span>
                ) : null}
              </div>
            );
          })}
        </section>
        <section className="overflow-hidden rounded-3xl border border-info/40 bg-bg-2">
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-info/12 text-info"><MapPin className="h-4 w-4" /></span>
            <div className="min-w-0"><p className="font-medium">What Google found</p><p className="text-xs text-fg-3">Google Maps · shown live, not saved</p></div>
          </header>
          {CHECK_FIELDS.map((f) => {
            const c = codes[f];
            const using = choices[f] === 'google';
            return (
              <div key={f} className={cx('flex min-h-[76px] items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0', open.includes(f) && 'bg-warn/[0.03]')}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Label>{CHECK_FIELD_LABEL[f]}</Label>{(c === 'different' || c === 'google_only') && <Badge code={c} />}</div>
                  <p className={cx('mt-1 break-words', gValue(f) ? 'text-fg' : 'text-fg-3')}>{gValue(f) || 'Not on Google'}</p>
                </div>
                {c === 'same' ? <span className="text-xs text-fg-3">Same</span> : open.includes(f) ? (
                  <button
                    type="button"
                    aria-pressed={using}
                    onClick={() => choose(f, using ? 'mine' : 'google')}
                    className={cx('inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors', using ? 'border-info bg-info/12 text-info' : 'border-line-2 text-fg hover:border-fg/40')}
                  >
                    {using && <Check className="h-3 w-3" />}
                    {c === 'google_only' ? (using ? 'Adding to lead' : 'Add to lead') : using ? "Using Google's" : "Use Google's"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>

      {/* Phone and tablet: stacked, one choice per field */}
      <div className="space-y-3 lg:hidden">
        <p className="flex items-center gap-4 text-xs text-fg-3"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet" />Your team</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-info" />Google · shown live, not saved</span></p>
        {open.map((f) => {
          const pick = choices[f] ?? 'mine';
          const option = (who: Choice, v: string) => (
            <label className={cx('flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3', pick === who ? 'border-brand/60 bg-brand/[0.06]' : 'border-transparent bg-bg-3/50')}>
              <input type="radio" name={`choice-${f}`} className="h-4 w-4 accent-[var(--color-brand)]" checked={pick === who} onChange={() => choose(f, who)} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[11px] text-fg-3"><span className={cx('h-1.5 w-1.5 rounded-full', who === 'mine' ? 'bg-violet' : 'bg-info')} />{who === 'mine' ? 'Your team' : 'Google'}</span>
                <span className={cx('block break-words', v ? 'text-fg' : 'text-fg-3')}>{v || 'Not added'}</span>
              </span>
            </label>
          );
          return (
            <section key={f} className="space-y-2 rounded-3xl border border-warn/30 bg-bg-2 p-4">
              <div className="flex items-center gap-2"><Label>{CHECK_FIELD_LABEL[f]}</Label><Badge code={codes[f]} /></div>
              {option('mine', oursValue(lead, f))}
              {option('google', gValue(f))}
            </section>
          );
        })}
        {CHECK_FIELDS.some((f) => !open.includes(f)) && (
          <section className="rounded-3xl border border-line bg-bg-2 p-4">
            {CHECK_FIELDS.filter((f) => !open.includes(f)).map((f) => (
              <div key={f} className="flex items-center justify-between gap-3 border-b border-line py-2.5 first:pt-0 last:border-0 last:pb-0">
                <div className="min-w-0"><Label>{CHECK_FIELD_LABEL[f]}</Label><p className={cx('mt-0.5 break-words', oursValue(lead, f) ? 'text-fg' : 'text-fg-3')}>{oursValue(lead, f) || 'Not added'}</p></div>
                {codes[f] === 'same' ? <Badge code="same" /> : <span className="text-xs text-fg-3">{codes[f] === 'ours_only' ? 'Only ours' : '—'}</span>}
              </div>
            ))}
          </section>
        )}
      </div>

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:bottom-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-line bg-bg-2/95 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-start gap-1">
            <span className="-ml-3 -mt-2"><Checkbox checked={confirmed} onChange={setConfirmed} label="I've confirmed this with the business" /></span>
            <div className="min-w-0">
              <p className="text-sm font-medium">I've confirmed this with the business</p>
              <p className="text-xs text-fg-3">Google's details are only saved to the lead once you've checked them, for example on a call.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" busy={call.busy === 'mine'} disabled={Boolean(call.busy)} onClick={() => save('mine')} className="flex-1 sm:flex-none">Keep all mine</Button>
            <Button busy={call.busy === 'chosen'} disabled={Boolean(call.busy) || changes === 0 || !confirmed} onClick={() => save('chosen')} className="flex-1 sm:flex-none">
              Save {changes} change{changes === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
        {changes > 0 && !confirmed && <p className="mt-2 px-2 text-xs text-warn">Tick the box once you've confirmed these with the business to save them.</p>}
        <div className="px-2"><ErrorText>{call.error}</ErrorText></div>
      </div>
      <Linked lead={lead} place={g} calls={result.calls} usage={usage} compact />
    </div>
  );
}

function Linked({ lead, place, calls, usage, compact }: { lead: Lead; place: { mapsUrl: string }; calls: number; usage?: PlacesUsage; compact?: boolean }) {
  const when = lead.googleCheck.checkedAt ? formatDateTime(lead.googleCheck.checkedAt) : 'just now';
  return (
    <section className={cx('rounded-3xl border border-line bg-bg-2 p-5', compact && 'sm:flex sm:items-center sm:justify-between sm:gap-6')}>
      <div>
        <p className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4 text-fg-3" /> Linked to Google Maps</p>
        {!compact && <p className="mt-2 text-sm text-fg-2">This lead is now linked to its Google Maps listing, so you can check it again any time.</p>}
        <a href={place.mapsUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand">Open in Google Maps <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <div className={cx('rounded-2xl bg-bg-3/60 px-4 py-3 text-xs text-fg-3', compact ? 'mt-4 sm:mt-0' : 'mt-4')}>
        <p>Checked {when}{lead.googleCheck.checkedByName ? ` by ${lead.googleCheck.checkedByName}` : ''}</p>
        <p>{calls ? `Used ${calls} Google call${calls === 1 ? '' : 's'}` : 'No Google call used'}{usage ? ` · ${leftText(usage)}` : ''}</p>
      </div>
    </section>
  );
}


// ─── A lead checked earlier (Google's details are not kept) ─────────────────
// Same layouts as the "matches" (02), "differences" (03) and "pick" (04)
// frames, built from what we do keep: the lead's own values, the per-field
// result codes, the linked place (Maps link) and who checked it when.

const day = (iso: string) => formatDate(iso).replace(/^0/, '').replace(/\s\d{4}$/, '');

function StoredView({ lead, usage, busy, onShow, onSearch }: { lead: Lead; usage?: PlacesUsage; busy: string; onShow: () => void; onSearch: () => void }) {
  const gc = lead.googleCheck;
  const nextAt = gc.nextCheckAt && Date.parse(gc.nextCheckAt) > Date.now() ? gc.nextCheckAt : null;
  const blocked = checksLeft(usage) <= 0;
  const when = gc.checkedAt ? `${day(gc.checkedAt)}${gc.checkedByName ? ` by ${gc.checkedByName}` : ''}` : '';
  const note = nextAt ? `You can check this again from ${day(nextAt)}` : 'Uses 1 Google call';

  if (gc.status === 'pick') {
    const ours = ourSide(lead as unknown as Record<string, string>);
    return (
      <div className="space-y-5">
        <Banner tone="info" icon={<Search className="h-5 w-5" />} title={`Google found ${gc.candidates} business${gc.candidates === 1 ? '' : 'es'} that could be this one`}>
          Google&apos;s details aren&apos;t kept, so seeing them again is a fresh search. Then pick the right one and we&apos;ll compare it.
        </Banner>
        <div className="flex items-center gap-3 rounded-3xl border border-line bg-bg-2 px-4 py-3.5 sm:px-5">
          <Avatar name={lead.addedByName || '?'} tone="violet" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">What your team added</p>
            <p className="break-words text-sm text-fg sm:text-base">{[ours.businessName, ours.phone, [ours.area, ours.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-3">{when && `Searched ${when}`}</p>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button busy={busy === 'check'} disabled={Boolean(busy) || blocked} onClick={onSearch}><Search className="h-4 w-4" /> Show the matches again</Button>
            <CallNote usage={usage} />
          </div>
        </div>
      </div>
    );
  }

  const codes = gc.fields!;
  const open = CHECK_FIELDS.filter((f) => codes[f] === 'different' || codes[f] === 'google_only');
  const showButton = (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="secondary" size="sm" busy={busy === 'view'} disabled={Boolean(busy) || blocked || Boolean(nextAt)} onClick={onShow}>
        <Search className="h-4 w-4" /> Show Google&apos;s details
      </Button>
      <span className="text-[11px] text-fg-3">{note}</span>
    </div>
  );

  // 02 · Everything matches
  if (!open.length) {
    return (
      <div className="space-y-6">
        <Banner tone="good" icon={<Check className="h-5 w-5" />} title="Everything matches Google">
          What your team added is the same as the Google Maps listing.
        </Banner>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <section className="overflow-hidden rounded-3xl border border-line bg-bg-2">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <p className="font-medium">What your team added</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-good/12 px-2.5 py-1 text-xs font-medium text-good"><Check className="h-3 w-3" />Same as Google</span>
            </div>
            {CHECK_FIELDS.map((f) => (
              <div key={f} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-5 py-3.5 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                <span className="col-span-2 text-[11px] uppercase tracking-[0.16em] text-fg-3 sm:col-span-1">{CHECK_FIELD_LABEL[f]}</span>
                <span className={cx('min-w-0 break-words', oursValue(lead, f) ? 'text-fg' : 'text-fg-3')}>{oursValue(lead, f) || 'Not added'}</span>
                {codes[f] === 'same' ? <SameMark /> : <span className="text-xs text-fg-3">{codes[f] === 'ours_only' ? 'Only ours' : '—'}</span>}
              </div>
            ))}
          </section>
          <section className="rounded-3xl border border-line bg-bg-2 p-5">
            <p className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4 text-fg-3" /> Linked to Google Maps</p>
            <p className="mt-2 text-sm text-fg-2">This lead is linked to its Google Maps listing, so you can check it again any time.</p>
            {gc.mapsUrl && <a href={gc.mapsUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand">Open in Google Maps <ExternalLink className="h-3.5 w-3.5" /></a>}
            <div className="mt-3 rounded-2xl bg-bg-3/60 px-4 py-3 text-xs text-fg-3">
              <p>{when ? `Checked ${when}` : 'Checked earlier'}</p>
              <p>{nextAt ? `Next check from ${day(nextAt)}` : 'Checking again uses 1 Google call'}</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // 03 · Differences side by side (stacked on phones)
  const t = tally(codes);
  const summary = [t.different ? `${t.different} difference${t.different === 1 ? '' : 's'}` : '', t.googleOnly ? `${t.googleOnly} detail${t.googleOnly === 1 ? '' : 's'} only Google has` : ''].filter(Boolean).join(', and ');
  const reviewed = gc.status === 'reviewed';
  return (
    <div className="space-y-6">
      <Banner tone={reviewed ? 'info' : 'warn'} icon={reviewed ? <Check className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />} title={reviewed ? `Reviewed — ${summary}` : summary.charAt(0).toUpperCase() + summary.slice(1)}>
        {reviewed ? 'You kept your team’s details. ' : ''}Google&apos;s details aren&apos;t kept. Show them again to compare and choose what to keep.
      </Banner>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="overflow-hidden rounded-3xl border border-line bg-bg-2">
          <header className="flex items-center gap-3 border-b border-line px-5 py-4">
            <Avatar name={lead.addedByName || '?'} tone="violet" />
            <div className="min-w-0"><p className="font-medium">What your team added</p><p className="truncate text-xs text-fg-3">{[lead.addedByName, lead.dateAdded && day(lead.dateAdded)].filter(Boolean).join(' · ')}</p></div>
          </header>
          {CHECK_FIELDS.map((f) => {
            const c = codes[f];
            return (
              <div key={f} className={cx('flex min-h-[76px] items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0', open.includes(f) && 'bg-warn/[0.03]')}>
                <div className="min-w-0"><Label>{CHECK_FIELD_LABEL[f]}</Label><Value v={oursValue(lead, f)} /></div>
                {c === 'same' ? <SameMark /> : c === 'different' ? (
                  <span className="shrink-0 text-xs text-fg-3">{reviewed ? 'Kept yours' : 'Yours'}</span>
                ) : null}
              </div>
            );
          })}
        </section>
        <section className="overflow-hidden rounded-3xl border border-info/40 bg-bg-2">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info/12 text-info"><MapPin className="h-4 w-4" /></span>
              <div className="min-w-0"><p className="font-medium">What Google found</p><p className="text-xs text-fg-3">{when ? `Checked ${when} · details not kept` : 'Details not kept'}</p></div>
            </div>
            {showButton}
          </header>
          {CHECK_FIELDS.map((f) => {
            const c = codes[f];
            return (
              <div key={f} className={cx('flex min-h-[76px] items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-0', open.includes(f) && 'bg-warn/[0.03]')}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Label>{CHECK_FIELD_LABEL[f]}</Label>{(c === 'different' || c === 'google_only') && <Badge code={c} />}</div>
                  <p className="mt-1 text-fg-3">{c === 'same' ? oursValue(lead, f) || '—' : c === 'different' || c === 'google_only' ? 'Not kept — show Google’s details' : c === 'ours_only' ? 'Not on Google' : '—'}</p>
                </div>
                {c === 'same' ? <span className="shrink-0 text-xs text-fg-3">Same</span> : null}
              </div>
            );
          })}
        </section>
      </div>
      {gc.mapsUrl && (
        <a href={gc.mapsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand">Open in Google Maps <ExternalLink className="h-3.5 w-3.5" /></a>
      )}
    </div>
  );
}

// ─── Pick a match ───────────────────────────────────────────────────────────

function Pick({ lead, result, usage, onDone, onSearch }: { lead: Lead; result: CheckResult & { candidates: Offer[] }; usage?: PlacesUsage; onDone: (r: CheckResult) => void; onSearch: () => void }) {
  const [chosen, setChosen] = useState(result.candidates[0]?.token ?? '');
  const call = useCall();
  const ours = ourSide(lead as unknown as Record<string, string>);
  return (
    <div className="space-y-5">
      <Banner tone="info" icon={<Search className="h-5 w-5" />} title={`Google found ${result.candidates.length} business${result.candidates.length === 1 ? '' : 'es'} that could be this one`}>
        Pick the right one and we'll compare it with what your team added.
      </Banner>
      <div className="flex items-center gap-3 rounded-3xl border border-line bg-bg-2 px-4 py-3.5 sm:px-5">
        <Avatar name={lead.addedByName || '?'} tone="violet" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-fg-3">What your team added</p>
          <p className="break-words text-sm text-fg sm:text-base">{[ours.businessName, ours.phone, [ours.area, ours.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="sr-only">Pick the right business</legend>
        {result.candidates.map((c, i) => (
          <label key={c.token} className={cx('flex cursor-pointer items-center gap-3 rounded-3xl border px-4 py-4 transition-colors sm:gap-4 sm:px-5', chosen === c.token ? 'border-brand/70 bg-brand/[0.06]' : 'border-line bg-bg-2 hover:border-line-2')}>
            <input type="radio" name="candidate" className="h-4 w-4 shrink-0 accent-[var(--color-brand)]" checked={chosen === c.token} onChange={() => setChosen(c.token)} />
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/12 text-info sm:flex"><MapPin className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-words font-medium">{c.place.businessName}</span>
                {i === 0 && <span className="inline-flex items-center gap-1 rounded-full bg-good/12 px-2 py-0.5 text-[11px] font-medium text-good"><Check className="h-3 w-3" />Closest match</span>}
              </span>
              <span className="block break-words text-xs text-fg-3 sm:text-sm">{c.place.address || [c.place.area, c.place.city].filter(Boolean).join(', ')}</span>
            </span>
            {c.place.rating !== null && (
              <span className="flex shrink-0 items-center gap-1 text-sm">
                <Star className="h-3.5 w-3.5 fill-warn text-warn" /> <span className="font-medium">{c.place.rating.toFixed(1)}</span>
                {c.place.ratingCount !== null && <span className="hidden text-fg-3 sm:inline">{c.place.ratingCount.toLocaleString('en-IN')} reviews</span>}
              </span>
            )}
          </label>
        ))}
      </fieldset>
      <ErrorText>{call.error}</ErrorText>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onSearch} className="min-h-11 text-left text-sm font-medium text-brand">None of these? Edit the search</button>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button busy={call.busy === 'pick'} disabled={!chosen || Boolean(call.busy)} onClick={() => call.run('pick', async () => onDone(await pickCandidate(lead.id, chosen)))}>Compare with this one</Button>
          <CallNote usage={usage}>No extra Google call</CallNote>
        </div>
      </div>
    </div>
  );
}

// ─── Not on Google ──────────────────────────────────────────────────────────

function NotFound({ lead, initialQuery, usage, marked, onResult, onMarked, searched }: { lead: Lead; initialQuery: string; usage?: PlacesUsage; marked: boolean; onResult: (r: CheckResult) => void; onMarked: () => void; searched: boolean }) {
  const [q, setQ] = useState(initialQuery);
  const call = useCall();
  const search = (e: FormEvent) => {
    e.preventDefault();
    void call.run('search', async () => onResult(await runCheck(lead.id, q.trim() || undefined)));
  };
  return (
    <section className="rounded-3xl border border-line bg-bg-2 px-4 py-8 text-center sm:px-8 sm:py-10">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-bad/12 text-bad"><MapPin className="h-6 w-6" /></span>
      <h2 className="mt-5 text-xl font-medium sm:text-2xl">{searched ? "Google couldn't find this business" : 'Search Google for this business'}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-fg-2">{searched ? 'Check the spelling, or add the area to the search and try again.' : 'Edit the search if the name or area needs changing.'}</p>
      <form onSubmit={search} className="mx-auto mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
        <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line-2 bg-bg px-4 focus-within:border-brand">
          <Search className="h-4 w-4 shrink-0 text-fg-3" />
          <input aria-label="Search Google" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-fg outline-none" />
        </label>
        <Button type="submit" busy={call.busy === 'search'} disabled={Boolean(call.busy) || !q.trim() || checksLeft(usage) <= 0}>Search again</Button>
      </form>
      <div className="mx-auto mt-2 max-w-xl text-left"><CallNote usage={usage} /></div>
      <ErrorText>{call.error}</ErrorText>
      {searched && (
        <div className="mx-auto mt-6 flex max-w-xl items-start gap-3 rounded-2xl border border-good/40 bg-good/[0.07] px-4 py-3 text-left">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-good" />
          <div><p className="text-sm font-medium">Not on Google Maps? That's a sales opportunity.</p><p className="text-xs text-fg-2">This business can't be found online. Getting them on Google is something Azumco can help with.</p></div>
        </div>
      )}
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {marked ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-fg-2"><Check className="h-4 w-4 text-good" /> Marked as not on Google</p>
        ) : (
          <Button variant="secondary" busy={call.busy === 'mark'} disabled={Boolean(call.busy)} onClick={() => call.run('mark', async () => { await markNotOnGoogle(lead.id); onMarked(); })}>Mark as not on Google</Button>
        )}
        <a href={BACK} onClick={(e) => { e.preventDefault(); navigate(BACK); }} className="min-h-11 px-3 py-2.5 text-sm font-medium text-brand">Back to leads</a>
      </div>
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LeadCheck({ id, user }: { id: string; user: TeamUser }) {
  const state = useApi<{ lead: Lead }>(`/leads/${id}`);
  const status = useApi<Allowance>(ALLOWANCE_PATH);
  const [result, setResult] = useState<CheckResult | undefined>(() => recallCheck(id));
  const [editing, setEditing] = useState(false);
  const call = useCall();
  const usage = status.data ?? undefined;
  const lead = state.data?.lead;

  const done = (r: CheckResult | undefined) => {
    if (!r) return;
    setResult(r);
    setEditing(false);
    void state.reload();
    void status.reload();
  };
  const checkAgain = () => call.run('check', async () => done(await runCheck(id)));
  const showGoogle = () => call.run('view', async () => done(await viewCheck(id)));
  const defaultQuery = lead ? [lead.businessName, lead.area, lead.city].filter(Boolean).join(', ') : '';
  const searchAgain = () => call.run('check', async () => done(await runCheck(id, defaultQuery)));
  const g = lead?.googleCheck;
  // The 7-day rule (everyone): an edited search after "pick"/"not found" is still allowed.
  const nextAt = g?.nextCheckAt && Date.parse(g.nextCheckAt) > Date.now() && !['pick', 'not_found', 'not_on_google'].includes(g.status) ? g.nextCheckAt : null;

  const body = (() => {
    if (!lead) return null;
    if (lead.origin !== 'team') {
      return <Banner tone="info" icon={<MapPin className="h-5 w-5" />} title="From Find clients">This lead came from Google already, so it isn't checked.</Banner>;
    }
    if (!canRunLeadCheck(user, lead)) {
      return <Banner tone="info" icon={<Info className="h-5 w-5" />} title="Only the person who added this lead, or a founder, can check it">You can check the leads you added yourself.</Banner>;
    }
    const query = result?.query ?? [lead.businessName, lead.area, lead.city].filter(Boolean).join(', ');
    if (editing || result?.status === 'not_found' || (!result && (lead.googleCheck.status === 'not_found' || lead.googleCheck.status === 'not_on_google'))) {
      return (
        <NotFound
          key={result?.query ?? 'q'}
          lead={lead}
          initialQuery={query}
          usage={usage}
          searched={!editing || Boolean(result && result.status === 'not_found')}
          marked={lead.googleCheck.status === 'not_on_google'}
          onResult={done}
          onMarked={() => void state.reload()}
        />
      );
    }
    if (result?.status === 'pick' && result.candidates?.length) {
      return <Pick lead={lead} result={result as CheckResult & { candidates: Offer[] }} usage={usage} onDone={done} onSearch={() => setEditing(true)} />;
    }
    if (result?.google && result.fields) {
      return <Compare key={`${result.google.token}:${lead.updatedAt}`} lead={lead} result={result as CheckResult & { google: Offer; fields: NonNullable<CheckResult['fields']> }} usage={usage} onSaved={done} />;
    }
    // Nothing fetched in this tab: the stored result, in the frames' layouts.
    const gc = lead.googleCheck;
    if ((gc.linked && gc.fields) || gc.status === 'pick') {
      return <StoredView lead={lead} usage={usage} busy={call.busy} onShow={showGoogle} onSearch={searchAgain} />;
    }
    return (
      <section className="rounded-3xl border border-line bg-bg-2 p-5 sm:p-6">
        <p className="text-lg font-medium">Not checked yet</p>
        <p className="mt-1 text-sm text-fg-2">Search Google by this lead's name, area and city and compare the details.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Button busy={call.busy === 'check'} disabled={Boolean(call.busy) || checksLeft(usage) <= 0 || Boolean(nextAt)} onClick={checkAgain}>Check with Google</Button>
          <CallNote usage={usage}>{nextAt ? `You can check this again from ${day(nextAt)}` : 'Uses 1 Google call'}</CallNote>
        </div>
      </section>
    );
  })();

  if (state.error) return <LoadError message={state.error.message} onRetry={state.reload} />;
  if (!lead) return <Loading label="Loading the lead…" />;

  return (
    <div className="mx-auto max-w-[1160px]">
      <a href={BACK} onClick={(e) => { e.preventDefault(); navigate(BACK); }} className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-2 hover:text-fg">
        <ChevronLeft className="h-4 w-4" /> Leads
      </a>
      <div className="mb-6 mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-medium tracking-[-0.035em] sm:text-[2.4rem]">{lead.businessName || lead.label}</h1>
          <p className="mt-1 text-sm text-fg-3">
            {[lead.category, lead.addedByName && `added by ${lead.addedByName}${lead.dateAdded ? ` on ${formatDate(lead.dateAdded).slice(0, 6)}` : ''}`].filter(Boolean).join(' · ') || 'Check against Google'}
          </p>
        </div>
        {canRunLeadCheck(user, lead) && (result || lead.googleCheck.status) && (
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <Button variant="secondary" busy={call.busy === 'check'} disabled={Boolean(call.busy) || checksLeft(usage) <= 0 || Boolean(nextAt)} onClick={checkAgain}>
              <RefreshCw className="h-4 w-4" /> Check again
            </Button>
            <CallNote usage={usage}>{nextAt ? `You can check this again from ${day(nextAt)}` : 'Uses 1 Google call'}</CallNote>
          </div>
        )}
      </div>
      {call.error && <div className="mb-4"><ErrorText>{call.error}</ErrorText></div>}
      {body}
    </div>
  );
}
