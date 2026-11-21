// Phone normalisation to E.164, India (+91) by default. Used for de-duplication
// and for storing confirmed numbers in one canonical form.

/**
 * Returns "+<digits>" or null when the input cannot be a valid number.
 *
 * Accepted Indian forms: 9876543210, 09876543210, 919876543210, +91 98765 43210,
 * and landlines with STD code (e.g. 0755 2345678 → +917552345678).
 * Any other number must be written with its "+<country code>".
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    if (trimmed.startsWith('00')) digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // Indian national formats.
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return null;
}
