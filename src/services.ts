// Copy for the detailed service pages, taken from the Figma service frames
// (desktop) and the services hub cards. Shapes are defined in serviceTypes.ts.
import type { Service, ServiceGroup } from './serviceTypes';

// Section copy that repeats on every service page.
const INCLUDED_EYEBROW = "WHAT'S INCLUDED";
const INCLUDED_HEADING = { text: 'Everything in', accent: 'one place.' };
const INCLUDED_SUB = 'No surprise extras. This is what the service covers.';
const WHO_EYEBROW = 'IS THIS FOR YOU?';
const WHO_HEADING = { text: 'Sounds', accent: 'familiar?' };
const STEPS_EYEBROW = 'HOW IT WORKS';
const STEPS_HEADING = { text: 'Four clear', accent: 'steps.' };
const STEPS_SUB = "You always know what's happening and what comes next.";
const GET_EYEBROW = 'WHAT YOU GET';
const FAQ_EYEBROW = 'QUESTIONS';
const PAIRED_EYEBROW = 'OFTEN PAIRED WITH';
const CTA_EYEBROW = 'NEXT STEP';
const CTA_BODY =
  "Book a free 20-minute call. We'll ask about your business and give you an honest plan — even if that plan isn't us.";
const CTA_PRIMARY = 'Book a free call';
const CTA_SECONDARY = 'WhatsApp us';
const SECONDARY_CTA = 'See how we work';

// Pricing card on the one-time "build" pages.
const PRICING_PROJECT = {
  eyebrow: 'HOW PRICING WORKS',
  heading: 'A clear quote, before any work starts.',
  points: [
    'One-time projects get a fixed quote after a free call.',
    'Ongoing services run on a simple monthly plan.',
    'Combine services in a Growth partner plan.',
  ],
  cta: 'Get a quote',
};

// Pricing card on the "grow" and "manage" pages.
const PRICING_MONTHLY = {
  eyebrow: 'HOW PRICING WORKS',
  heading: 'A simple monthly plan.',
  points: [
    'Ongoing services run month to month.',
    "Scope agreed upfront — you know what's included.",
    'Combine services in a Growth partner plan.',
  ],
  cta: 'Get a quote',
};

export const SERVICES: Service[] = [
  // ───────────────────────────── BUILD ─────────────────────────────
  {
    slug: 'websites',
    group: 'build',
    icon: 'web',
    short: 'Websites',
    name: 'Websites & landing pages',
    title: { text: 'Websites &', accent: 'landing pages.' },
    intro:
      'Custom-designed websites that load fast, look right on every phone and turn visitors into calls, WhatsApp messages and enquiries.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'Fast, custom sites that turn visitors into enquiries.',
    hubPoints: ['Custom design, no templates', 'Built mobile-first', 'Contact forms & WhatsApp', 'Speed & SEO basics'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Custom design', body: 'Designed in Figma for your business — no recycled templates.' },
        { title: 'Mobile-first build', body: 'Most of your visitors are on phones, so we design for them first.' },
        { title: 'Built to convert', body: 'Clear calls to action, forms, WhatsApp and click-to-call.' },
        { title: 'Speed & SEO basics', body: 'Fast pages and a clean, Google-ready structure from day one.' },
        { title: 'Easy to update', body: 'Change text, photos and posts yourself — no developer needed.' },
        { title: 'Analytics', body: 'See where visitors come from and what they do.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        "You're launching a business and need a site that builds trust from day one.",
        'Your current site looks dated, breaks on phones or never brings enquiries.',
        "You're running ads and need a landing page built to convert.",
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Discover', body: 'A call about your goals, your customers and sites you like.' },
        { title: 'Design', body: 'Homepage and key pages designed in Figma. You review and comment.' },
        { title: 'Build', body: 'Development, content and testing on phones and browsers.' },
        { title: 'Launch', body: 'Go live on your domain, connect analytics and walk you through it.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: [
        'A live website on your domain',
        'Design files you can keep',
        'Edit access and a short how-to',
        'Analytics connected',
        'A support window after launch',
      ],
    },
    tools: { eyebrow: 'TOOLS WE USE', items: ['Figma', 'React', 'Framer', 'Tailwind CSS', 'Node.js'] },
    work: {
      eyebrow: 'RELATED WORK',
      heading: { text: 'Built by', accent: 'us.' },
      sub: 'Live projects we designed and built.',
      projects: [
        { name: 'Infra Nest IT Solutions', caption: 'Software agency directory & 3D showcase' },
        { name: 'EBS Media', caption: 'Performance marketing showcase' },
        { name: 'Risoniq AI', caption: 'Product presentation for a SaaS' },
      ],
    },
    pricing: PRICING_PROJECT,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'How long does a website take?',
          a: 'It depends on the number of pages and how ready your content is. You get a clear timeline in the proposal before we start.',
        },
        {
          q: 'Can I edit the website myself?',
          a: 'Yes. We set it up so you can change text, photos and posts without a developer.', // not in Figma (answer supplied)
        },
        {
          q: 'Do you write the content?',
          a: 'We can write it from scratch or polish what you have. Tell us on the call.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['google-visibility', 'website-care', 'paid-ads'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'project.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Website or landing page',
    seo: {
      title: 'Websites & landing pages for clients worldwide | Azumco',
      description:
        'Custom-designed websites that load fast, look right on every phone and turn visitors into calls and enquiries. By Azumco, a remote-first digital studio.',
    },
  },
  {
    slug: 'mobile-apps',
    group: 'build',
    icon: 'phone',
    short: 'Mobile apps',
    name: 'Mobile apps',
    title: { text: 'Mobile', accent: 'apps.' },
    intro:
      'Apps for iOS and Android that are simple to use, quick to load and built around what your customers need to do.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'iOS and Android apps your customers will actually keep.',
    hubPoints: ['App design & prototype', 'iOS + Android build', 'Logins & payments', 'App Store & Play Store launch'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'App design & prototype', body: 'A clickable prototype you can try before anything is built.' },
        { title: 'iOS + Android', body: 'One build that runs on both platforms.' },
        { title: 'Logins & profiles', body: 'Sign-up, login and user profiles done properly.' },
        { title: 'Payments & notifications', body: 'Take payments and send timely push notifications.' },
        { title: 'Admin panel', body: 'Manage users, orders and content from a simple dashboard.' },
        { title: 'Store launch', body: 'We handle App Store and Play Store submission.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        'You want customers to book, order or pay from their phone.',
        'Customers keep asking whether you have an app.',
        'Your staff need a simple app to use in the field.',
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Discover', body: 'What the app must do, for whom, and what success looks like.' },
        { title: 'Prototype', body: 'A clickable design you test on your own phone.' },
        { title: 'Build', body: 'Development in short cycles, with test builds you can install.' },
        { title: 'Launch', body: 'Store release, then updates as you grow.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: [
        'Published iOS and Android apps',
        'An admin panel',
        'Design files',
        'A handover walkthrough',
        'Update support options',
      ],
    },
    tools: { eyebrow: 'TOOLS WE USE', items: ['Figma', 'iOS', 'Android', 'Node.js', 'PostgreSQL'] },
    pricing: PRICING_PROJECT,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'Do I need separate apps for iPhone and Android?',
          a: 'No. We build once and release on both stores.',
        },
        {
          q: 'How do updates work after launch?',
          a: 'We release updates through the stores. Ongoing fixes and changes can run on a care plan.', // not in Figma (answer supplied)
        },
        {
          q: 'What does an app cost?',
          a: 'It depends on the features. After a free call we send a fixed quote.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['custom-software', 'branding', 'video'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'project.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Mobile app',
    seo: {
      title: 'Mobile apps for clients worldwide | Azumco',
      description:
        'Apps for iOS and Android that are simple to use, quick to load and built around what your customers need to do. By Azumco, a remote-first digital studio.',
    },
  },
  {
    slug: 'custom-software',
    group: 'build',
    icon: 'software',
    short: 'Custom software',
    name: 'Custom software & portals',
    title: { text: 'Custom software &', accent: 'portals.' },
    intro:
      'Dashboards, client portals and internal tools built around how your team actually works — not the other way round.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'Dashboards, portals and internal tools made for how you work.',
    hubPoints: ['User roles & logins', 'Dashboards & reports', 'Secure cloud hosting', 'Built to grow with you'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Planning', body: 'We map how your team works today before designing anything.' },
        { title: 'Roles & secure login', body: 'Everyone sees exactly what they should, and nothing more.' },
        { title: 'Dashboards & reports', body: 'The numbers you need, live, without building spreadsheets.' },
        { title: 'Integrations', body: 'Connect sheets, email, payments and the tools you already use.' },
        { title: 'Cloud hosting & backups', body: 'Hosted securely, with backups.' },
        { title: 'Training & handover', body: 'Your team knows how to use it from day one.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        'Your business runs on spreadsheets and WhatsApp threads.',
        'Off-the-shelf software almost fits — but not quite.',
        'You want a portal where clients can log in and see their work.',
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Map', body: 'We sit with your team and map the real workflow.' },
        { title: 'Plan', body: 'Screens, data and scope agreed before we build.' },
        { title: 'Build in phases', body: 'Working pieces you can review every few weeks.' },
        { title: 'Launch & support', body: 'Rollout, training and support as you grow.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: [
        'A working tool your team uses daily',
        'Admin access',
        'Simple documentation',
        'Hosting and backups set up',
        'Options for ongoing support',
      ],
    },
    tools: {
      eyebrow: 'TOOLS WE USE',
      items: ['React', 'Node.js', 'PostgreSQL', 'Google APIs'],
    },
    proof: 'We run Azumco on our own portal — leads, calls, bookings, goals and commissions — built with this same approach.',
    pricing: PRICING_PROJECT,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'Can this replace our spreadsheets?',
          a: 'Usually, yes — and we can import what you already have.',
        },
        {
          q: 'Can you add features later?',
          a: 'Yes. We build in phases, so adding to it later is normal.', // not in Figma (answer supplied)
        },
        {
          q: 'Who can access our data?',
          a: 'Only the people you give access to. Roles control who sees what.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['automation', 'mobile-apps', 'website-care'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'project.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Custom software',
    seo: {
      title: 'Custom software & portals for clients worldwide | Azumco',
      description:
        'Dashboards, client portals and internal tools built around how your team actually works — not the other way round. By Azumco, a remote-first digital studio.',
    },
  },
  {
    slug: 'automation',
    group: 'build',
    icon: 'automation',
    short: 'Automation',
    name: 'Automation & integrations',
    title: { text: 'Automation &', accent: 'integrations.' },
    intro:
      'Connect the tools you already use and let repetitive work run on its own — fewer mistakes and more hours back every week.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'Connect your tools and stop doing the same task twice.',
    hubPoints: ['Lead capture into sheets/CRM', 'Auto emails & reminders', 'Booking & payment flows', 'Automatic reports'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Lead capture', body: 'Website and ad leads go straight into your sheet or CRM.' },
        { title: 'Auto follow-ups', body: 'Emails and reminders sent at the right time, automatically.' },
        { title: 'Booking flows', body: 'Calendar bookings with confirmations and reminders.' },
        { title: 'Automatic reports', body: 'Weekly or monthly reports built without anyone typing them.' },
        { title: 'Tool connections', body: 'Google Workspace, forms, sheets, payments and more.' },
        { title: 'Instant alerts', body: 'Your team is notified the moment something needs attention.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        'Someone copies leads from one place to another every day.',
        'Follow-ups get missed when the team is busy.',
        'Reports take hours to put together by hand.',
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Find', body: 'We list the tasks your team repeats most.' },
        { title: 'Design', body: 'We draw the flow so you can see exactly what will happen.' },
        { title: 'Build & test', body: 'We build it and test it with real examples.' },
        { title: 'Run & improve', body: 'It runs on its own; we monitor and refine it.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: ['Working automations', 'A simple diagram of each flow', 'Notes on how it works', 'Monitoring set up'],
    },
    tools: { eyebrow: 'TOOLS WE USE', items: ['Google Workspace', 'Google Sheets', 'Webhooks', 'Node.js'] },
    pricing: PRICING_PROJECT,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'Do we need to buy new software?',
          a: 'Usually not — we connect the tools you already use.',
        },
        {
          q: 'What if something breaks?',
          a: 'Flows are monitored, and fixes can be covered by a care plan.', // not in Figma (answer supplied)
        },
        {
          q: 'Is it safe?',
          a: 'We only give each tool the access it needs.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['custom-software', 'paid-ads', 'website-care'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'project.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Automation & integrations',
    seo: {
      title: 'Automation & integrations for clients worldwide | Azumco',
      description:
        'Connect the tools you already use and let repetitive work run on its own — fewer mistakes and more hours back. By Azumco, a remote-first digital studio.',
    },
  },

  // ───────────────────────────── GROW ─────────────────────────────
  {
    slug: 'google-visibility',
    group: 'grow',
    icon: 'pin',
    short: 'Google visibility',
    name: 'Google visibility',
    // The page H1 (and breadcrumb) reads "Get found on Google." rather than the hub name.
    title: { text: 'Get found on', accent: 'Google.' },
    intro:
      'Show up when people nearby search for what you do — on Google Search and Google Maps — and turn those searches into calls and visits.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'Get found on Google Search and Maps by people nearby.',
    hubPoints: ['Google Business Profile', 'Local SEO', 'Website SEO', 'Reviews strategy'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Google Business Profile', body: 'Set up or claimed, with the right categories, photos and posts.' },
        { title: 'Local SEO', body: 'Consistent business details across the web.' },
        { title: 'Website SEO', body: 'Speed, structure, keywords and page titles fixed.' },
        { title: 'Reviews strategy', body: 'A simple way to ask happy customers for reviews.' },
        { title: 'Helpful content', body: 'Pages and posts that answer what customers search.' },
        { title: 'Monthly report', body: 'Calls, direction requests, visits and rankings in plain words.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        'Competitors show up above you on Google Maps.',
        'You rely on word of mouth and want more steady enquiries.',
        "You're opening a new location and need to be found.",
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Audit', body: 'We check your profile, website and competitors.' },
        { title: 'Fix', body: "We fix what's holding you back." },
        { title: 'Grow', body: 'Posts, content and reviews, month after month.' },
        { title: 'Report', body: "A monthly report on what moved and what's next." },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: ['An optimised Google Business Profile', 'SEO fixes on your website', 'A reviews system', 'A monthly report'],
    },
    tools: {
      note: 'Tools: Google Business Profile · Search Console · Google Analytics',
      eyebrow: 'WHAT WE TRACK',
      items: ['Profile views', 'Calls', 'Direction requests', 'Website visits', 'Search rankings'],
    },
    pricing: PRICING_MONTHLY,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'How long until we see results?',
          a: 'SEO builds over months, not days. Profile improvements often show sooner than website rankings.',
        },
        {
          q: 'Can you guarantee the #1 spot?',
          a: 'No honest agency can. We focus on what moves rankings and report progress every month.', // not in Figma (answer supplied)
        },
        {
          q: 'Do we need a new website for this?',
          a: "Not always. We start with what you have and tell you if it's holding you back.", // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['websites', 'social-media', 'paid-ads'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'growth.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Google visibility (SEO)',
    seo: {
      title: 'Google visibility for clients worldwide | Azumco',
      description:
        'Show up when people nearby search for what you do on Google Search and Google Maps, and turn searches into calls. By Azumco, a remote-first digital studio.',
    },
  },
  {
    slug: 'social-media',
    group: 'grow',
    icon: 'social',
    short: 'Social media',
    name: 'Social media management',
    title: { text: 'Social media', accent: 'management.' },
    intro:
      'Consistent, on-brand posts and reels every month — planned, designed, written and published for you, so your profile works while you run the business.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'Consistent, on-brand posts and reels every month.',
    hubPoints: ['Monthly content calendar', 'Posts, reels & stories', 'Captions & hashtags', 'Monthly insights'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Content calendar', body: 'A monthly plan built around your goals and offers.' },
        { title: 'Posts & carousels', body: 'Designed in your brand style, never off-the-shelf.' },
        { title: 'Reels & stories', body: 'Short-form video edited for reach.' },
        { title: 'Captions & hashtags', body: 'Words that sound like you and help people find you.' },
        { title: 'Community replies', body: 'Replies to comments and messages, if you want us to.' },
        { title: 'Monthly insights', body: "What worked, what didn't and next month's plan." },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        "You post when you find time — which isn't often.",
        'Your feed looks different every week.',
        'You know reels work but have no time to make them.',
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Plan', body: 'A monthly calendar you approve before anything is made.' },
        { title: 'Create', body: 'Posts, reels and captions designed in your style.' },
        { title: 'Publish', body: 'Scheduled at the times your audience is active.' },
        { title: 'Review', body: "Monthly insights and the next month's plan." },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: [
        'A monthly content calendar',
        'Ready-to-post designs and reels',
        'Scheduled publishing',
        'A monthly insights report',
      ],
    },
    tools: {
      note: 'Tools: Instagram · Facebook · LinkedIn · Meta Business Suite · Figma',
      eyebrow: 'WHAT WE TRACK',
      items: ['Reach', 'Followers', 'Saves & shares', 'Profile visits', 'Enquiries'],
    },
    pricing: PRICING_MONTHLY,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'Which platforms do you manage?',
          a: 'Mostly Instagram, Facebook and LinkedIn — we pick based on where your customers are.',
        },
        {
          q: 'Do we need to shoot content?',
          a: 'Sometimes. We can guide simple phone shoots, or work with the photos and videos you already have.', // not in Figma (answer supplied)
        },
        {
          q: 'Can we approve posts first?',
          a: 'Yes. Nothing goes live without your approval.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['video', 'branding', 'paid-ads'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'growth.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Social media management',
    seo: {
      title: 'Social media management for clients worldwide | Azumco',
      description:
        'Consistent, on-brand posts and reels every month — planned, designed, written and published while you run the business. By Azumco, a remote-first studio.',
    },
  },
  {
    slug: 'paid-ads',
    group: 'grow',
    icon: 'ads',
    short: 'Paid ads',
    name: 'Paid ads — Meta & Google',
    title: { text: 'Paid ads —', accent: 'Meta & Google.' },
    intro:
      'Ads on Instagram, Facebook and Google that reach the right people, bring in real leads and show you exactly what your money did.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'Ads that reach the right people and turn into leads.',
    hubPoints: ['Campaign strategy', 'Ad creatives & copy', 'Pixel & conversion tracking', 'Weekly optimisation'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Campaign strategy', body: 'Goals, audiences and a budget plan before anything goes live.' },
        { title: 'Ad creatives & copy', body: 'Images, videos and words that stop the scroll.' },
        { title: 'Tracking setup', body: 'Meta Pixel, conversions and Google tags set up properly.' },
        { title: 'Landing pages', body: 'A page built to turn ad clicks into enquiries.' },
        { title: 'Weekly optimisation', body: "We cut what's not working and scale what is." },
        { title: 'Clear reporting', body: 'Spend, leads and cost per lead — in plain words.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        "You've boosted posts before and nothing happened.",
        'You need leads quickly for a launch or season.',
        "You spend on ads but don't know what's working.",
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Plan', body: 'Goal, audience, offer and budget agreed on a call.' },
        { title: 'Set up', body: 'Accounts, tracking, creatives and landing page ready.' },
        { title: 'Launch & test', body: 'Several ads and audiences tested side by side.' },
        { title: 'Optimise & report', body: 'Weekly tweaks and a monthly report.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: [
        'A full campaign setup',
        'Ad creatives and copy',
        'Tracking that actually works',
        'Weekly updates and a monthly report',
      ],
    },
    tools: {
      note: 'Tools: Meta Ads Manager · Google Ads · Meta Pixel · Google Analytics',
      eyebrow: 'WHAT WE TRACK',
      items: ['Leads', 'Cost per lead', 'Click-through rate', 'Return on ad spend', 'Bookings & sales'],
    },
    pricing: PRICING_MONTHLY,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'Is the ad budget included in your fee?',
          a: 'No. Ad spend is paid directly to Meta or Google. Our fee covers strategy, creatives and management.',
        },
        {
          q: 'What budget should we start with?',
          a: 'It depends on your goal and market. We suggest a realistic starting budget on the call.', // not in Figma (answer supplied)
        },
        {
          q: 'How soon will we see results?',
          a: 'Ads can bring leads within days. The first weeks are for testing what works best.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['websites', 'video', 'google-visibility'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'growth.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Paid ads',
    seo: {
      title: 'Paid ads — Meta & Google for clients worldwide | Azumco',
      description:
        'Ads on Instagram, Facebook and Google that reach the right people, bring in real leads and show what your money did. By Azumco, a remote-first digital studio.',
    },
  },
  {
    slug: 'branding',
    group: 'grow',
    icon: 'brand',
    short: 'Branding',
    name: 'Branding & design',
    title: { text: 'Branding &', accent: 'design.' },
    intro:
      'A logo and look people remember — plus a simple system so your brand looks the same on your website, social media and print.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'A look people remember, used the same way everywhere.',
    hubPoints: ['Logo & identity', 'Brand guidelines', 'Social & print templates', 'Profile banners'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Logo design', body: 'Several directions, refined into one strong final logo.' },
        { title: 'Brand identity', body: 'Colours, fonts and a graphic style that fit you.' },
        { title: 'Brand guidelines', body: 'Simple rules so anyone can use your brand correctly.' },
        { title: 'Social templates', body: 'Post and story templates in your style.' },
        { title: 'Print & stationery', body: 'Business cards, flyers and letterheads.' },
        { title: 'Profile banners', body: 'LinkedIn, Upwork, YouTube and social covers.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        'Your logo was made in a hurry and it shows.',
        'Your brand looks different everywhere it appears.',
        "You're launching something new or rebranding.",
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Discover', body: 'Your business, audience and the feel you want.' },
        { title: 'Concepts', body: 'Several logo directions to react to.' },
        { title: 'Refine', body: "We develop the one you choose until it's right." },
        { title: 'Deliver', body: 'Final files, colours, fonts and guidelines.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: ['Logo files in every format', 'A colour and font guide', 'Social and print templates', 'Profile banners'],
    },
    tools: {
      note: 'Tools: Figma · Vector files (SVG · PDF · PNG)',
      eyebrow: 'YOU RECEIVE',
      items: ['Primary logo', 'Icon / app logo', 'Light & dark versions', 'Colour palette', 'Type pairing'],
    },
    // Figma shows the monthly card here; corrected to the quote card (design mistake).
    pricing: PRICING_PROJECT,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'How many logo options do we get?',
          a: 'We start with several directions and refine the one you like best.',
        },
        {
          q: 'Can you redesign our existing logo?',
          a: "Yes — we can refresh it or start fresh. We'll recommend which makes sense.", // not in Figma (answer supplied)
        },
        {
          q: 'Will the files work for print and web?',
          a: 'Yes. You get files for screens, print and everything in between.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['social-media', 'websites', 'video'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'growth.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Branding & design',
    seo: {
      title: 'Branding & design for clients worldwide | Azumco',
      description:
        'A logo and look people remember, plus a simple system so your brand looks the same on web, social and print. By Azumco, a remote-first digital studio.',
    },
  },
  {
    slug: 'video',
    group: 'grow',
    icon: 'video',
    short: 'Video & motion',
    name: 'Video & motion',
    title: { text: 'Video &', accent: 'motion.' },
    intro: 'Reels, logo animations and ad videos that stop the scroll and explain what you do in seconds.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'Reels, logo animations and ad videos that stop the scroll.',
    hubPoints: ['Reels & short-form edits', 'Logo animation', 'Product & explainer videos', 'Motion ad creatives'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Reels & shorts', body: 'Short-form edits made for Instagram and YouTube.' },
        { title: 'Logo animation', body: 'A short animated intro for reels, videos and your site.' },
        { title: 'Product & explainer videos', body: 'Show what you do and why it matters, quickly.' },
        { title: 'Motion ad creatives', body: 'Moving ads that perform better than still images.' },
        { title: 'Captions & subtitles', body: 'Because most people watch with the sound off.' },
        { title: 'Every format', body: '9:16, 1:1 and 16:9 versions from one edit.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        'You have footage but no time to edit it.',
        'Your ads need video to perform.',
        'You want a polished logo intro for your content.',
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Brief', body: 'What the video is for and where it will run.' },
        { title: 'Script & storyboard', body: 'The plan, frame by frame, before editing.' },
        { title: 'Edit & animate', body: 'Cutting, motion, captions and sound.' },
        { title: 'Deliver', body: 'Final videos in every format you need.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: ['Final videos in every format', 'Captions burned in or as files', 'An agreed number of revisions'],
    },
    tools: {
      note: 'Tools: Figma · Motion graphics · Video editing',
      eyebrow: 'FORMATS WE DELIVER',
      items: ['9:16 Reels', '1:1 Feed', '16:9 YouTube', 'Logo intro', 'Ad cut-downs'],
    },
    // Figma shows the monthly card here; corrected to the quote card (design mistake).
    pricing: PRICING_PROJECT,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: 'Do you shoot the video too?',
          a: 'Tell us on the call — we can work with your footage, stock footage or plan a simple shoot.',
        },
        {
          q: 'How many revisions do we get?',
          a: 'Agreed upfront in the quote, so there are no surprises.', // not in Figma (answer supplied)
        },
        {
          q: 'Can you animate our logo?',
          a: 'Yes — intros for reels, YouTube and your website.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['social-media', 'paid-ads', 'branding'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'growth.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Video & motion',
    seo: {
      title: 'Video & motion for clients worldwide | Azumco',
      description:
        'Reels, logo animations and ad videos that stop the scroll and explain what you do in seconds. Video and motion by Azumco, a remote-first digital studio.',
    },
  },

  // ──────────────────────────── MANAGE ────────────────────────────
  {
    slug: 'website-care',
    group: 'manage',
    icon: 'care',
    short: 'Website care',
    name: 'Website care & maintenance',
    title: { text: 'Website care &', accent: 'maintenance.' },
    intro:
      'We look after your website every month — updates, backups, monitoring and small changes — so it stays fast, safe and up to date.',
    secondaryCta: SECONDARY_CTA,
    hubSummary: 'We look after your site so you never have to think about it.',
    hubPoints: ['Hosting & domain help', 'Updates & backups', 'Uptime monitoring', 'Monthly changes & report'],
    included: {
      eyebrow: INCLUDED_EYEBROW,
      heading: INCLUDED_HEADING,
      sub: INCLUDED_SUB,
      items: [
        { title: 'Hosting & domain help', body: 'Set up, renewed and managed — no surprises.' },
        { title: 'Updates & backups', body: 'Kept up to date, with regular backups.' },
        { title: 'Uptime monitoring', body: "We're alerted if your site goes down." },
        { title: 'Security checks', body: 'Regular checks to keep your site safe.' },
        { title: 'Monthly changes', body: 'Small edits to text, images and offers each month.' },
        { title: 'Monthly report', body: 'Uptime, speed and what we changed — in plain words.' },
      ],
    },
    who: {
      eyebrow: WHO_EYEBROW,
      heading: WHO_HEADING,
      quotes: [
        'Your website was built and then forgotten.',
        "There's no one to call when something breaks.",
        'Small changes take weeks to get done.',
      ],
    },
    steps: {
      eyebrow: STEPS_EYEBROW,
      heading: STEPS_HEADING,
      sub: STEPS_SUB,
      items: [
        { title: 'Onboard', body: 'Access, a full check and a list of quick fixes.' },
        { title: 'Protect', body: 'Backups and monitoring switched on.' },
        { title: 'Maintain', body: 'Updates and your monthly changes.' },
        { title: 'Report', body: 'A short monthly report.' },
      ],
    },
    get: {
      eyebrow: GET_EYEBROW,
      items: ['Monitoring and alerts', 'Regular backups', 'Monthly changes', 'A monthly report'],
    },
    tools: {
      note: 'Tools: Uptime monitoring · Backups · Google Analytics',
      eyebrow: 'WHAT WE TRACK',
      items: ['Uptime', 'Page speed', 'Updates done', 'Backups taken', 'Changes made'],
    },
    pricing: PRICING_MONTHLY,
    faqs: {
      eyebrow: FAQ_EYEBROW,
      items: [
        {
          q: "Can you look after a site you didn't build?",
          a: 'Usually, yes. We review it first and tell you honestly what it needs.',
        },
        {
          q: 'What counts as a small change?',
          a: 'Text, images, offers and similar edits. Bigger work is quoted separately.', // not in Figma (answer supplied)
        },
        {
          q: 'Is hosting included?',
          a: 'We help set it up and manage it. Hosting costs depend on your site.', // not in Figma (answer supplied)
        },
      ],
    },
    paired: { eyebrow: PAIRED_EYEBROW, slugs: ['websites', 'google-visibility', 'automation'] },
    cta: {
      eyebrow: CTA_EYEBROW,
      heading: { text: "Let's talk about your", accent: 'growth.' },
      body: CTA_BODY,
      primary: CTA_PRIMARY,
      secondary: CTA_SECONDARY,
    },
    formOption: 'Website care & maintenance',
    seo: {
      title: 'Website care & maintenance for clients worldwide | Azumco',
      description:
        'We look after your website every month — updates, backups, monitoring and small changes — so it stays fast and safe. By Azumco, a remote-first digital studio.',
    },
  },
];

// ─── Group labels and the services hub (/services) ─────────────────────────

export const GROUP_LABEL: Record<ServiceGroup, string> = { build: 'Build', grow: 'Grow', manage: 'Manage' };

export const HUB = {
  seo: {
    title: 'Services — websites, apps, marketing & care | Azumco',
    description:
      'Websites, mobile apps, custom software, automation, Google visibility, social media, ads, branding, video and website care, from Azumco, a remote-first studio.',
  },
  hero: {
    kicker: 'Services — Build · Grow · Manage',
    title: { text: 'Everything your business needs', accent: 'online.' },
    intro:
      '10 services across three disciplines — websites, apps, marketing and the care that keeps it all running. Hire us for one, or let one team run the lot.',
    primary: 'Book a free call',
    secondary: 'See our work',
  },
  groups: {
    build: { number: '01', label: 'Build', tagline: 'Make it.', eyebrow: '01 · BUILD', sub: 'Websites, apps and software built to work — and to bring in business.' },
    grow: { number: '02', label: 'Grow', tagline: 'Get seen.', eyebrow: '02 · GROW', sub: 'Marketing that brings the right people to your door — and proves it.' },
    manage: { number: '03', label: 'Manage', tagline: 'Keep it running.', eyebrow: '03 · MANAGE', sub: 'The care that keeps everything fast, safe and up to date.' },
  } satisfies Record<ServiceGroup, { number: string; label: string; tagline: string; eyebrow: string; sub: string }>,
  learnMore: 'Learn more',
  partner: {
    badge: 'MOST CHOSEN',
    title: 'Growth partner — all three, one monthly plan',
    body: 'We build, market and look after everything month to month: one team instead of three vendors, with a monthly report and strategy call.',
    cta: 'Discuss on a call',
  },
  problems: {
    eyebrow: 'NOT SURE?',
    heading: { text: 'Start with the', accent: 'problem.' },
    sub: "Tell us what's not working. Here's where we'd usually start.",
    rows: [
      { quote: '“Nobody finds us on Google”', slug: 'google-visibility' },
      { quote: "“People visit the website but don't contact us”", slug: 'websites' },
      { quote: '“We post on Instagram but nothing happens”', slug: 'social-media' },
      { quote: '“We need more leads, fast”', slug: 'paid-ads' },
      { quote: '“Our team does the same manual work every day”', slug: 'automation' },
      { quote: '“Our brand looks different everywhere”', slug: 'branding' },
      { quote: '“Our site is slow, broken or out of date”', slug: 'website-care' },
    ] as { quote: string; slug: string }[],
  },
  cta: {
    eyebrow: 'START HERE',
    heading: { text: 'Not sure where to', accent: 'start?' },
    body: "Book a free 20-minute call. We'll look at your business and tell you honestly what will make the biggest difference first.",
    primary: 'Book a free call',
    secondary: 'WhatsApp us',
  },
};
