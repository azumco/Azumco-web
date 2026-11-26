// All site copy lives here so it can be edited without touching layout code.
import risoniqImg from './assets/images/risoniq_showcase_1795008583466.jpg';
import infranestImg from './assets/images/infranest_showcase_1795008583588.jpg';
import ebsMediaImg from './assets/images/ebs_media_showcase_1795008584164.jpg';

export const site = {
  name: 'Azumco',
  legalName: 'Azumco Pvt. Ltd.',
  email: 'contact.azumco@gmail.com',
  whatsapp: 'https://wa.me/919479475194',
  linkedin: 'https://www.linkedin.com/company/azumco-pvt-ltd/posts/?feedView=all',
  instagram: 'https://www.instagram.com/azumco/',
};

export const nav = [
  { label: 'Services', href: '/services' },
  { label: 'Work', href: '#work' },
  { label: 'Process', href: '#process' },
  { label: 'FAQ', href: '#faq' },
];

// PLACEHOLDER — replace with real client names/logos.
export const clients = [
  'Northwind',
  'Lumen & Co',
  'Vertex Labs',
  'Halcyon',
  'Kinetic',
  'Oakridge',
  'Parallel',
  'Sora Health',
];

// PLACEHOLDER — replace with real numbers.
export const stats = [
  { value: '40+', label: 'Projects shipped' },
  { value: '25+', label: 'Clients served' },
  { value: '4', label: 'Countries' },
  { value: '2–4 wks', label: 'Typical launch time' },
];

export const services = [
  {
    id: 'build',
    title: 'Build',
    summary: 'Custom websites, IT software, web apps and mobile products — fast, secure and built to convert.',
    items: [
      'Website design & development',
      'Custom web & IT applications',
      'Mobile apps (iOS & Android)',
      'Workflow automation & integrations',
    ],
  },
  {
    id: 'grow',
    title: 'Grow',
    summary: 'Put your brand where customers are already looking — and give them a reason to stay.',
    items: [
      'Local & technical SEO (Ujjain, MP & India)',
      'Google & Meta ad campaigns',
      'Brand identity & visual systems',
      'Video editing, reels & social content',
    ],
  },
  {
    id: 'manage',
    title: 'Manage',
    summary: 'Ongoing care so nothing breaks — with clear monthly reporting on what moved.',
    items: [
      'Maintenance & security updates',
      'Uptime monitoring & backups',
      'Monthly performance reports',
      'Continuous improvements',
    ],
  },
];

export type Project = {
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  url: string;
  image: string;
};

// The first project is shown as the large featured card.
export const projects: Project[] = [
  {
    name: 'Risoniq AI',
    tagline: 'Premium product presentation for conversational SaaS',
    description:
      'A high-end product site showing conversational SaaS flows — dark space aesthetics, vector grids and scroll-linked animation.',
    tags: ['Framer', 'UI/UX Design', 'Copywriting'],
    url: 'https://www.risoniq.ai/',
    image: risoniqImg,
  },
  {
    name: 'Infra Nest IT Solutions',
    tagline: 'High-performance software agency directory & 3D showcase',
    description:
      'A high-fidelity agency portfolio with a canvas-rendered 3D interactive hero. Leads are logged to Google Apps Script through a secured proxy API that keeps sheet targets hidden.',
    tags: ['React', 'Node.js', 'Three.js', 'Tailwind CSS v4', 'Drizzle ORM'],
    url: 'https://infranestit.com/',
    image: infranestImg,
  },
  {
    name: 'EBS Media',
    tagline: 'Performance marketing showcase for a Meta Business Partner',
    description:
      'A case-study catalogue for a performance marketing agency — custom layouts, statistics grids and interactive lead intake.',
    tags: ['Framer', 'UI/UX Design', 'Marketing Graphics'],
    url: 'https://ebs-media.framer.website/',
    image: ebsMediaImg,
  },
];

export const engagements = [
  {
    title: 'One-time project',
    body: 'A website, brand identity or app with a clear scope and timeline. We build it, launch it and hand it over.',
    points: ['Fixed scope', 'Clear timeline', 'Full handover'],
  },
  {
    title: 'Growth partner',
    body: 'We build, market and look after everything month to month — one team instead of three vendors.',
    points: ['Build + marketing + care', 'Monthly reporting', 'Regular strategy calls'],
    featured: true,
  },
  {
    title: 'Custom build',
    body: 'Larger platforms, internal tools and automation for teams that need something made to measure.',
    points: ['Discovery first', 'Phased delivery', 'Long-term support'],
  },
];

export const process = [
  { step: '01', title: 'Discover', body: 'A free call to understand your business, goals and what you actually need.' },
  { step: '02', title: 'Plan', body: 'A clear proposal: scope, timeline and how we’ll measure success.' },
  { step: '03', title: 'Build', body: 'Design and development in short cycles, with you reviewing as we go.' },
  { step: '04', title: 'Grow', body: 'Launch, then marketing, care and monthly reports on what moved.' },
];

export const faqs = [
  {
    q: 'Do you only do marketing, or can you build our website too?',
    a: 'Both. We can build your website or app from scratch and then handle the marketing that brings customers to it.',
  },
  {
    q: 'Do you work with clients in Ujjain, Indore and across Madhya Pradesh?',
    a: 'Yes. We are based in Ujjain, Madhya Pradesh and work closely with businesses across Indore, Bhopal, MP and India — for websites, IT systems, video editing and digital marketing.',
  },
  {
    q: 'How much will it cost?',
    a: 'Every project is different, so we don’t publish prices. Book a short call, tell us what you need and we’ll send a clear, fixed quote.',
  },
  {
    q: 'How long does a project take?',
    a: 'A focused website usually takes 2–4 weeks. Custom apps take longer — you’ll get a clear timeline before any work starts.',
  },
  {
    q: 'Can we hire you for just one service?',
    a: 'Yes. If you only need a logo, video editing, a landing page or help with ads, we’ll shape a plan around just that.',
  },
  {
    q: 'Who pays for hosting and domains?',
    a: 'Hosting and domain costs are billed to you directly by the providers, so you only pay what you use. Our fee covers the work.',
  },
];
