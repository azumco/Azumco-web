// Team API client.
//
// - Same-origin cookies carry the session; the CSRF token from sign-in / me is
//   sent on every state-changing request.
// - Cold starts: Render free spins the service down when idle, so the first
//   request can take ~30–60 s or fail while it wakes. Network errors and
//   "starting" 503s are retried for up to ~90 s, and `onSlow` lets the UI show
//   a waking-up message instead of an error.

let csrfToken = '';
export const setCsrf = (token: string) => {
  csrfToken = token;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type SlowListener = (slow: boolean) => void;
const slowListeners = new Set<SlowListener>();
let pending = 0;
let slowTimer: ReturnType<typeof setTimeout> | undefined;

export function onSlow(fn: SlowListener) {
  slowListeners.add(fn);
  return () => void slowListeners.delete(fn);
}

function track(delta: 1 | -1) {
  pending += delta;
  if (pending > 0 && !slowTimer) {
    slowTimer = setTimeout(() => slowListeners.forEach((l) => l(true)), 2500);
  }
  if (pending === 0) {
    clearTimeout(slowTimer);
    slowTimer = undefined;
    slowListeners.forEach((l) => l(false));
  }
}

const WAKE_BUDGET_MS = 90_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const started = Date.now();
  track(1);
  try {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`/api${path}`, {
          method,
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'azumco',
            ...(method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        // Network error: usually the instance waking up. Only retry idempotent reads.
        if (method === 'GET' && Date.now() - started < WAKE_BUDGET_MS) {
          await sleep(Math.min(5000, 1000 * 2 ** attempt));
          continue;
        }
        throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      const wakingUp = res.status === 502 || res.status === 503 || res.status === 504;
      if (wakingUp && Date.now() - started < WAKE_BUDGET_MS && (method === 'GET' || data.code === 'STARTING')) {
        await sleep(Math.min(5000, 1000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong.', data.code);
      return data as T;
    }
  } finally {
    track(-1);
  }
}
