// Actions for a booked Google Meet call: copy the link, send it to the client
// on WhatsApp, add it to Google Calendar, and (founders) join. Shown only in
// the signed-in team area.

import { useState } from 'react';
import { CalendarPlus, Check, Copy, MessageCircle, Video } from 'lucide-react';
import { googleCalendarLink, whatsappLink, whatsappText, type MeetBooking } from '../../../shared/meet';
import { cx } from '../ui';

const btn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-2 px-4 text-sm text-fg hover:border-fg/40';

export default function MeetActions({ booking, phone, join }: { booking: MeetBooking; phone: string; join?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(booking.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy the Meet link', booking.link);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl bg-bg-3/70 px-4 py-3">
        <Video className="h-4 w-4 shrink-0 text-brand" />
        <a href={booking.link} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-sm text-fg hover:text-brand">{booking.link.replace('https://', '')}</a>
      </div>
      <div className="flex flex-wrap gap-2">
        {join && (
          <a href={booking.link} target="_blank" rel="noreferrer noopener" className={cx(btn, 'border-brand bg-brand font-medium text-bg hover:border-brand')}>
            <Video className="h-4 w-4" /> Join Google Meet
          </a>
        )}
        <button type="button" onClick={copy} className={btn}>
          {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
        </button>
        {phone ? (
          <a href={whatsappLink(phone, whatsappText(booking))} target="_blank" rel="noreferrer noopener" className={btn}>
            <MessageCircle className="h-4 w-4" /> Send to client on WhatsApp
          </a>
        ) : (
          <span className={cx(btn, 'cursor-not-allowed text-fg-3 opacity-60')} title="Add the client's phone to the booking to send it on WhatsApp.">
            <MessageCircle className="h-4 w-4" /> No client phone
          </span>
        )}
        <a href={googleCalendarLink(booking)} target="_blank" rel="noreferrer noopener" className={btn}>
          <CalendarPlus className="h-4 w-4" /> Add to Google Calendar
        </a>
      </div>
    </div>
  );
}
