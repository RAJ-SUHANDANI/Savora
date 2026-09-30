/**
 * Password strength.
 *
 * Shared by the registration form's meter and the server-side schema, so the
 * rule a guest is shown while typing is provably the rule that will be enforced
 * on submit. It lives outside the `"use client"` form components on purpose:
 * a server module importing from a client module would only get a client
 * *reference*, not a callable function.
 */

/**
 * bcrypt cost factor.
 *
 * Defined once, here, and used by registration *and* the account's password
 * change. Two copies of this number would be free to drift apart, and the one
 * that silently drops to 10 on a less-trafficked code path is the one nobody
 * would notice until a password database leaked.
 *
 * Not a secret — it is a public constant and it will be present in the client
 * bundle. It is exported from a client-shared module for that reason, and
 * exported at all for the opposite reason: one definition, imported by both
 * writers.
 */
export const BCRYPT_ROUNDS = 12;

const BANDS = [
  { label: "Too short — use at least 8 characters.", colour: "var(--color-wine)" },
  { label: "Weak. A longer passphrase would be far harder to guess.", colour: "var(--color-wine)" },
  { label: "Reasonable, but longer is better.", colour: "var(--color-saffron)" },
  { label: "Strong. Length is doing the work here.", colour: "var(--color-olive)" },
  { label: "Excellent — long and varied.", colour: "var(--color-olive)" },
] as const;

export type PasswordBand = { score: number; label: string; colour: string };

/**
 * Four-band strength, from length first and character variety second.
 *
 * Length dominates because that is what buys resistance to guessing, and
 * because the alternative — demanding symbols — reliably produces `Password1!`
 * in a password manager. Variety only breaks ties, so a long passphrase scores
 * the same as a short random string of the same length.
 */
export function scorePassword(password: string): PasswordBand {
  if (!password) return { score: 0, label: BANDS[0].label, colour: "var(--color-surface-sunken)" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z0-9]/.test(password)) score++;

  return { score, ...BANDS[Math.min(score, BANDS.length - 1)] };
}
