// The raw storage operations the data layer needs from a spreadsheet.
//
// Two implementations: GoogleSheetsBackend (production) and MemoryBackend
// (local development and tests). The Table/Db layer above only ever talks to
// this interface, so tests exercise the real caching, queueing and concurrency
// logic without a network.

export type Grid = string[][];

export interface TabInfo {
  title: string;
  sheetId: number;
}

export interface SheetsBackend {
  listTabs(): Promise<TabInfo[]>;
  addTabs(titles: string[]): Promise<void>;
  /** Whole-tab reads, one batched request. Cells come back as strings. */
  readTabs(titles: string[]): Promise<Grid[]>;
  /** Overwrite cell ranges ("Tab!A2:F2"), one batched request. Values are stored literally. */
  writeRanges(data: { range: string; values: Grid }[]): Promise<void>;
  /** Append rows after the last row of a tab. */
  appendRows(title: string, rows: Grid): Promise<void>;
  /** Delete one row; `rowNumber` is 1-based, as in the Sheets UI. */
  deleteRow(sheetId: number, rowNumber: number): Promise<void>;
  /** Delete whole tabs. Used only by the integration test to clean up its __test_ tabs. */
  deleteTabs(sheetIds: number[]): Promise<void>;
  /** Copy a tab under a new title (backups before data clean-up). */
  duplicateTab(sheetId: number, newTitle: string): Promise<void>;
}

/** Column number (1-based) to letters: 1 → A, 27 → AA. */
export function columnLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Quote a tab title for A1 notation. */
export const a1Tab = (title: string) => `'${title.replace(/'/g, "''")}'`;

// ─── In-memory backend ───────────────────────────────────────────────────────

export class MemoryBackend implements SheetsBackend {
  private tabs = new Map<string, { sheetId: number; grid: Grid }>();
  private nextId = 1;
  /** Counts calls, so tests can assert batching and caching behaviour. */
  readonly calls = { read: 0, write: 0 };

  async listTabs(): Promise<TabInfo[]> {
    return [...this.tabs].map(([title, t]) => ({ title, sheetId: t.sheetId }));
  }

  async addTabs(titles: string[]): Promise<void> {
    this.calls.write++;
    for (const t of titles) if (!this.tabs.has(t)) this.tabs.set(t, { sheetId: this.nextId++, grid: [] });
  }

  async readTabs(titles: string[]): Promise<Grid[]> {
    this.calls.read++;
    return titles.map((t) => structuredClone(this.require(t).grid));
  }

  async writeRanges(data: { range: string; values: Grid }[]): Promise<void> {
    this.calls.write++;
    for (const { range, values } of data) {
      const m = /^'(.+)'!([A-Z]+)(\d+)/.exec(range);
      if (!m) throw new Error(`Unsupported range ${range}`);
      const grid = this.require(m[1].replace(/''/g, "'")).grid;
      const col0 = lettersToIndex(m[2]);
      const row0 = Number(m[3]) - 1;
      values.forEach((vals, i) => {
        const row = (grid[row0 + i] ??= []);
        vals.forEach((v, j) => (row[col0 + j] = v));
      });
    }
  }

  async appendRows(title: string, rows: Grid): Promise<void> {
    this.calls.write++;
    this.require(title).grid.push(...structuredClone(rows));
  }

  async deleteRow(sheetId: number, rowNumber: number): Promise<void> {
    this.calls.write++;
    const tab = [...this.tabs.values()].find((t) => t.sheetId === sheetId);
    if (!tab) throw new Error(`No tab ${sheetId}`);
    tab.grid.splice(rowNumber - 1, 1);
  }

  async deleteTabs(sheetIds: number[]): Promise<void> {
    for (const [title, t] of this.tabs) if (sheetIds.includes(t.sheetId)) this.tabs.delete(title);
  }

  async duplicateTab(sheetId: number, newTitle: string): Promise<void> {
    const src = [...this.tabs.values()].find((t) => t.sheetId === sheetId);
    if (!src) throw new Error(`No tab ${sheetId}`);
    this.tabs.set(newTitle, { sheetId: this.nextId++, grid: structuredClone(src.grid) });
  }

  private require(title: string) {
    const t = this.tabs.get(title);
    if (!t) throw new Error(`Unable to parse range: ${title}`);
    return t;
  }
}

function lettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
