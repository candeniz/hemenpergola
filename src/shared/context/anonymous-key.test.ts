import { describe, expect, it } from 'vitest'

import {
  ANONYMOUS_DRAFT_TTL_DAYS,
  anonymousCookieExpiry,
  anonymousCookieName,
  anonymousDraftCutoff,
  expiredAnonymousDraftsWhere,
  isAnonymousKey,
  MAX_ANONYMOUS_DRAFTS_PER_KEY,
  newAnonymousKey,
} from './anonymous-key'

/**
 * `10-project-configurator.md` §Anonymous drafts and `19-security-and-kvkk.md` §Retention —
 * task 4.5's pure half.
 *
 * Unit, because none of it touches a request or the database. The parts that do are proved in
 * `test/integration/project-claim.integration.test.ts` and in `e2e/phase4-gate.spec.ts`.
 */

describe('the draft key', () => {
  it('is long enough that guessing one is not a strategy', async () => {
    const key = await newAnonymousKey()

    // 32 bytes, base64url, unpadded → 43 characters.
    expect(key).toHaveLength(43)
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('does not repeat', async () => {
    const keys = new Set(await Promise.all(Array.from({ length: 50 }, () => newAnonymousKey())))

    expect(keys.size).toBe(50)
  })

  it('accepts what it issues', async () => {
    expect(isAnonymousKey(await newAnonymousKey())).toBe(true)
  })

  it('rejects everything that is not one', () => {
    /*
     * Not a security control — the database would not match a forged value either — but a
     * shape check keeps a 4 KB cookie out of a `where` clause and makes "no identity at all"
     * unambiguous for `ownedBy()`.
     */
    for (const value of ['', 'short', 'a'.repeat(200), 'has spaces', 'semi;colon', null, 42, {}]) {
      expect(isAnonymousKey(value), JSON.stringify(value)).toBe(false)
    }
  })
})

describe('the cookie', () => {
  it('takes the __Host- name only where Secure is available', () => {
    /*
     * `__Host-` requires `Secure`, which local development over plain HTTP cannot set — the
     * prefix would make the cookie unsettable. Same pair, same reason, as the session cookie.
     */
    expect(anonymousCookieName(true)).toBe('__Host-pergola.anon')
    expect(anonymousCookieName(false)).toBe('pergola.anon')
  })

  it('expires exactly when the rows do', () => {
    const now = new Date('2026-08-23T09:00:00.000Z')
    const expiry = anonymousCookieExpiry(now)

    expect(expiry.getTime() - now.getTime()).toBe(ANONYMOUS_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000)

    /*
     * The point of asserting both against the same constant: a cookie outliving the rows
     * offers a customer a draft that has been swept, and rows outliving the cookie leave data
     * nobody can reach and nothing deletes.
     */
    expect(expiry.getTime() - now.getTime()).toBe(
      now.getTime() - anonymousDraftCutoff(now).getTime(),
    )
  })
})

describe('retention — 19 §Retention, enforced by Phase 9', () => {
  it('cuts off thirty days back', () => {
    const now = new Date('2026-08-23T09:00:00.000Z')

    expect(anonymousDraftCutoff(now).toISOString()).toBe('2026-07-24T09:00:00.000Z')
  })

  it('selects only drafts that are still anonymous, alive, and untouched for the window', () => {
    const now = new Date('2026-08-23T09:00:00.000Z')
    const where = expiredAnonymousDraftsWhere(now)

    // A claimed project belongs to an account and follows the account's retention, not this
    // one — so `customerId: null` is part of the rule rather than an optimisation.
    expect(where.customerId).toBeNull()
    expect(where.anonymousKey).toEqual({ not: null })
    expect(where.deletedAt).toBeNull()

    // Measured from `updatedAt`: a visitor who came back on day 29 has not abandoned
    // anything, and deleting their draft the next morning is the wrong reading of the rule.
    expect(where.updatedAt.lt.toISOString()).toBe('2026-07-24T09:00:00.000Z')
  })
})

describe('the three-draft ceiling', () => {
  it('is three, and it is one number', () => {
    /*
     * `10` §Anonymous drafts: *"a key claims at most 3 drafts"*. Asserted because the number
     * appears in an error message a customer reads and in a `count()` a service runs, and the
     * two are the same constant on purpose.
     */
    expect(MAX_ANONYMOUS_DRAFTS_PER_KEY).toBe(3)
  })
})
