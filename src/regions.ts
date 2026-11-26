// Copy for the international page, the India page and the market pages.
//
// RULES for anyone editing this file:
//  - No invented clients, logos, numbers, reviews, case studies, offices,
//    addresses, prices or certifications. Leave a field empty rather than guess.
//  - Azumco works remotely from India. Never imply an office in another country.
//
// hreflang: deliberately NOT used. Every page is in English and the market
// pages are not translations of each other. Add hreflang (with x-default) only
// when a translated version of a page exists, e.g. an Arabic version of /uae,
// and then on both versions, pointing at each other.

import type { AccentHeading } from './serviceTypes';
import { site } from './content';
import { LEGAL } from './legal';

export interface Faq { q: string; a: string }

// ─── Work with us from anywhere ─────────────────────────────────────────────

export const INTERNATIONAL = {
  path: '/international',
  seo: {
    title: 'Work with Azumco from anywhere — remote digital studio',
    description:
      'How Azumco works with clients outside India: discovery calls, written proposals, milestones and async updates, across time zones. Remote-first, from India.',
  },
  hero: {
    eyebrow: 'International clients',
    title: { text: 'Work with us from', accent: 'anywhere.' } as AccentHeading,
    intro:
      'Azumco is a remote-first digital studio based in India. We design, build and grow websites, apps and marketing for businesses wherever they are, and every step runs online.',
    primary: 'Book a call',
    secondary: 'See our services',
  },
  steps: {
    eyebrow: 'How remote projects run',
    heading: { text: 'Four steps,', accent: 'all online.' } as AccentHeading,
    sub: 'The same process whether you are next door or eight time zones away.',
    items: [
      { title: 'Discovery call', body: "A video call about your business, your goals and what you need. Tell us a time in your time zone and we'll confirm one that works for both of us." },
      { title: 'Proposal', body: 'A written proposal with the scope, timeline and milestones, and a fixed quote for one-time projects, before any work starts.' },
      { title: 'Milestones', body: 'The work is split into milestones. You review each one and give feedback before we move on to the next.' },
      { title: 'Async updates', body: "Written progress updates by email or WhatsApp, so you don't need to be online at the same time as us to know where things stand." },
    ],
  },
  timezones: {
    eyebrow: 'Time zones',
    heading: { text: 'Different time zones,', accent: 'no waiting around.' } as AccentHeading,
    points: [
      'We work in India Standard Time (IST, UTC+5:30).',
      'Calls are booked at a time you choose, in your own time zone.',
      'Updates are written, so you can read them in your morning, whatever our time is.',
    ],
  },
  channels: {
    eyebrow: 'How to reach us',
    items: [
      { label: 'Email', value: site.email, href: `mailto:${site.email}` },
      { label: 'WhatsApp', value: site.phone, href: site.whatsapp },
      { label: 'Video calls', value: 'A link is sent when we confirm a time', href: '' },
    ],
  },
  quotes: {
    eyebrow: 'Quotes and payments',
    heading: 'A clear quote before any work starts.',
    points: [
      'Start with a free call, then you get a written proposal.',
      'One-time projects get a fixed quote; ongoing services run on a simple monthly plan.',
      'Unless your proposal says otherwise: 50% in advance before work begins, and 50% on completion, before launch or handover.',
      'Larger projects can be split into milestones, each paid before the next one starts.',
      'Bank, payment-gateway and currency-conversion charges are paid by the client. Full details are in our Terms.',
    ],
    cta: 'Ask for a quote',
  },
  faqs: {
    eyebrow: 'Questions from clients abroad',
    items: [
      {
        q: 'Who owns the code, designs and accounts?',
        a: 'Once everything due is paid, ownership of the custom work we made for you transfers to you. Hosting and domains are billed to you directly by the providers. Design source files are included when your proposal says so. The details are in our Terms.',
      },
      {
        q: 'Is there a written agreement?',
        a: 'Yes. Every project starts with a written proposal that sets out the scope, timeline and cost, and our published Terms & Conditions apply to every project.',
      },
      {
        q: 'What happens after launch?',
        a: `For ${LEGAL.warrantyDays} days after launch or handover we fix, free of charge, any defects in what we built. After that, our Website care plan can look after it every month: updates, backups, monitoring and small changes.`,
      },
      {
        q: 'Do we need to be online at the same time?',
        a: "Rarely. Calls are booked at a time that suits you, and everything else runs on written updates you can read whenever it's convenient.",
      },
    ] as Faq[],
  },
  cta: {
    eyebrow: 'Next step',
    heading: { text: "Tell us about your", accent: 'project.' } as AccentHeading,
    body: "Send a few lines about what you need and the best time to call in your time zone. We'll reply with a time that works for both of us.",
    primary: 'Book a call',
    secondary: 'WhatsApp us',
  },
};

// ─── India ──────────────────────────────────────────────────────────────────

export const INDIA = {
  path: '/india',
  seo: {
    title: 'Websites, apps & marketing for businesses in India | Azumco',
    description:
      'Azumco is based in Ujjain, Madhya Pradesh and works with businesses in Ujjain, Indore, Bhopal and across India on websites, apps, SEO and marketing.',
  },
  hero: {
    eyebrow: 'India',
    title: { text: 'Built in India, for businesses across', accent: 'India.' } as AccentHeading,
    intro:
      'Azumco is based in Ujjain, Madhya Pradesh. We work with businesses in Ujjain, Indore, Bhopal and across India on websites, apps, Google visibility and marketing.',
    primary: 'Book a free call',
    secondary: 'See our services',
  },
  areas: {
    eyebrow: 'Where we work',
    heading: { text: 'Based in Ujjain,', accent: 'working across India.' } as AccentHeading,
    sub: 'Our base is in Ujjain. We work with businesses in these places, and anywhere else in India, remotely.',
    items: ['Ujjain', 'Indore', 'Bhopal', 'Across Madhya Pradesh', 'Across India'],
  },
  faqs: {
    eyebrow: 'Questions',
    items: [
      {
        q: 'Do you work with clients in Ujjain, Indore and across Madhya Pradesh?',
        a: 'Yes. We are based in Ujjain, Madhya Pradesh and work closely with businesses across Indore, Bhopal, MP and India — for websites, IT systems, video editing and digital marketing.',
      },
      {
        q: 'Do you have offices in Indore or Bhopal?',
        a: 'No. Our base is in Ujjain. We work with businesses in other cities remotely: calls, proposals and updates all happen online.',
      },
      {
        q: 'Can you help a local business show up on Google?',
        a: 'Yes. Our Google visibility service covers your Google Business Profile, local SEO and a reviews strategy, so people nearby find you on Search and Maps.',
      },
    ] as Faq[],
  },
  cta: {
    eyebrow: 'Next step',
    heading: { text: "Let's talk about your", accent: 'business.' } as AccentHeading,
    body: "Book a free call. We'll ask about your business and suggest where to start.",
    primary: 'Book a free call',
    secondary: 'WhatsApp us',
  },
};

// ─── Markets (one entry per country; the page template is pages/Market.tsx) ──

export interface MarketCaseStudy {
  /** A real project for a client in this market (name as the client agrees). */
  name: string;
  summary: string;
  url?: string;
}

export interface Market {
  slug: string;
  /** Public URL, e.g. "/uae". */
  path: string;
  /** Country or region name, e.g. "the UAE". */
  name: string;
  seo: { title: string; description: string };
  hero: { eyebrow: string; title: AccentHeading; intro: string };
  /** Who we serve there: specific, honest, not a list of city names. */
  serve: { heading: AccentHeading; intro: string; items: string[] };
  /** Real case studies or client references in this market. Required to publish. */
  caseStudies: MarketCaseStudy[];
  /** How we work across this market's time zone. */
  timezone: { heading: AccentHeading; points: string[] };
  faqs: Faq[];
}

/**
 * A market page is published (built, linked and in the sitemap) only when its
 * entry has enough genuinely unique content. Returns what is still missing;
 * an empty list means the page can be published.
 */
export function marketMissing(m: Market): string[] {
  const missing: string[] = [];
  if (m.caseStudies.length < 1) missing.push('At least one real case study or client reference in this market');
  if (m.serve.items.length < 3) missing.push('At least three specific kinds of business we serve there');
  if (m.faqs.length < 3) missing.push('At least three questions specific to this market');
  if (m.timezone.points.length < 2) missing.push('How we work across this time zone');
  if (m.hero.intro.length < 120) missing.push('A specific introduction (at least 120 characters)');
  return missing;
}

export const MARKETS: Market[] = [
  {
    slug: 'uae',
    path: '/uae',
    name: 'the UAE',
    seo: {
      title: 'Websites, apps & marketing for UAE businesses | Azumco',
      description:
        'Azumco designs, builds and markets websites and apps for businesses in Dubai, Abu Dhabi, Sharjah and across the UAE — remotely, from India, 1.5 hours ahead.',
    },
    hero: {
      eyebrow: 'United Arab Emirates',
      title: { text: 'Websites, apps and marketing for businesses in', accent: 'the UAE.' },
      intro:
        'We work with businesses in Dubai, Abu Dhabi, Sharjah and across the Emirates remotely, from India. India is only 1 hour 30 minutes ahead of the UAE, so our working days overlap.',
    },
    serve: {
      heading: { text: 'Who we work with in', accent: 'the UAE.' },
      intro: 'Businesses that want one team for their website, their marketing and the care that keeps it running.',
      items: [
        'Service businesses that need a website that turns visitors into enquiries',
        'Companies launching a product or a new brand in the Emirates',
        'Teams that want their marketing, social media and website handled by one studio',
      ],
    },
    // Required before publishing: at least one REAL project for a UAE client.
    caseStudies: [],
    timezone: {
      heading: { text: 'Working across', accent: 'time zones.' },
      points: [
        'The UAE is on Gulf Standard Time (UTC+4); we work in India Standard Time (UTC+5:30), 1 hour 30 minutes ahead.',
        'Calls are booked at a time you choose, in UAE time.',
        'Progress updates are written, so nothing waits for both of us to be online.',
      ],
    },
    faqs: [
      { q: 'Do you have an office in the UAE?', a: 'No. We work remotely from India. Calls, proposals, reviews and updates all happen online.' },
      { q: 'Which time zone do you work in?', a: 'India Standard Time (UTC+5:30), which is 1 hour 30 minutes ahead of the UAE, so our working days overlap.' },
      { q: 'How do we start?', a: 'Book a call at a time that suits you in UAE time. After the call you get a written proposal with the scope, timeline and cost.' },
    ],
  },
];

/** Markets that are ready to publish. */
export const PUBLISHED_MARKETS = MARKETS.filter((m) => marketMissing(m).length === 0);
