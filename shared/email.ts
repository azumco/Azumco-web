// Company-domain check for sign-in and account management.
//
// The part after the LAST "@" must equal the allowed domain exactly
// (case-insensitive, after trimming). Look-alikes such as
// "azumco.com.evil.com", "azumco.co" or a subdomain "mail.azumco.com" fail.

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function emailInDomain(email: string | null | undefined, domain: string): boolean {
  if (!email) return false;
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1) return false;
  return e.slice(at + 1) === domain.trim().toLowerCase();
}
