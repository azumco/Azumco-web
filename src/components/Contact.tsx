import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Copy, Loader2 } from 'lucide-react';
import { site } from '../content';
import { SERVICES } from '../services';
import { Container, Eyebrow, Reveal } from './ui';

/** "I'm interested in": one option per service, then Growth partner and Not sure yet. */
export const INTEREST_OPTIONS = [
  ...SERVICES.map((s) => ({ key: s.slug, label: s.formOption })),
  { key: 'growth-partner', label: 'Growth partner' },
  { key: 'not-sure', label: 'Not sure yet' },
];
const NOT_SURE = INTEREST_OPTIONS[INTEREST_OPTIONS.length - 1].label;

/** The option a link asked for (/?service=<slug>#contact), or "Not sure yet". */
export function interestFromUrl(search: string): string {
  const key = new URLSearchParams(search).get('service');
  return INTEREST_OPTIONS.find((o) => o.key === key)?.label ?? NOT_SURE;
}

const inputClass =
  'w-full border-b border-line-2 bg-transparent py-3.5 text-fg placeholder:text-fg-3 outline-none transition-colors focus:border-brand';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', business: '', country: '', callTime: '', service: NOT_SURE, message: '' });
  // The URL can pre-select the interest (/?service=<slug>#contact). Read after mount, so the
  // pre-rendered HTML and the first client render match.
  useEffect(() => {
    const service = interestFromUrl(window.location.search);
    if (service !== NOT_SURE) setForm((f) => ({ ...f, service }));
  }, []);
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const copyEmail = () => {
    navigator.clipboard?.writeText(site.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    if (honeypot.trim()) {
      setStatus('sent');
      return;
    }

    const name = form.name.trim();
    const email = form.email.trim();
    const business = form.business.trim();
    const message = form.message.trim();
    const country = form.country.trim();
    const callTime = form.callTime.trim();
    let timeZone = '';
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      /* not available */
    }

    if (!name || !email) return setError('Please enter your name and email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Please enter a valid email address.');
    if (name.length > 100 || email.length > 120 || business.length > 150 || country.length > 80 || callTime.length > 120 || message.length > 4000)
      return setError('One of the fields is too long.');

    const now = Date.now();
    let recent: number[] = [];
    try {
      recent = (JSON.parse(localStorage.getItem('azumco_form_timestamps') || '[]') as number[]).filter(
        (t) => now - t < 3600000,
      );
      if (recent.length && now - recent[recent.length - 1] < 60000)
        return setError('Please wait a minute before sending another message.');
      if (recent.length >= 3) return setError(`Too many messages this hour — email us at ${site.email}.`);
    } catch {
      /* storage unavailable — continue */
    }

    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: 'service_5d5440u',
          template_id: 'template_s2toicx',
          user_id: 'yvPfwS9AOeDRV_WLI',
          template_params: {
            client_name: name,
            client_email: email,
            business_name: business || 'Not specified',
            country: country || 'Not specified',
            call_time: callTime ? `${callTime} (${timeZone || 'time zone not detected'})` : 'Not specified',
            service_interest: form.service,
            project_overview: message || 'No brief provided',
            name,
            email,
            message: `[Service Interest: ${form.service}] [Business: ${business || 'Not specified'}] [Country: ${country || 'Not specified'}] [Best time for a call: ${callTime || 'Not specified'}${timeZone ? ` — visitor time zone ${timeZone}` : ''}] ${message || 'No brief provided'}`,
          },
        }),
      });
      if (!res.ok) throw new Error('send failed');
      try {
        localStorage.setItem('azumco_form_timestamps', JSON.stringify([...recent, now]));
      } catch {
        /* ignore */
      }
      setStatus('sent');
    } catch {
      setStatus('idle');
      setError(`Couldn’t send your message. Please email us at ${site.email}.`);
    }
  };

  return (
    <section id="contact" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <div className="overflow-hidden rounded-3xl border border-line bg-bg-2">
          <div className="grid lg:grid-cols-2">
            <div className="relative flex flex-col justify-between gap-12 overflow-hidden p-8 sm:p-12">
              <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
              <Reveal className="relative">
                <Eyebrow>Contact</Eyebrow>
                <h2 className="mt-6 text-5xl font-medium leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl">
                  Tell us what you’re <span className="font-serif font-normal italic tracking-normal text-brand">building.</span>
                </h2>
                <p className="mt-6 max-w-md text-lg leading-relaxed text-fg-2">
                  Share a few details and we’ll get back within one business day to set up a short call.
                </p>
              </Reveal>

              <div className="relative space-y-1">
                <button
                  type="button"
                  onClick={copyEmail}
                  className="group flex w-full items-center justify-between border-b border-line py-4 text-left"
                >
                  <span>
                    <span className="block text-xs uppercase tracking-[0.18em] text-fg-3">Email</span>
                    <span className="text-fg">{site.email}</span>
                  </span>
                  {copied ? <Check className="h-4 w-4 text-brand" /> : <Copy className="h-4 w-4 text-fg-3 group-hover:text-fg" />}
                </button>
                {[
                  ['WhatsApp', site.whatsapp, site.phone],
                  ['LinkedIn', site.linkedin, 'Azumco'],
                  ['Instagram', site.instagram, '@azumco'],
                ].map(([label, href, text]) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between border-b border-line py-4"
                  >
                    <span>
                      <span className="block text-xs uppercase tracking-[0.18em] text-fg-3">{label}</span>
                      <span className="text-fg">{text}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-fg-3 transition-colors group-hover:text-brand" />
                  </a>
                ))}
              </div>
            </div>

            <div className="border-t border-line p-8 sm:p-12 lg:border-l lg:border-t-0">
              {status === 'sent' ? (
                <div className="flex h-full flex-col items-start justify-center gap-4 py-16">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-bg">
                    <Check className="h-5 w-5" />
                  </span>
                  <h3 className="text-3xl font-medium tracking-[-0.02em] text-fg">Thanks — message received.</h3>
                  <p className="text-fg-2">We’ll reply within one business day.</p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-6" noValidate>
                  <div className="hidden" aria-hidden="true">
                    <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <label className="block">
                      <span className="sr-only">Name</span>
                      <input className={inputClass} placeholder="Your name *" value={form.name} onChange={update('name')} autoComplete="name" />
                    </label>
                    <label className="block">
                      <span className="sr-only">Email</span>
                      <input className={inputClass} type="email" placeholder="Email *" value={form.email} onChange={update('email')} autoComplete="email" />
                    </label>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <label className="block">
                      <span className="sr-only">Company or website</span>
                      <input className={inputClass} placeholder="Company or website" value={form.business} onChange={update('business')} autoComplete="organization" />
                    </label>
                    <label className="block">
                      <span className="sr-only">Country</span>
                      <input className={inputClass} placeholder="Country" value={form.country} onChange={update('country')} autoComplete="country-name" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-fg-3">Best time for a call, in your time zone</span>
                    <input className={inputClass} placeholder="e.g. weekdays after 3 pm" value={form.callTime} onChange={update('callTime')} />
                    <span className="mt-1.5 block text-xs text-fg-3">We&apos;ll reply with a time that works for both of us. Your time zone is added automatically.</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-fg-3">I’m interested in</span>
                    <select name="service" className={`${inputClass} cursor-pointer appearance-none`} value={form.service} onChange={update('service')}>
                      {INTEREST_OPTIONS.map((o) => (
                        <option key={o.key} value={o.label} className="bg-bg-2">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="sr-only">Project details</span>
                    <textarea
                      className={`${inputClass} min-h-32 resize-none`}
                      placeholder="Tell us a little about the project"
                      value={form.message}
                      onChange={update('message')}
                    />
                  </label>

                  {error && <p className="text-sm text-brand-2" role="alert">{error}</p>}

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-medium text-bg transition-colors hover:bg-brand-2 disabled:opacity-60 sm:w-auto"
                  >
                    {status === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {status === 'sending' ? 'Sending…' : 'Send message'}
                    {status !== 'sending' && <ArrowUpRight className="h-4 w-4" />}
                  </button>
                  <p className="text-xs leading-relaxed text-fg-3">
                    By sending this form you agree to our{' '}
                    <a href="/privacy" className="underline underline-offset-4 hover:text-fg">
                      Privacy Policy
                    </a>
                    .
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
