// Where the site's links point, so the home page, the services hub and every
// service page agree (and section links work from any page).

/** "#work" on the home page, "/#work" everywhere else. */
export const sectionHref = (hash: string, home: boolean) => (home ? `#${hash}` : `/#${hash}`);

export const servicesHref = '/services';
export const serviceHref = (slug: string) => `/services/${slug}`;

/**
 * The contact form, with "I'm interested in" set: a service slug,
 * "growth-partner" or "not-sure". On the home page it stays on the page.
 */
export const contactHref = (interest?: string, home = false) =>
  `${home ? '' : '/'}${interest ? `?service=${encodeURIComponent(interest)}` : ''}#contact`;
