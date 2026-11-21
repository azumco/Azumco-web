import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

/** bcrypt cost. 12 is ~250 ms on a small instance: slow for attackers, fine for a login. */
const COST = process.env.NODE_ENV === 'test' ? 4 : 12;

export const MIN_PASSWORD_LENGTH = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

/**
 * Compare against a stored hash. With no hash (unknown email, or an account
 * that has never had a password) it still does the full bcrypt work against a
 * fixed dummy hash, so response time does not reveal which emails exist.
 */
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', COST);

export async function verifyPassword(plain: string, hash: string | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash || DUMMY_HASH);
  return Boolean(hash) && ok;
}

/** A readable one-time password: no look-alike characters (0/O, 1/l/I). */
export function generateTempPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function passwordProblem(next: string, current?: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next.length > 200) return 'That password is too long.';
  if (current && next === current) return 'Choose a password different from the current one.';
  return null;
}
