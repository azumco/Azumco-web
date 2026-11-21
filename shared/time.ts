// IST date helpers and display formats, shared by the server and the team UI.
//
// India has no daylight saving, so IST is a fixed UTC+05:30 offset. Doing the
// arithmetic by hand keeps this deterministic on any host timezone (Render
// runs in UTC) and avoids pulling in a date library.

const IST_OFFSET_MS = 330 * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The wall-clock parts of an instant, as seen in IST. */
function istParts(at: Date) {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" for the IST calendar day containing `at`. */
export function istDate(at: Date = new Date()): string {
  const p = istParts(at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "YYYY-MM" for the IST calendar month containing `at` (budget periods). */
export function istYearMonth(at: Date = new Date()): string {
  return istDate(at).slice(0, 7);
}

/** "HH:mm" in IST. */
export function istTime(at: Date): string {
  const p = istParts(at);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** The UTC instant for an IST wall-clock date ("YYYY-MM-DD") and time ("HH:mm"). */
export function fromIst(date: string, time = '00:00'): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MS);
}

/** Whole days from IST day `from` to IST day `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** "DD MMM YYYY", e.g. "05 Dec 2026". Accepts "YYYY-MM-DD" or an ISO instant. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const day = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : istDate(new Date(value));
  const [y, m, d] = day.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "DD MMM YYYY, HH:mm IST". */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const at = new Date(value);
  return `${formatDate(at)}, ${istTime(at)} IST`;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** "₹1,23,456" — Indian digit grouping. */
export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `${amount < 0 ? '-' : ''}₹${inr.format(Math.abs(amount))}`;
}
