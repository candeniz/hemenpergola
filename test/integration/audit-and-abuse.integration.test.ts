import { describe, expect, it } from 'vitest'

import {
  listSessions,
  login,
  register,
  requestPasswordReset,
  resetPassword,
  revokeSession,
} from '@/modules/iam/application/auth-service'
import { issueRefreshToken } from '@/modules/iam/infrastructure/token-service'
import { setMailer, type Email } from '@/modules/notification/infrastructure/mailer'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { consumeAuthRateLimit, consumeRateLimit, RATE_LIMITS } from '@/shared/rate-limit'

import { getPrisma } from './setup'

/**
 * Audit and abuse controls — `26-execution-plan.md` row 1.9,
 * `19-security-and-kvkk.md` §Audit, `06-api-specification.md` §Rate limits.
 */

const PASSWORD = 'audit-test-password'

const mails: Email[] = []
setMailer({
  name: 'recording',
  async send(email) {
    mails.push(email)
  },
})

let seq = 0
const nextIp = () => `198.51.100.${(seq += 1) % 250}`

const caller = (ip: string, userAgent = 'Mozilla/5.0 (integration)') =>
  anonymousActor({ ip, userAgent })

async function newUser(email: string): Promise<string> {
  const result = await register(caller(nextIp()), {
    email,
    password: PASSWORD,
    fullName: 'Audit Test',
    locale: 'tr',
  })
  if (!result.ok) throw new Error(`register: ${JSON.stringify(result.error)}`)
  return result.value.userId
}

const auditFor = (userId: string, action: string) =>
  getPrisma().auditLog.findMany({
    where: { entityType: 'User', entityId: userId, action },
    orderBy: { createdAt: 'asc' },
  })

describe('the four authentication events are audited', () => {
  it('records a successful login with the IP and the user agent', async () => {
    const email = 'audit-login@example.com'
    const userId = await newUser(email)
    const ip = nextIp()

    expect((await login(caller(ip, 'Firefox/140.0'), { email, password: PASSWORD })).ok).toBe(true)

    const entries = await auditFor(userId, 'login')
    expect(entries).toHaveLength(1)
    // 19 §Audit requires both on every entry, and `resolveActor` writes "unknown" rather
    // than guessing — so the columns are never empty and never invented.
    expect(entries[0]?.ip).toBe(ip)
    expect(entries[0]?.userAgent).toBe('Firefox/140.0')
    expect(entries[0]?.actorUserId).toBe(userId)
  }, 120_000)

  it('records a failed login, and does not record a session that was not created', async () => {
    const email = 'audit-failed@example.com'
    const userId = await newUser(email)

    await login(caller(nextIp()), { email, password: 'wrong-password-one' })
    await login(caller(nextIp()), { email, password: 'wrong-password-two' })

    const failures = await auditFor(userId, 'login_failed')
    expect(failures).toHaveLength(2)
    expect(failures[0]?.reason).toBe('attempt 1')
    expect(failures[1]?.reason).toBe('attempt 2')

    expect(await auditFor(userId, 'login')).toHaveLength(0)
  }, 180_000)

  it('leaves no audit trail for a login against an address with no account', async () => {
    // There is no user to attribute it to, and inventing a row keyed on the attempted
    // address would turn the audit log into the account-enumeration oracle that the
    // login response is careful not to be.
    const before = await getPrisma().auditLog.count()
    await login(caller(nextIp()), { email: 'nobody-at-all@example.com', password: PASSWORD })

    expect(await getPrisma().auditLog.count()).toBe(before)
  }, 60_000)

  it('records a password reset with the number of sessions it killed', async () => {
    const email = 'audit-reset@example.com'
    const userId = await newUser(email)
    await issueRefreshToken(userId, { ip: '203.0.113.1', userAgent: 'phone' })
    await issueRefreshToken(userId, { ip: '203.0.113.2', userAgent: 'laptop' })

    mails.length = 0
    await requestPasswordReset(caller(nextIp()), { email })
    const token =
      new URL(mails[0]?.text.match(/https?:\/\/\S+/)?.[0] ?? '').searchParams.get('token') ?? ''

    expect(
      (await resetPassword(caller(nextIp()), { token, password: 'reset-audit-pass-1' })).ok,
    ).toBe(true)

    const entries = await auditFor(userId, 'password_reset')
    expect(entries).toHaveLength(1)
    expect((entries[0]?.after as { revokedSessions: number } | null)?.revokedSessions).toBe(2)
  }, 180_000)

  it('records a session revocation', async () => {
    const email = 'audit-revoke@example.com'
    const userId = await newUser(email)
    const family = await issueRefreshToken(userId, { ip: '203.0.113.5', userAgent: 'tablet' })

    const actor: ActorContext = anonymousActor({ userId, globalRole: 'CUSTOMER', ip: nextIp() })
    const result = await revokeSession(actor, { familyId: family.familyId, allOthers: false })

    expect(result.ok).toBe(true)
    expect(await auditFor(userId, 'session_revoked')).toHaveLength(1)
  }, 120_000)
})

describe('progressive delay and the lockout notice', () => {
  it('mails the account owner once, on the fifth failure', async () => {
    /*
     * `12` §Abuse controls chose a delay over a lockout, so a person who genuinely forgot
     * their password is slowed down rather than locked out of their own account. The notice
     * is the compensating control — and it goes out **once per streak**, because five emails
     * in five seconds is itself the attack.
     */
    const email = 'lockout-notice@example.com'
    await newUser(email)
    mails.length = 0

    for (let i = 0; i < 7; i += 1) {
      await login(caller(nextIp()), { email, password: `wrong-${i}` })
    }

    const notices = mails.filter((mail) => mail.to === email)
    expect(notices).toHaveLength(1)
    expect(notices[0]?.subject).toContain('başarısız giriş')

    const user = await getPrisma().user.findUnique({ where: { email } })
    expect(user?.failedLoginCount).toBe(7)
    expect(user?.lockoutNotifiedAt).not.toBeNull()
  }, 300_000)
})

describe('rate limits', () => {
  it('uses the numbers in 06', () => {
    expect(RATE_LIMITS.auth).toEqual({ limit: 10, windowSeconds: 15 * 60 })
    expect(RATE_LIMITS.offerRequestCreate).toEqual({ limit: 5, windowSeconds: 3600 })
    expect(RATE_LIMITS.priceEstimateUser).toEqual({ limit: 30, windowSeconds: 3600 })
    expect(RATE_LIMITS.priceEstimateIp).toEqual({ limit: 60, windowSeconds: 3600 })
    expect(RATE_LIMITS.messages).toEqual({ limit: 60, windowSeconds: 3600 })
    expect(RATE_LIMITS.publicRead).toEqual({ limit: 300, windowSeconds: 60 })
    // Phase 10.3, with the erase endpoint (29 B3): every call on this surface is one
    // emailed token, and the irreversible surface must not be the unmetered one.
    expect(RATE_LIMITS.privacy).toEqual({ limit: 5, windowSeconds: 3600 })
  })

  it('allows exactly the limit and then refuses, with a Retry-After that makes sense', async () => {
    const key = `probe-${Date.now()}`

    for (let i = 1; i <= RATE_LIMITS.auth.limit; i += 1) {
      const verdict = await consumeRateLimit('auth', 'probe', key)
      expect(verdict.allowed, `request ${i}`).toBe(true)
    }

    const refused = await consumeRateLimit('auth', 'probe', key)
    expect(refused.allowed).toBe(false)
    if (refused.allowed) return
    expect(refused.retryAfterSeconds).toBeGreaterThan(0)
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMITS.auth.windowSeconds)
  }, 60_000)

  it('counts in the database, so N web instances share one budget', async () => {
    // The reason this is not a Map in module scope: `23` §Runtime runs the web tier as N
    // stateless instances, and a per-process counter would hand an attacker N times the
    // limit and forget everything on deploy.
    const key = `shared-${Date.now()}`
    await consumeRateLimit('auth', 'probe', key)
    await consumeRateLimit('auth', 'probe', key)

    const rows = await getPrisma().rateLimitHit.findMany({
      where: { bucket: `auth:probe:${key}` },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.count).toBe(2)
  }, 60_000)

  it('keeps separate windows per bucket', async () => {
    const a = `bucket-a-${Date.now()}`
    const b = `bucket-b-${Date.now()}`

    for (let i = 0; i < RATE_LIMITS.auth.limit; i += 1) {
      await consumeRateLimit('auth', 'probe', a)
    }

    expect((await consumeRateLimit('auth', 'probe', a)).allowed).toBe(false)
    expect((await consumeRateLimit('auth', 'probe', b)).allowed).toBe(true)
  }, 60_000)

  it('fills both dimensions even when one already refused', async () => {
    /*
     * `06`: *per IP **and** per account*. Consuming both regardless is what stops a caller
     * hiding one behind the other — spreading attempts across accounts still fills the IP
     * bucket, and coming from many IPs still fills the account bucket.
     */
    const ip = `203.0.113.${(Date.now() % 200) + 1}`
    const account = `both-${Date.now()}@example.com`

    for (let i = 0; i < RATE_LIMITS.auth.limit; i += 1) {
      await consumeAuthRateLimit(ip, `spread-${i}-${Date.now()}@example.com`)
    }

    // The IP is spent, though this account has never been seen.
    const refused = await consumeAuthRateLimit(ip, account)
    expect(refused.allowed).toBe(false)

    // And the account bucket was charged anyway.
    const rows = await getPrisma().rateLimitHit.findMany({
      where: { bucket: `auth:account:${account}` },
    })
    expect(rows[0]?.count).toBe(1)
  }, 60_000)

  it('does not share a bucket between callers whose IP is unknown', async () => {
    // `resolveActor` records "unknown" rather than inventing an address. Counting that as
    // one bucket would let a single caller lock out everyone behind a proxy that strips
    // forwarding headers.
    for (let i = 0; i < RATE_LIMITS.auth.limit + 5; i += 1) {
      await consumeAuthRateLimit('unknown', `unknown-ip-${i}-${Date.now()}@example.com`)
    }

    const verdict = await consumeAuthRateLimit('unknown', `fresh-${Date.now()}@example.com`)
    expect(verdict.allowed).toBe(true)
  }, 60_000)

  it('refuses the eleventh registration from one address', async () => {
    // End to end through the service, not the helper: the limit is only real if the use
    // case consults it.
    const ip = `192.0.2.${(Date.now() % 200) + 1}`

    for (let i = 0; i < RATE_LIMITS.auth.limit; i += 1) {
      const result = await register(caller(ip), {
        email: `flood-${i}-${Date.now()}@example.com`,
        password: PASSWORD,
        fullName: 'Flood',
        locale: 'tr',
      })
      expect(result.ok, `registration ${i}`).toBe(true)
    }

    const refused = await register(caller(ip), {
      email: `flood-last-${Date.now()}@example.com`,
      password: PASSWORD,
      fullName: 'Flood',
      locale: 'tr',
    })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.error.kind).toBe('RATE_LIMITED')
  }, 600_000)
})

describe('the session list', () => {
  it('shows one row per login, with the device and the address', async () => {
    const email = 'sessions-list@example.com'
    const userId = await newUser(email)

    await issueRefreshToken(userId, { ip: '203.0.113.11', userAgent: 'iPhone' })
    await issueRefreshToken(userId, { ip: '203.0.113.12', userAgent: 'Chrome on Windows' })

    const actor = anonymousActor({ userId, globalRole: 'CUSTOMER', ip: nextIp() })
    const result = await listSessions(actor, {})

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.sessions).toHaveLength(2)
    expect(result.value.sessions.map((session) => session.userAgent).sort()).toEqual([
      'Chrome on Windows',
      'iPhone',
    ])
    expect(result.value.sessions.every((session) => session.ip !== null)).toBe(true)
  }, 120_000)

  it('never shows another account’s sessions', async () => {
    const mine = await newUser('sessions-mine@example.com')
    const theirs = await newUser('sessions-theirs@example.com')

    await issueRefreshToken(mine, { ip: '203.0.113.21', userAgent: 'mine' })
    await issueRefreshToken(theirs, { ip: '203.0.113.22', userAgent: 'theirs' })

    const result = await listSessions(anonymousActor({ userId: mine, globalRole: 'CUSTOMER' }), {})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.sessions.map((session) => session.userAgent)).toEqual(['mine'])
  }, 180_000)

  it('revokes one session and leaves the rest alone', async () => {
    const userId = await newUser('sessions-revoke-one@example.com')
    const first = await issueRefreshToken(userId, { ip: '203.0.113.31', userAgent: 'one' })
    await issueRefreshToken(userId, { ip: '203.0.113.32', userAgent: 'two' })

    const actor = anonymousActor({ userId, globalRole: 'CUSTOMER' })
    const result = await revokeSession(actor, { familyId: first.familyId, allOthers: false })

    expect(result.ok).toBe(true)

    const live = await listSessions(actor, {})
    expect(live.ok).toBe(true)
    if (!live.ok) return
    expect(live.value.sessions.map((session) => session.userAgent)).toEqual(['two'])
  }, 120_000)

  it('refuses to revoke a family belonging to someone else, and says NOT_FOUND', async () => {
    /*
     * Ownership lives in the `where` clause (`CLAUDE.md` non-negotiable 3): the update is
     * scoped by `userId`, so a stranger's family simply matches nothing. "Not yours" and
     * "does not exist" are the same answer, which is the point — the alternative confirms
     * that a family id is real.
     */
    const mine = await newUser('revoke-attacker@example.com')
    const theirs = await newUser('revoke-victim@example.com')
    const victimSession = await issueRefreshToken(theirs, { ip: '203.0.113.41', userAgent: 'v' })

    const result = await revokeSession(anonymousActor({ userId: mine, globalRole: 'CUSTOMER' }), {
      familyId: victimSession.familyId,
      allOthers: false,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('NOT_FOUND')

    // And it is still alive.
    const rows = await getPrisma().refreshToken.findMany({
      where: { familyId: victimSession.familyId, revokedAt: null },
    })
    expect(rows.length).toBeGreaterThan(0)
  }, 180_000)

  it('signs out everywhere else while sparing the session that asked', async () => {
    const userId = await newUser('revoke-others@example.com')
    const current = await issueRefreshToken(userId, { ip: '203.0.113.51', userAgent: 'current' })
    await issueRefreshToken(userId, { ip: '203.0.113.52', userAgent: 'other-a' })
    await issueRefreshToken(userId, { ip: '203.0.113.53', userAgent: 'other-b' })

    const actor = anonymousActor({ userId, globalRole: 'CUSTOMER' })
    const result = await revokeSession(actor, {
      allOthers: true,
      currentRefreshToken: current.token,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.revoked).toBe(2)

    const live = await listSessions(actor, {})
    expect(live.ok).toBe(true)
    if (!live.ok) return
    expect(live.value.sessions.map((session) => session.userAgent)).toEqual(['current'])
  }, 120_000)
})
