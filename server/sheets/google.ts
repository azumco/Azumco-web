// Google Sheets API v4 over plain fetch, authenticated as a service account.
//
// No Google client library: the service-account flow is one signed JWT
// exchanged for a one-hour access token (RFC 7523), which node:crypto does
// directly. That keeps the dependency list to what the app actually uses.
//
// Quotas (developers.google.com/workspace/sheets/api/limits, checked
// 2026-11-21): 300 read and 300 write requests per minute per project, 60 per
// minute per user. A service account is one "user", so 60/min is the real
// ceiling. Over-quota returns 429, which is retried with backoff below.

import { createSign } from 'node:crypto';
import { a1Tab, type Grid, type SheetsBackend, type TabInfo } from './backend.ts';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TIMEOUT_MS = 20_000;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(base64: string): ServiceAccount {
  let json: Partial<ServiceAccount>;
  try {
    json = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not base64-encoded JSON');
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is missing client_email or private_key');
  }
  return { client_email: json.client_email, private_key: json.private_key };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** Thrown for a non-OK Sheets response; carries the status for retry decisions. */
export class SheetsHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SheetsHttpError';
  }
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

const defaultRetry: RetryOptions = {
  retries: 5,
  baseDelayMs: 500,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Retry on 429, 5xx and network faults with exponential backoff plus jitter. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = defaultRetry): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof SheetsHttpError ? err.status : 0; // 0 = network/timeout
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt >= opts.retries) throw err;
      const delay = opts.baseDelayMs * 2 ** attempt + Math.random() * opts.baseDelayMs;
      await opts.sleep(delay);
    }
  }
}

export class GoogleSheetsBackend implements SheetsBackend {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly spreadsheetId: string,
    private readonly account: ServiceAccount,
    private readonly retry: RetryOptions = defaultRetry,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) return this.token.value;

    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(
      JSON.stringify({ iss: this.account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
    );
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.account.private_key);
    const assertion = `${header}.${claims}.${b64url(signature)}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new SheetsHttpError(res.status, `Service-account token exchange failed (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return withRetry(async () => {
      const res = await fetch(`${SHEETS}/${this.spreadsheetId}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // Google's error body describes the request, never our credentials, but
        // it is still trimmed: logs are not the place for full payloads.
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        throw new SheetsHttpError(res.status, `Sheets ${method} ${path.split('?')[0]} failed (${res.status}): ${detail}`);
      }
      return (await res.json()) as T;
    }, this.retry);
  }

  /** The spreadsheet's title, for confirmation prompts in local scripts. */
  async spreadsheetTitle(): Promise<string> {
    return (await this.call<{ properties: { title: string } }>('GET', '?fields=properties.title')).properties.title;
  }

  async listTabs(): Promise<TabInfo[]> {
    const data = await this.call<{ sheets: { properties: { title: string; sheetId: number } }[] }>(
      'GET',
      '?fields=sheets.properties(title,sheetId)',
    );
    return data.sheets.map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId }));
  }

  async addTabs(titles: string[]): Promise<void> {
    if (!titles.length) return;
    await this.call('POST', ':batchUpdate', {
      requests: titles.map((title) => ({ addSheet: { properties: { title } } })),
    });
  }

  async readTabs(titles: string[]): Promise<Grid[]> {
    const qs = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
    for (const t of titles) qs.append('ranges', a1Tab(t));
    const data = await this.call<{ valueRanges: { values?: unknown[][] }[] }>('GET', `/values:batchGet?${qs}`);
    return data.valueRanges.map((vr) => (vr.values ?? []).map((row) => row.map((c) => (c === null ? '' : String(c)))));
  }

  async writeRanges(data: { range: string; values: Grid }[]): Promise<void> {
    if (!data.length) return;
    // RAW: values are stored exactly as given. A lead named "=IMPORTXML(...)"
    // stays text instead of becoming a live formula in the spreadsheet.
    await this.call('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data });
  }

  async appendRows(title: string, rows: Grid): Promise<void> {
    if (!rows.length) return;
    const qs = new URLSearchParams({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
    await this.call('POST', `/values/${encodeURIComponent(`${a1Tab(title)}!A1`)}:append?${qs}`, { values: rows });
  }

  async deleteRow(sheetId: number, rowNumber: number): Promise<void> {
    await this.call('POST', ':batchUpdate', {
      requests: [
        { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } },
      ],
    });
  }

  async deleteTabs(sheetIds: number[]): Promise<void> {
    if (!sheetIds.length) return;
    await this.call('POST', ':batchUpdate', { requests: sheetIds.map((sheetId) => ({ deleteSheet: { sheetId } })) });
  }

  async duplicateTab(sheetId: number, newTitle: string): Promise<void> {
    await this.call('POST', ':batchUpdate', { requests: [{ duplicateSheet: { sourceSheetId: sheetId, newSheetName: newTitle } }] });
  }
}
