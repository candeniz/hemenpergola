import 'server-only'

import { hash, verify } from '@node-rs/argon2'

import { ARGON2_OPTIONS } from '../domain/password'

/**
 * The work factor lives in `domain/password.ts`: it is a policy decision
 * (`12-authentication-authorization.md` §Credentials), and the seed has to hash the
 * bootstrap admin with the same numbers without importing this `server-only` module.
 */
const OPTIONS = ARGON2_OPTIONS satisfies Parameters<typeof hash>[1]

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

/**
 * Verify a password against a stored hash. Argon2's own comparison is constant-time with
 * respect to the hash contents.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, OPTIONS)
  } catch {
    // A malformed hash in the database must read as "wrong password", not as a 500 that
    // tells an attacker this account is special.
    return false
  }
}

/**
 * A precomputed hash of a value nobody can supply, used to burn the same CPU time when the
 * email is unknown as when the password is wrong (`12` §Credentials: *"identical response
 * shape and latency"*).
 *
 * Without this, "unknown email" returns in microseconds and "wrong password" takes the
 * Argon2 work factor — which turns the login endpoint into an account-enumeration oracle
 * that no amount of identical JSON can hide. `auth-service.ts` calls `burnPasswordTime`
 * on the unknown-email path and `credentials.test.ts` measures that the two are
 * indistinguishable.
 *
 * Computed once, lazily, so the cost is paid at first use rather than at import.
 */
let dummyHash: string | undefined

export async function burnPasswordTime(password: string): Promise<false> {
  dummyHash ??= await hashPassword(`dummy:${crypto.randomUUID()}`)
  await verifyPassword(password, dummyHash)
  return false
}

/** For the test that asserts the parameters are the documented ones. */
export const ARGON2_PARAMETERS = {
  memoryCostKib: OPTIONS.memoryCost,
  memoryCostMib: OPTIONS.memoryCost / 1024,
  timeCost: OPTIONS.timeCost,
  parallelism: OPTIONS.parallelism,
  algorithm: 'argon2id',
} as const
