// Types for the detailed service pages. All copy lives in services.ts; the
// layout (components/services/*) only reads these shapes.

export type ServiceGroup = 'build' | 'grow' | 'manage';

/** Icon names used for a service (rendered by components/services/icons.tsx). */
export type ServiceIcon =
  | 'web' | 'phone' | 'software' | 'automation'
  | 'pin' | 'social' | 'ads' | 'brand' | 'video'
  | 'care';

/** Which hero illustration to draw (inline SVG in components/services/art.tsx). */
export type ServiceArt = ServiceIcon;

/** A heading whose last words are set in the italic serif accent: "Everything in" + "one place." */
export interface AccentHeading {
  text: string;
  accent: string;
}

export interface Service {
  /** URL part: /services/<slug>. */
  slug: string;
  group: ServiceGroup;
  icon: ServiceIcon;
  /** Short name for the footer and chips: "Websites". */
  short: string;
  /** Full name used on the hub cards and breadcrumb: "Websites & landing pages". */
  name: string;

  // Hero
  /** H1, split for the accent: { text: "Websites &", accent: "landing pages." }. */
  title: AccentHeading;
  intro: string;
  /** Secondary hero button label ("See how we work"). */
  secondaryCta: string;

  // Hub card
  hubSummary: string;
  hubPoints: string[];

  // What's included
  included: { eyebrow: string; heading: AccentHeading; sub: string; items: { title: string; body: string }[] };
  // Is this for you?
  who: { eyebrow: string; heading: AccentHeading; quotes: string[] };
  // How it works
  steps: { eyebrow: string; heading: AccentHeading; sub: string; items: { title: string; body: string }[] };
  // What you get / Tools we use
  get: { eyebrow: string; items: string[] };
  /** The right-hand panel: "Tools we use", "What we track", "You receive"…; `note` = the "Tools: …" line under the chips. */
  tools: { eyebrow: string; items: string[]; note?: string };
  /** A proof card under the chips (custom software: "We run Azumco on our own portal — …"). */
  proof?: string;
  /** Related work (project names from content.ts projects), when the page shows it. */
  work?: { eyebrow: string; heading: AccentHeading; sub: string; projects: { name: string; caption: string }[] };
  // Pricing card
  pricing: { eyebrow: string; heading: string; points: string[]; cta: string };
  // FAQ
  faqs: { eyebrow: string; items: { q: string; a: string }[] };
  /** "Often paired with": slugs of other services. */
  paired: { eyebrow: string; slugs: string[] };
  // Closing call to action
  cta: { eyebrow: string; heading: AccentHeading; body: string; primary: string; secondary: string };

  /** The contact form's "I'm interested in" option for this service. */
  formOption: string;
  seo: { title: string; description: string };
}
