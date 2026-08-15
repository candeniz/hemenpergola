/**
 * Password policy — `12-authentication-authorization.md` §Credentials.
 *
 * Minimum 10 characters, checked against a common-password list. **No composition rules.**
 * The document is explicit about why: "they produce `Password1!` and nothing else." A rule
 * that forces a digit and a symbol moves every user to the same predictable shape, which is
 * worse than length alone.
 *
 * Domain layer: pure, no IO.
 */

export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 256

/**
 * The most-guessed passwords, plus the ones this project invites specifically — a Turkish
 * marketplace gets `sifre123` and `pergola123` before it gets `correcthorsebatterystaple`.
 *
 * Deliberately small and in-repo rather than a 100k-entry dependency: the list exists to
 * catch the handful that appear in every credential-stuffing run, and length does the rest.
 * Compared case-insensitively.
 */
const COMMON_PASSWORDS: readonly string[] = [
  '1234567890',
  '12345678901',
  '123456789012',
  'password123',
  'password1234',
  'qwertyuiop',
  'qwerty12345',
  'iloveyou123',
  'admin123456',
  'welcome123',
  'letmein1234',
  'monkey12345',
  'dragon12345',
  'sunshine123',
  'princess123',
  'football123',
  'baseball123',
  'trustno1234',
  'passw0rd123',
  'p@ssw0rd123',
  // Turkish keyboard walks and common choices
  'sifre123456',
  'şifre123456',
  'parola12345',
  'galatasaray',
  'fenerbahce1',
  'besiktas123',
  'trabzonspor',
  'istanbul123',
  'ankara12345',
  'merhaba1234',
  'deneme12345',
  // What people type when a form asks them for ten characters about this product
  'pergola123',
  'pergola1234',
] as const

const COMMON_PASSWORD_SET = new Set(COMMON_PASSWORDS.map((value) => value.toLowerCase()))

export type PasswordProblem =
  | { kind: 'too_short'; minimum: number }
  | { kind: 'too_long'; maximum: number }
  | { kind: 'common' }

/**
 * Validate a candidate password. Returns every problem rather than the first, so a form can
 * show all of them at once instead of one per submit.
 */
export function validatePassword(password: string): PasswordProblem[] {
  const problems: PasswordProblem[] = []

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push({ kind: 'too_short', minimum: MIN_PASSWORD_LENGTH })
  }

  // Argon2 is not free; an unbounded password is a cheap way to make the server work hard.
  if (password.length > MAX_PASSWORD_LENGTH) {
    problems.push({ kind: 'too_long', maximum: MAX_PASSWORD_LENGTH })
  }

  if (COMMON_PASSWORD_SET.has(password.toLowerCase())) {
    problems.push({ kind: 'common' })
  }

  return problems
}

export function isPasswordAcceptable(password: string): boolean {
  return validatePassword(password).length === 0
}

/** Exposed for the test that asserts the list is actually consulted. */
export const COMMON_PASSWORD_COUNT = COMMON_PASSWORD_SET.size
