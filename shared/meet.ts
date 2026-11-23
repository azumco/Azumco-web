// Google Meet links for booked calls: validation, and the share links built
// from a booking (WhatsApp message, Google Calendar template). No Google API:
// founders paste a reusable Meet link; these are plain URLs.

import { fromIst } from './time.ts';

export const MEETING_MODES = ['Google Meet', 'Zoho Cliq', 'Phone call', 'In person'] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];
export const DEFAULT_MEETING_MODE: MeetingMode = 'Google Meet';

/** https://meet.google.com/abc-defg-hij */
export const MEET_LINK_RE = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
/** Under a founder's saved link (profile). */
export const MEET_LINK_HELP = 'Create one at meet.google.com → New meeting → Create a meeting for later. You can reuse this link. It stays valid as long as it’s used at least once a year.';
/** Under the per-booking link field. */
export const MEET_BOOKING_HELP = 'Whoever created this link must join the call to let others in.';
export const MEET_LINK_ERROR = 'Use a Google Meet link like https://meet.google.com/abc-defg-hij';

/**
 * Trim and lowercase; accept it without "https://". Returns the clean link,
 * '' for empty input, or null when it is not a Meet link.
 */
export function normalizeMeetLink(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return '';
  const withScheme = v.startsWith('meet.google.com/') ? `https://${v}` : v;
  return MEET_LINK_RE.test(withScheme) ? withScheme : null;
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "16:30" → "4:30 PM". */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** An IST calendar date and time as text: "Tue 24 Nov, 4:30 PM IST". Independent of the machine's time zone. */
export function istWhen(date: string, start: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAY[wd]} ${d} ${MONTH[mo - 1]}, ${to12h(start)} IST`;
}

export interface MeetBooking {
  date: string; // IST date, YYYY-MM-DD
  start: string; // IST HH:MM
  end: string; // IST HH:MM
  clientName: string;
  founderName: string;
  link: string;
  leadLabel?: string;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** The message the team member sends the client on WhatsApp. */
export function whatsappText(b: MeetBooking): string {
  const hello = first(b.clientName) ? `Hi ${first(b.clientName)},` : 'Hi,';
  return `${hello} your call with ${first(b.founderName)} from Azumco is on ${istWhen(b.date, b.start)}. Join on Google Meet: ${b.link}`;
}

/** wa.me link to the client's number (E.164 → digits only), with the message URL-encoded. Empty phone → no recipient. */
export function whatsappLink(phoneE164: string, text: string): string {
  const digits = (phoneE164 ?? '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** 20261124T110000Z for an IST date + time. */
function gcalStamp(date: string, time: string): string {
  return fromIst(date, time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Google Calendar "add event" template link. */
export function googleCalendarLink(b: MeetBooking): string {
  const title = `Azumco discovery call${b.leadLabel ? ` · ${b.leadLabel}` : b.clientName ? ` · ${b.clientName}` : ''}`;
  const details = `Discovery call with ${first(b.founderName)} from Azumco.\nJoin on Google Meet: ${b.link}`;
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${gcalStamp(b.date, b.start)}/${gcalStamp(b.date, b.end || b.start)}`,
    details,
    location: b.link,
    ctz: 'Asia/Kolkata',
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
