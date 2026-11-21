// The hard monthly cap on paid Google Places calls.
//
// One cap covers every paid call (searches and lookups), counted per IST
// calendar month, persisted in the PlacesClaims tab so it survives restarts.
//
// Claiming a call:
//   1. Inside the serialized write queue, re-read settings and the ledger fresh
//      from Sheets. Refuse if paused or if this month's claimed count >= cap.
//   2. Append a 'claimed' row.
//   3. READ BACK the ledger. During a deploy overlap two server processes each
//      have their own queue, so both could pass step 1 at the boundary. The
//      sheet orders appends, so every process sees the same order: if this
//      claim is not within the first `cap` claimed rows of the month, it lost
//      the race, flips itself to 'released' and is refused.
// Releasing: a Google rejection that is not billed flips the row to 'released'.

import { istYearMonth } from '../../shared/time.ts';
import type { Db } from '../sheets/db.ts';
import { getSettings } from '../settings.ts';
import type { PlacesSku } from './client.ts';

export type ClaimResult = { ok: true; claimId: string } | { ok: false; reason: 'paused' | 'cap_reached' };

export async function claimPlacesCall(db: Db, sku: PlacesSku, actorId: string): Promise<ClaimResult> {
  return db.exclusive(async () => {
    const settings = await getSettings(db, { fresh: true });
    if (settings.placesPaused) return { ok: false, reason: 'paused' } as const;

    const yearMonth = istYearMonth(db.now());
    const [ledger] = await db.loadFresh(['PlacesClaims']);
    const used = ledger.rows.filter((r) => r.yearMonth === yearMonth && r.status === 'claimed').length;
    if (used >= settings.placesMonthlyCap) return { ok: false, reason: 'cap_reached' } as const;

    const mine = await db.insertUnqueued('PlacesClaims', { yearMonth, sku, status: 'claimed', actorId }, actorId);

    // Write-then-read-back: confirm this claim is within the cap in sheet order.
    const [after] = await db.loadFresh(['PlacesClaims']);
    const order = after.rows.filter((r) => r.yearMonth === yearMonth && r.status === 'claimed').map((r) => r.id);
    const rank = order.indexOf(mine.id);
    if (rank < 0 || rank >= settings.placesMonthlyCap) {
      await db.updateUnqueued('PlacesClaims', mine.id, { status: 'released' }, actorId);
      return { ok: false, reason: 'cap_reached' } as const;
    }
    return { ok: true, claimId: mine.id } as const;
  });
}

export async function releasePlacesCall(db: Db, claimId: string, actorId: string): Promise<void> {
  await db.update('PlacesClaims', claimId, { status: 'released' }, actorId);
}

export interface PlacesUsage {
  yearMonth: string;
  used: number;
  cap: number;
  remaining: number;
  searches: number;
  lookups: number;
  paused: boolean;
}

export async function placesUsage(db: Db): Promise<PlacesUsage> {
  const yearMonth = istYearMonth(db.now());
  const [settings, rows] = await Promise.all([getSettings(db), db.all('PlacesClaims')]);
  const month = rows.filter((r) => r.yearMonth === yearMonth && r.status === 'claimed');
  const searches = month.filter((r) => r.sku === 'text_search_enterprise').length;
  return {
    yearMonth,
    used: month.length,
    cap: settings.placesMonthlyCap,
    remaining: Math.max(0, settings.placesMonthlyCap - month.length),
    searches,
    lookups: month.length - searches,
    paused: settings.placesPaused,
  };
}
