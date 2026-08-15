import { beforeAll, describe, expect, it } from 'vitest'

import { login, progressiveDelayMs, register } from '@/modules/iam/application/auth-service'
import {
  ARGON2_PARAMETERS,
  hashPassword,
  verifyPassword,
} from '@/modules/iam/infrastructure/password-hasher'
import { anonymousActor } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * `12-authentication-authorization.md` §Credentials — task 1.2.
 *
 * Integration rather than unit because the timing claim is only meaningful against a real
 * database: the whole point is that the unknown-email path and the wrong-password path cost
 * the same, and half that cost is a query.
 */

const PASSWORD = 'correct-horse-battery'
const KNOWN_EMAIL = 'timing-known@example.com'

beforeAll(async () => {
  await register(anonymousActor(), {
    email: KNOWN_EMAIL,
    password: PASSWORD,
    fullName: 'Timing Known',
    locale: 'tr',
  })
}, 120_000)

describe('Argon2id parameters', () => {
  it('are the ones 12 §Credentials fixes', () => {
    // Written down so nobody "optimises" them downwards when a login feels slow.
    expect(ARGON2_PARAMETERS).toEqual({
      memoryCostKib: 19 * 1024,
      memoryCostMib: 19,
      timeCost: 2,
      parallelism: 1,
      algorithm: 'argon2id',
    })
  })

  it('produces an argon2id hash and verifies it', async () => {
    const hash = await hashPassword(PASSWORD)

    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(hash).toContain('m=19456') // 19 MiB in KiB
    expect(hash).toContain('t=2')
    expect(hash).toContain('p=1')

    expect(await verifyPassword(PASSWORD, hash)).toBe(true)
    expect(await verifyPassword('something else entirely', hash)).toBe(false)
  }, 30_000)

  it('treats a malformed stored hash as a wrong password, not a crash', async () => {
    expect(await verifyPassword(PASSWORD, 'not-a-hash')).toBe(false)
  })
})

describe('unknown email and wrong password are indistinguishable', () => {
  it('returns the identical error', async () => {
    const unknown = await login(anonymousActor(), {
      email: 'timing-unknown@example.com',
      password: PASSWORD,
    })
    const wrong = await login(anonymousActor(), {
      email: KNOWN_EMAIL,
      password: 'definitely-not-the-password',
    })

    expect(unknown.ok).toBe(false)
    expect(wrong.ok).toBe(false)
    if (unknown.ok || wrong.ok) return

    // Same kind, same payload — nothing in the response separates the two branches.
    expect(unknown.error).toEqual(wrong.error)
    expect(unknown.error.kind).toBe('FORBIDDEN')
  }, 60_000)

  it('takes measurably similar time on both paths', async () => {
    /*
     * The claim that actually needs measuring. Without `burnPasswordTime` on the
     * unknown-email path, that branch returns in microseconds while the wrong-password
     * branch pays the full Argon2 cost — a difference of two orders of magnitude, which
     * turns the login endpoint into an account-enumeration oracle regardless of how
     * identical the JSON is.
     *
     * Wall-clock timing is noisy, so this takes the median of several runs and allows a
     * generous ratio. Even a 3× tolerance catches the real failure, which is ~100×.
     */
    const time = async (email: string, password: string): Promise<number> => {
      const started = process.hrtime.bigint()
      await login(anonymousActor(), { email, password })
      return Number(process.hrtime.bigint() - started) / 1e6
    }

    const median = (values: number[]): number => {
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length / 2)] ?? 0
    }

    const runs = 5
    const unknownTimes: number[] = []
    const wrongTimes: number[] = []

    for (let i = 0; i < runs; i += 1) {
      // Alternate, so a warming CPU biases both series equally.
      unknownTimes.push(await time(`timing-absent-${i}@example.com`, PASSWORD))
      wrongTimes.push(await time(KNOWN_EMAIL, `wrong-password-${i}`))
    }

    const unknownMedian = median(unknownTimes)
    const wrongMedian = median(wrongTimes)
    const ratio =
      Math.max(unknownMedian, wrongMedian) / Math.max(1, Math.min(unknownMedian, wrongMedian))

    // Both paths must do real Argon2 work — a near-zero median would mean one branch skipped it.
    expect(unknownMedian).toBeGreaterThan(5)
    expect(wrongMedian).toBeGreaterThan(5)
    expect(
      ratio,
      `unknown ${unknownMedian.toFixed(1)}ms vs wrong ${wrongMedian.toFixed(1)}ms`,
    ).toBeLessThan(3)
  }, 180_000)
})

describe('registration does not disclose whether an email exists', () => {
  it('returns the same shape for a new and an existing address', async () => {
    const fresh = await register(anonymousActor(), {
      email: 'disclosure-fresh@example.com',
      password: PASSWORD,
      fullName: 'Fresh',
      locale: 'tr',
    })

    const duplicate = await register(anonymousActor(), {
      email: KNOWN_EMAIL,
      password: PASSWORD,
      fullName: 'Someone Else',
      locale: 'tr',
    })

    expect(fresh.ok).toBe(true)
    expect(duplicate.ok).toBe(true)
    if (!fresh.ok || !duplicate.ok) return

    // Same keys, same flag. The truth arrives by email, to the address that owns it.
    expect(Object.keys(duplicate.value).sort()).toEqual(Object.keys(fresh.value).sort())
    expect(duplicate.value.emailVerificationSent).toBe(true)

    // And it did not overwrite the existing account.
    const user = await getPrisma().user.findUnique({ where: { email: KNOWN_EMAIL } })
    expect(user?.fullName).toBe('Timing Known')
  }, 60_000)

  it('rejects a password the policy refuses', async () => {
    const result = await register(anonymousActor(), {
      email: 'weak@example.com',
      password: 'password123',
      fullName: 'Weak',
      locale: 'tr',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('CONFLICT')
  }, 30_000)
})

describe('progressive delay', () => {
  it('starts after five failures and caps', () => {
    // 12 §Abuse controls chose a delay rather than a lockout, so a user who genuinely forgot
    // their password is slowed down, not locked out of their own account.
    expect(progressiveDelayMs(0)).toBe(0)
    expect(progressiveDelayMs(4)).toBe(0)
    expect(progressiveDelayMs(5)).toBe(1000)
    expect(progressiveDelayMs(6)).toBe(2000)
    expect(progressiveDelayMs(7)).toBe(4000)
    expect(progressiveDelayMs(8)).toBe(8000)
    expect(progressiveDelayMs(20)).toBe(8000)
  })

  it('counts failures and resets them on a successful login', async () => {
    const email = 'counter@example.com'
    await register(anonymousActor(), {
      email,
      password: PASSWORD,
      fullName: 'Counter',
      locale: 'tr',
    })

    await login(anonymousActor(), { email, password: 'wrong-one' })
    await login(anonymousActor(), { email, password: 'wrong-two' })

    const afterFailures = await getPrisma().user.findUnique({ where: { email } })
    expect(afterFailures?.failedLoginCount).toBe(2)

    const success = await login(anonymousActor(), { email, password: PASSWORD })
    expect(success.ok).toBe(true)

    const afterSuccess = await getPrisma().user.findUnique({ where: { email } })
    expect(afterSuccess?.failedLoginCount).toBe(0)
    expect(afterSuccess?.lastFailedLoginAt).toBeNull()
  }, 120_000)

  it('records the lockout notification once per streak, not per attempt', async () => {
    const email = 'lockout@example.com'
    await register(anonymousActor(), {
      email,
      password: PASSWORD,
      fullName: 'Lockout',
      locale: 'tr',
    })

    for (let i = 0; i < 5; i += 1) {
      await login(anonymousActor(), { email, password: `wrong-${i}` })
    }

    const user = await getPrisma().user.findUnique({ where: { email } })
    expect(user?.failedLoginCount).toBe(5)
    // Five emails in five seconds is itself the attack.
    expect(user?.lockoutNotifiedAt).not.toBeNull()
  }, 180_000)
})
