import 'server-only'

import { hash, verify } from '@node-rs/argon2'

/**
 * Argon2id, with the parameters `12-authentication-authorization.md` §Credentials fixes:
 * `memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1. These are the OWASP minimums for
 * Argon2id and they are written down in the document so nobody "optimises" them downwards
 * when a login feels slow.
 */
const ARGON2_OPTIONS = {
  /** 19 MiB, expressed in KiB as the library expects. */
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  /** Argon2id — the hybrid, resistant to both side-channel and GPU attacks. */
  algorithm: 2 as const,
} satisfies Parameters<typeof hash>[1]

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

/**
 * Verify a password against a stored hash. Argon2's own comparison is constant-time with
 * respect to the hash contents.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS)
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
  memoryCostKib: ARGON2_OPTIONS.memoryCost,
  memoryCostMib: ARGON2_OPTIONS.memoryCost / 1024,
  timeCost: ARGON2_OPTIONS.timeCost,
  parallelism: ARGON2_OPTIONS.parallelism,
  algorithm: 'argon2id',
} as const
