// Production spreadsheet hygiene. Uses the real spreadsheet from the
// environment. Never prints secrets.
//
//   npm run prod:data -- inspect   list tabs, row counts and any demo/fictitious rows
//   npm run prod:data -- clean     back up each affected tab (dated copy), then delete
//                                  ONLY the demo rows found by `inspect`
//   npm run prod:data -- zyvia     rename the "Zevia" project to "Zyvia" in every tab
//
// Demo detection is deliberately narrow: known demo names, the demo/test email
// domains, and the fictitious business names used by local demos and tests.

import { GoogleSheetsBackend, parseServiceAccount } from '../sheets/google.ts';
import { a1Tab, columnLetter, type Grid } from '../sheets/backend.ts';
import { TABS } from '../sheets/schema.ts';

const DEMO_PATTERNS: RegExp[] = [
  /\bDemo\b/i, // e.g. "<First name> Demo" rows from early local demos
  /@example\.(test|com)\b/i,
  /\bdemo[._]/i, // demo.owner@…, demo_place_…
  /\b(Test Owner|Owner Test|Staff Test|Staff One|Admin One|Founder Test)\b/,
  /\b(Iron Fit Gym|Caf[eé] Brewtopia|Iron Pulse Gym|FitZone Studio|Muscle Hub|Core Strength|Peak Fitness|Urban Gym|Flex Arena|Glow Salon|Sharma Dental|Spice Route|Dental Care Clinic|Zqx Fitness|Deal Co|Assigned Co|Other Co|Manual Co|PowerHouse Fitness|Iron Core Gym|Muscle Factory|Alpha Gym)\b/i,
  /ChIJ_fake_place_|demo_place_/,
];

const isDemoRow = (row: string[]) => row.some((cell) => DEMO_PATTERNS.some((p) => p.test(cell)));

async function main() {
  const mode = process.argv[2] ?? 'inspect';
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!id || !sa) {
    console.log('SKIPPED: GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 not set');
    return;
  }
  const backend = new GoogleSheetsBackend(id, parseServiceAccount(sa));
  const tabs = await backend.listTabs();
  const titles = tabs.map((t) => t.title);
  console.log(`Tabs (${titles.length}): ${titles.join(', ')}`);
  const grids = titles.length ? await backend.readTabs(titles) : [];

  const findings: { title: string; sheetId: number; rowNumbers: number[]; grid: Grid }[] = [];
  titles.forEach((title, i) => {
    const grid = grids[i];
    const rows = grid.length ? grid.length - 1 : 0;
    const demo: number[] = [];
    grid.forEach((row, r) => r > 0 && isDemoRow(row) && demo.push(r + 1));
    console.log(`  ${title}: ${rows} data row(s)${demo.length ? `, ${demo.length} DEMO row(s) at ${demo.join(', ')}` : ''}`);
    if (demo.length) {
      findings.push({ title, sheetId: tabs[i].sheetId, rowNumbers: demo, grid });
      // Show what matched, so a human can confirm. Only demo rows are printed.
      const header = grid[0] ?? [];
      for (const n of demo) {
        const row = grid[n - 1];
        const summary = header
          .map((h, j) => [h, row[j]])
          .filter(([h, v]) => v && !/hash|token|csrf/i.test(h))
          .filter(([h]) => ['id', 'email', 'name', 'businessName', 'clientName', 'item', 'label', 'placeId', 'paidBy', 'owner', 'task'].includes(h))
          .map(([h, v]) => `${h}=${v}`)
          .join(' | ');
        console.log(`      row ${n}: ${summary}`);
      }
    }
  });

  if (mode === 'inspect') {
    console.log(findings.length ? '\nRun "clean" to back up and remove these rows.' : '\nNo demo or fictitious rows found.');
    return;
  }

  if (mode === 'clean') {
    const stamp = new Date().toISOString().slice(0, 10);
    for (const f of findings) {
      const copy = `backup_${f.title}_${stamp}`;
      await backend.duplicateTab(f.sheetId, copy);
      console.log(`Backed up ${f.title} → ${copy}`);
      // Delete bottom-up so row numbers stay valid.
      for (const n of [...f.rowNumbers].sort((a, b) => b - a)) await backend.deleteRow(f.sheetId, n);
      console.log(`Removed ${f.rowNumbers.length} demo row(s) from ${f.title}`);
    }
    if (!findings.length) console.log('Nothing to clean.');
    return;
  }

  if (mode === 'zyvia') {
    const writes: { range: string; values: Grid }[] = [];
    titles.forEach((title, i) => {
      if (!(title in TABS)) return;
      grids[i].forEach((row, r) =>
        row.forEach((cell, c) => {
          if (r > 0 && /\bZevia\b/.test(cell)) writes.push({ range: `${a1Tab(title)}!${columnLetter(c + 1)}${r + 1}`, values: [[cell.replace(/\bZevia\b/g, 'Zyvia')]] });
        }),
      );
    });
    await backend.writeRanges(writes);
    console.log(`Renamed Zevia → Zyvia in ${writes.length} cell(s).`);
    return;
  }

  console.log(`Unknown mode "${mode}". Use inspect, clean or zyvia.`);
}

main().catch((err) => {
  console.error('prod:data failed:', (err as Error).message);
  process.exitCode = 1;
});
