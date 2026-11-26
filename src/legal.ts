// Legal content for /terms, /privacy and /refund-policy.
// Have these reviewed by a lawyer before relying on them. Update LEGAL constants below.

import { site } from './content';
import { legalLinks, type LegalKey } from './legalLinks';

export const LEGAL = {
  effectiveDate: '14 November 2026',
  jurisdiction: 'Indore, Madhya Pradesh',
  warrantyDays: 30,
  invoiceDueDays: 7,
  quoteValidityDays: 15,
  holdAfterDays: 30,
  closeAfterDays: 60,
  refundProcessingDays: 15,
  retainerNoticeDays: 30,
  lateInterest: '1.5% per month',
};

export type Block = string | { list: string[] } | { h: string };
export type Section = { id: string; title: string; body: Block[] };

const company = site.legalName;

/* ---------- Shared sections (used by Terms and the Refund Policy) ---------- */

const payments: Section = {
  id: 'payments',
  title: 'Payment terms',
  body: [
    'Unless your proposal says otherwise, payments work as follows:',
    {
      list: [
        `An advance payment of 50% of the total project fee is required before any work begins. We do not schedule, start or reserve time for a project until the advance is received.`,
        'The advance is non-refundable, except in the single case described in “Refunds and cancellations” below.',
        'The remaining 50% is due on completion of the agreed work, before the website or product is launched, handed over, or before source files and accounts are transferred.',
        'Larger projects may be split into milestones. Where a proposal lists milestones, each milestone payment is due before work on the next milestone begins.',
        `Invoices are payable within ${LEGAL.invoiceDueDays} days of issue unless a different period is written on the invoice.`,
        'All fees are exclusive of GST and other applicable taxes, which will be added as required by law.',
        'Bank, payment-gateway and currency-conversion charges are borne by the client.',
      ],
    },
    `If a payment is overdue, we may pause work, withhold deliverables, and suspend any live services we manage (such as hosting or maintenance) until the account is settled. We may charge interest on overdue amounts at ${LEGAL.lateInterest}, and any resulting delay will extend the project timeline.`,
  ],
};

const revisions: Section = {
  id: 'revisions',
  title: 'Revisions and rework',
  body: [
    'The number of revision rounds included in your project is agreed at the start and written in your proposal. If no number is stated, each major deliverable (for example, a design concept or a completed build) includes two (2) rounds of revisions.',
    {
      list: [
        'A revision is a change to work that is within the agreed scope and direction — for example, adjusting text, colours, spacing or layout details.',
        'New pages, new features, a new design direction, or changes to work you have already approved are not revisions. They are change requests and will be quoted and billed separately.',
        'Please send all feedback for a round together, in writing. Feedback sent in pieces may count as separate rounds.',
        'Once you approve a stage (such as a design), it is treated as final and later changes to it are billed as additional work.',
        'Revision rounds that are not used do not carry over to other deliverables and cannot be exchanged for a refund.',
      ],
    },
  ],
};

const refunds: Section = {
  id: 'refunds',
  title: 'Refunds and cancellations',
  body: [
    'Because we reserve team time and begin work as soon as a project is confirmed, our refund rules are strict. Please read them carefully before paying.',
    { h: 'When you are entitled to a refund' },
    {
      list: [
        'You will receive a refund only if we fail to deliver the agreed deliverables by the agreed deadline for reasons solely attributable to us.',
        'The deadline is the one written in your proposal, extended by any delay caused by you (for example, late content, feedback, access or payments), by change requests, or by events outside our control.',
        `In that case we will refund the amounts you paid for the deliverables that were not delivered, including the advance, within ${LEGAL.refundProcessingDays} business days. This refund is our full and final liability for the missed deadline.`,
      ],
    },
    { h: 'When no refund is given' },
    {
      list: [
        'You do not like the design, style or result, where the work matches the agreed scope and brief.',
        'You need rework, extra revisions or changes beyond what was agreed.',
        'You change your mind, your business plans or your requirements, or no longer need the project.',
        'The project is delayed or cannot be completed because of missing content, feedback, access or payments from your side.',
        'Problems are caused by third-party services such as hosting, domains, app stores, payment gateways, plugins or advertising platforms (including ad account restrictions).',
        'Marketing, SEO or advertising campaigns do not produce a particular ranking, traffic, number of leads or sales.',
        'Money spent directly on advertising platforms (such as Google or Meta ad spend) — this is paid to the platform, not to us.',
      ],
    },
    { h: 'Cancelling a project' },
    {
      list: [
        'You may cancel a project at any time by telling us in writing.',
        'Payments already made are not refunded. If the work completed at the time of cancellation is worth more than the amount paid, the difference is payable and will be invoiced.',
        'On cancellation we will hand over completed work only once all amounts due have been paid.',
      ],
    },
    { h: 'Monthly plans (retainers)' },
    {
      list: [
        'Monthly plans for marketing, maintenance or support are billed in advance at the start of each month.',
        `You can cancel with ${LEGAL.retainerNoticeDays} days’ written notice. Fees for the current billing month and the notice period are not refundable.`,
      ],
    },
  ],
};

const timelines: Section = {
  id: 'timelines',
  title: 'Timelines and client delays',
  body: [
    'Timelines in your proposal start once the advance payment has been received and you have provided the content, materials and access we need.',
    {
      list: [
        'If feedback, content, approvals, access or payments are delayed on your side, the deadline moves by at least the same amount of time.',
        `If we do not hear from you for ${LEGAL.holdAfterDays} days, the project will be put on hold. Restarting it depends on our availability and may require a new schedule.`,
        `If a project stays on hold for ${LEGAL.closeAfterDays} days, we may treat it as closed. The work completed up to that point becomes payable, and payments already made are not refunded.`,
      ],
    },
  ],
};

/* ---------- Terms & Conditions ---------- */

export const terms: Section[] = [
  {
    id: 'about',
    title: 'About these terms',
    body: [
      `These Terms and Conditions (“Terms”) apply to your use of this website and to all services provided by ${company} (“Azumco”, “we”, “us”, “our”) to you (“client”, “you”). By using this website, accepting a proposal or making a payment, you agree to these Terms.`,
      'Your proposal, quote or invoice and these Terms together form our agreement. If a signed or accepted proposal says something different from these Terms, the proposal applies for that project.',
    ],
  },
  {
    id: 'services',
    title: 'Our services and project scope',
    body: [
      'We provide website and app design and development, branding, search engine optimisation, digital advertising, content, maintenance and related services.',
      'The exact work, deliverables, number of revisions, timeline and price for each project are set out in a written proposal or quote. Acceptance by email, WhatsApp or another written message is valid and binding.',
      'Anything not listed in the proposal is outside the scope. Additional work will be quoted separately and may change the timeline.',
      `Quotes are valid for ${LEGAL.quoteValidityDays} days from the date they are sent unless stated otherwise.`,
    ],
  },
  payments,
  revisions,
  timelines,
  refunds,
  {
    id: 'client',
    title: 'Your responsibilities',
    body: [
      {
        list: [
          'Provide accurate information, content, images, logos and access on time, and give clear, consolidated feedback.',
          'Make sure you own or have permission to use all material you give us. You are responsible for any claim arising from that material.',
          'Make sure the content, products and claims on your website or ads comply with the laws that apply to your business, including your own privacy policy and consumer-protection requirements.',
          'Nominate one person who can give feedback and approvals on your behalf.',
          'Keep your own copies and backups of your content and data, unless backups are part of a plan you have bought from us.',
        ],
      },
    ],
  },
  {
    id: 'third-party',
    title: 'Third-party services and costs',
    body: [
      'Hosting, domain names, email services, paid plugins, fonts, stock media, software subscriptions, API usage, app-store fees and advertising spend are not included in our fees unless stated in your proposal. They are billed to you directly by the providers, or by us at cost.',
      'These services are governed by their providers’ own terms. We are not responsible for their outages, price changes, policy decisions, account suspensions or data loss.',
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing, SEO and advertising',
    body: [
      'Search rankings, traffic, leads and sales depend on factors outside our control, including search engine and platform algorithms, competition and market conditions. We will use our best professional efforts, but we do not guarantee specific results. Any projections we share are estimates, not promises.',
      'Advertising accounts should be owned by you. You are responsible for paying ad spend to the platforms and for complying with their advertising policies.',
    ],
  },
  {
    id: 'ip',
    title: 'Ownership and intellectual property',
    body: [
      {
        list: [
          'Once all amounts due for a project have been paid in full, ownership of the final custom deliverables created specifically for you transfers to you.',
          'Until full payment is received, all rights in the work remain with Azumco, and we may withhold or take down unpaid work.',
          'Our pre-existing tools, code, components, templates and know-how remain ours. Where they are part of your deliverable, you receive a non-exclusive, perpetual licence to use them as part of that project.',
          'Open-source software and third-party assets remain subject to their own licences.',
          'Working files (for example, design source files) are delivered only if your proposal includes them.',
        ],
      },
    ],
  },
  {
    id: 'portfolio',
    title: 'Portfolio use',
    body: [
      'We may show the work we created for you, and your name and logo, in our portfolio, website and marketing — unless you ask us in writing not to, or a confidentiality agreement says otherwise.',
    ],
  },
  {
    id: 'warranty',
    title: 'Post-launch support and warranty',
    body: [
      `For ${LEGAL.warrantyDays} days after launch or handover, we will fix, free of charge, any defects in the work we built that stop it working as agreed.`,
      'This does not cover new features, content updates, changes made by you or third parties, problems caused by hosting or third-party services, or updates to browsers, operating systems or platforms released after launch. Support after this period is available through a maintenance plan or at our standard rates.',
    ],
  },
  {
    id: 'confidentiality',
    title: 'Confidentiality',
    body: [
      'Both parties will keep confidential any non-public business, technical or financial information shared during the project, including passwords and access credentials, and will use it only for the project. This does not apply to information that is already public or that must be disclosed by law.',
    ],
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: [
      'To the maximum extent permitted by law, our total liability for any claim relating to a project is limited to the amount you actually paid us for that project.',
      'We are not liable for indirect or consequential losses, including loss of profit, revenue, business, data or goodwill.',
    ],
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: [
      'You agree to indemnify Azumco against claims, losses and costs arising from material you supplied, content you publish, your breach of these Terms, or your use of the deliverables in breach of any law.',
    ],
  },
  {
    id: 'termination',
    title: 'Termination',
    body: [
      'Either party may end a project or plan by written notice. We may also suspend or end work immediately if payments are overdue, if we are asked to do something unlawful or unethical, or in case of abusive behaviour towards our team.',
      'On termination, the rules in “Refunds and cancellations” apply, and amounts due for work completed remain payable.',
    ],
  },
  {
    id: 'force-majeure',
    title: 'Events outside our control',
    body: [
      'Neither party is responsible for delays or failures caused by events beyond reasonable control, such as natural disasters, epidemics, government action, war, civil unrest, power or internet outages, or failures of third-party providers. Timelines will be extended accordingly.',
    ],
  },
  {
    id: 'communication',
    title: 'Communication and electronic records',
    body: [
      'Proposals, approvals, feedback and notices may be given by email or WhatsApp and are valid as written communication. Electronic records and acceptances are legally valid under the Information Technology Act, 2000.',
    ],
  },
  {
    id: 'website',
    title: 'Use of this website',
    body: [
      'The content, design and code of this website belong to Azumco. You may not copy, reproduce or reuse them without our permission. You agree not to misuse the website, attempt to disrupt it, or submit false or harmful information through its forms.',
    ],
  },
  {
    id: 'law',
    title: 'Governing law and disputes',
    body: [
      'These Terms are governed by the laws of India, including the Indian Contract Act, 1872 and the Information Technology Act, 2000.',
      `We will first try to resolve any dispute through good-faith discussion for 30 days. If it is not resolved, it will be referred to arbitration by a sole arbitrator appointed by mutual agreement under the Arbitration and Conciliation Act, 1996. The seat of arbitration will be ${LEGAL.jurisdiction}, and proceedings will be in English. Subject to this, the courts at ${LEGAL.jurisdiction} have exclusive jurisdiction.`,
    ],
  },
  {
    id: 'general',
    title: 'General',
    body: [
      {
        list: [
          'We may update these Terms from time to time. The version published on this page applies from its effective date; projects already underway continue under the terms accepted at the start unless both parties agree otherwise.',
          'If any part of these Terms is found unenforceable, the rest remains in effect.',
          'Failing to enforce any right does not waive it.',
          'You may not transfer your rights under this agreement without our written consent.',
        ],
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: [`Questions about these Terms can be sent to ${site.email}.`],
  },
];

/* ---------- Refund & Cancellation Policy ---------- */

export const refundPolicy: Section[] = [
  {
    id: 'summary',
    title: 'Summary',
    body: [
      {
        list: [
          '50% advance is required before work starts and is non-refundable.',
          'Revisions are limited to the number agreed at the start of the project.',
          'A refund is given only if we miss the agreed deadline for reasons on our side.',
          'No refunds for dissatisfaction with the design, rework requests, change of mind or client-side delays.',
        ],
      },
      `This policy forms part of our Terms and Conditions. If anything here is unclear, contact us at ${site.email} before making a payment.`,
    ],
  },
  payments,
  revisions,
  timelines,
  refunds,
];

/* ---------- Privacy Policy ---------- */

export const privacy: Section[] = [
  {
    id: 'intro',
    title: 'Introduction',
    body: [
      `This Privacy Policy explains how ${company} (“Azumco”, “we”) collects, uses and protects personal data when you visit this website or contact us. It is published in accordance with the Information Technology Act, 2000, the rules made under it, and the Digital Personal Data Protection Act, 2023.`,
    ],
  },
  {
    id: 'collect',
    title: 'What we collect',
    body: [
      {
        list: [
          'Information you give us through the contact form: your name, email address, company or website, country, the service you are interested in, the best time for a call, and your message. The form also adds your device’s time zone (for example “Asia/Dubai”) so we can suggest a call time; it is sent only with your message.',
          'Information you share when you email, call or message us on WhatsApp, LinkedIn or Instagram.',
          'For clients: billing details, GST information and project-related information needed to deliver our services.',
          'A small record stored in your own browser (localStorage) of when you last submitted the form, used only to prevent spam. It is not sent to us.',
        ],
      },
      'We do not use advertising or cross-site tracking cookies on this website.',
    ],
  },
  {
    id: 'use',
    title: 'How we use it',
    body: [
      {
        list: [
          'To reply to your enquiry and arrange a call.',
          'To prepare proposals, deliver projects, send invoices and provide support.',
          'To meet legal, tax and accounting obligations.',
          'To protect our website from spam and misuse.',
        ],
      },
      'We process your data on the basis of your consent (for example, when you submit the form) or because it is needed to provide services you have requested. We never sell or rent your personal data.',
    ],
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: [
      'We share data only with service providers that help us run our business, and only as needed:',
      {
        list: [
          'EmailJS — delivers contact-form messages to our inbox.',
          'Email, cloud storage and communication providers we use to work with you.',
          'Hosting providers for this website, and font services (Google Fonts and Fontshare) that load the site’s typefaces and may receive your IP address.',
          'Accountants, payment processors and authorities where required by law.',
        ],
      },
      'Some of these providers may store data outside India. We use reputable providers that protect data with appropriate safeguards.',
    ],
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: [
      'We keep enquiry data for as long as needed to respond and follow up, and no longer than two years after our last contact unless you become a client. Client and billing records are kept for as long as required by tax and accounting laws.',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: [
      'You can ask us to:',
      {
        list: [
          'Tell you what personal data we hold about you and how we use it.',
          'Correct, complete or update your data.',
          'Delete your data, where we are not required to keep it by law.',
          'Withdraw your consent at any time (this does not affect processing done before withdrawal).',
          'Nominate another person to exercise these rights on your behalf in case of death or incapacity.',
        ],
      },
      `To make a request, email ${site.email}. We will respond within 30 days.`,
    ],
  },
  {
    id: 'security',
    title: 'Security',
    body: [
      'The website is served over HTTPS, and we use reasonable technical and organisational measures to protect your data. No method of transmission or storage is completely secure, but we will notify you and the relevant authorities of a data breach where required by law.',
    ],
  },
  {
    id: 'children',
    title: 'Children',
    body: ['Our services are meant for businesses and adults. We do not knowingly collect personal data from anyone under 18.'],
  },
  {
    id: 'grievance',
    title: 'Grievance Officer',
    body: [
      `If you have a concern about how your data is handled, contact our Grievance Officer at ${site.email} with the subject “Privacy grievance”. We will acknowledge your complaint within 48 hours and aim to resolve it within 30 days. If you are not satisfied, you may approach the Data Protection Board of India.`,
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: ['We may update this policy from time to time. The latest version and its effective date will always be on this page.'],
  },
];

const title = (key: LegalKey) => legalLinks.find((l) => l.key === key)!.title;

export const legalPages: Record<LegalKey, { title: string; intro: string; sections: Section[] }> = {
  terms: { title: title('terms'), intro: 'The rules that apply to our services and to this website.', sections: terms },
  privacy: { title: title('privacy'), intro: 'What personal data we collect, why, and the choices you have.', sections: privacy },
  refund: { title: title('refund'), intro: 'How advance payments, revisions, refunds and cancellations work.', sections: refundPolicy },
};
