// Lightweight list of legal pages (the full text lives in legal.ts and loads on demand).
export const legalLinks = [
  { key: 'terms', path: '/terms', title: 'Terms & Conditions' },
  { key: 'privacy', path: '/privacy', title: 'Privacy Policy' },
  { key: 'refund', path: '/refund-policy', title: 'Refund & Cancellation Policy' },
] as const;

export type LegalKey = (typeof legalLinks)[number]['key'];
