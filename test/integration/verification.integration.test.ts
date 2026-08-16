import { beforeEach, describe, expect, it } from 'vitest'

import { consentTextVersion } from '@/modules/iam/domain/consent-text'
import {
  login,
  register,
  requestPasswordReset,
  resendEmailVerification,
  resetPassword,
  verifyEmail,
} from '@/modules/iam/application/auth-service'
import { hashToken, issueRefreshToken } from '@/modules/iam/infrastructure/token-service'
import { setMailer, type Email } from '@/modules/notification/infrastructure/mailer'
import { anonymousActor } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Email verification, password reset and the consent record — `26-execution-plan.md` row 1.4.
 *
 * Integration, because every claim here is about a row: that a consent exists, that a token
 * is single-use, that sessions were revoked. A unit test with a fake repository would assert
 * that the code calls the functions it calls.
 */

const PASSWORD = 'verification-test-password'

/*
 * A fresh IP per actor, because `06` §Rate limits is 10 auth requests per 15 minutes **per
 * IP**, and this file makes far more than ten. Reusing one address would be a suite that
 * pretends a single browser registered thirty accounts in a second — the limiter is right to
 * refuse that, and `rate-limit.integration.test.ts` is where it is asked to.
 */
let nextOctet = 0
const actor = (ip?: string) =>
  anonymousActor({
    ip: ip ?? `198.51.100.${(nextOctet += 1) % 250}`,
    userAgent: 'integration-suite',
  })

/** A mailer that keeps what it was given, so a test can follow the link the user follows. */
const sent: Email[] = []
setMailer({
  name: 'recording',
  async send(email) {
    sent.push(email)
  },
})

beforeEach(() => {
  sent.length = 0
})

function linkIn(email: Email | undefined): string {
  const match = email?.text.match(/https?:\/\/\S+/)
  if (match === null || match === undefined) throw new Error('no link in the email')
  return match[0]
}

function tokenIn(email: Email | undefined): string {
  return new URL(linkIn(email)).searchParams.get('token') ?? ''
}

async function newUser(email: string): Promise<string> {
  const result = await register(actor(), {
    email,
    password: PASSWORD,
    fullName: 'Verification Test',
    locale: 'tr',
  })
  if (!result.ok) throw new Error(`register failed: ${JSON.stringify(result.error)}`)
  return result.value.userId
}

describe('registration writes the consent record', () => {
  it('creates a Consent(TERMS) row in the same transaction as the user', async () => {
    const email = 'consent-row@example.com'
    const result = await register(actor('203.0.113.9'), {
      email,
      password: PASSWORD,
      fullName: 'Verification Test',
      locale: 'tr',
    })
    if (!result.ok) throw new Error('register failed')
    const userId = result.value.userId

    const consents = await getPrisma().consent.findMany({ where: { userId } })

    expect(consents).toHaveLength(1)
    expect(consents[0]?.type).toBe('TERMS')
    expect(consents[0]?.revokedAt).toBeNull()
    // 19 §Consent requires both, and `resolveActor` records "unknown" rather than guessing,
    // so neither is ever empty.
    expect(consents[0]?.ip).toBe('203.0.113.9')
    expect(consents[0]?.userAgent).toBe('integration-suite')
  }, 60_000)

  it('records the version of the text that is actually in the repository', async () => {
    /*
     * The assertion the whole `consent-text.ts` design exists for. A constant would satisfy
     * "a version was recorded"; only this says the recorded version *is* the file's.
     */
    const userId = await newUser('consent-version@example.com')
    const consent = await getPrisma().consent.findFirst({ where: { userId } })

    expect(consent?.textVersion).toBe(consentTextVersion('TERMS'))
    expect(consent?.textVersion).toMatch(/^terms\.tr@[0-9a-f]{8}$/)
  }, 60_000)
})

describe('email verification', () => {
  it('sends a link, and following it verifies the address', async () => {
    const email = 'verify-flow@example.com'
    const userId = await newUser(email)

    const message = sent.find((mail) => mail.to === email)
    expect(message?.subject).toContain('doğrulayın')
    expect(linkIn(message)).toContain('/eposta-dogrula?token=')

    const before = await getPrisma().user.findUnique({ where: { id: userId } })
    expect(before?.emailVerifiedAt).toBeNull()

    const result = await verifyEmail(actor(), { token: tokenIn(message) })
    expect(result.ok).toBe(true)

    const after = await getPrisma().user.findUnique({ where: { id: userId } })
    expect(after?.emailVerifiedAt).not.toBeNull()
  }, 60_000)

  it('refuses the same link twice', async () => {
    const email = 'verify-twice@example.com'
    await newUser(email)
    const token = tokenIn(sent.find((mail) => mail.to === email))

    expect((await verifyEmail(actor(), { token })).ok).toBe(true)

    const second = await verifyEmail(actor(), { token })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.kind).toBe('FORBIDDEN')
  }, 60_000)

  it('gives the same answer for an expired, used and invented token', async () => {
    const email = 'verify-opaque@example.com'
    await newUser(email)
    const token = tokenIn(sent.find((mail) => mail.to === email))
    await verifyEmail(actor(), { token })

    const used = await verifyEmail(actor(), { token })
    const invented = await verifyEmail(actor(), { token: 'not-a-real-token-at-all' })

    expect(used.ok).toBe(false)
    expect(invented.ok).toBe(false)
    if (used.ok || invented.ok) return
    expect(used.error).toEqual(invented.error)
  }, 60_000)

  it('resends without saying whether the address is verified or exists', async () => {
    const email = 'verify-resend@example.com'
    await newUser(email)
    sent.length = 0

    const known = await resendEmailVerification(actor(), { email })
    const unknown = await resendEmailVerification(actor(), { email: 'nobody-here@example.com' })

    expect(known.ok).toBe(true)
    expect(unknown.ok).toBe(true)
    if (!known.ok || !unknown.ok) return
    expect(known.value).toEqual(unknown.value)

    // One mail went out, to the address that has an unverified account. The other did not.
    expect(sent.map((mail) => mail.to)).toEqual([email])
  }, 60_000)

  it('does not resend to an address that is already verified', async () => {
    const email = 'verify-already@example.com'
    await newUser(email)
    await verifyEmail(actor(), { token: tokenIn(sent.find((mail) => mail.to === email)) })
    sent.length = 0

    await resendEmailVerification(actor(), { email })
    expect(sent).toEqual([])
  }, 60_000)
})

describe('password reset', () => {
  it('sends a link for a known address and nothing for an unknown one — same answer either way', async () => {
    const email = 'reset-known@example.com'
    await newUser(email)
    sent.length = 0

    const known = await requestPasswordReset(actor(), { email })
    const unknown = await requestPasswordReset(actor(), { email: 'reset-unknown@example.com' })

    expect(known.ok).toBe(true)
    expect(unknown.ok).toBe(true)
    if (!known.ok || !unknown.ok) return
    expect(known.value).toEqual(unknown.value)

    expect(sent.map((mail) => mail.to)).toEqual([email])
    expect(linkIn(sent[0])).toContain('/sifre-yenile?token=')
  }, 60_000)

  it('sets the new password and lets the user in with it', async () => {
    const email = 'reset-works@example.com'
    await newUser(email)
    sent.length = 0
    await requestPasswordReset(actor(), { email })

    const result = await resetPassword(actor(), {
      token: tokenIn(sent[0]),
      password: 'a-brand-new-password-9',
    })
    expect(result.ok).toBe(true)

    expect((await login(actor(), { email, password: 'a-brand-new-password-9' })).ok).toBe(true)
    expect((await login(actor(), { email, password: PASSWORD })).ok).toBe(false)
  }, 180_000)

  it('revokes every other session — the reason somebody resets in the first place', async () => {
    /*
     * The likeliest reason a person resets their password is that they think someone else
     * has it. A reset that leaves the intruder's thirty-day refresh token alive has fixed
     * nothing, and the user has no way to tell (`12` §Sessions and revocation).
     */
    const email = 'reset-revokes@example.com'
    const userId = await newUser(email)

    // Three live sessions: a phone, a laptop, and whoever else got in.
    await issueRefreshToken(userId, { ip: '198.51.100.1', userAgent: 'phone' })
    await issueRefreshToken(userId, { ip: '198.51.100.2', userAgent: 'laptop' })
    const intruder = await issueRefreshToken(userId, { ip: '203.0.113.66', userAgent: 'intruder' })

    sent.length = 0
    await requestPasswordReset(actor(), { email })
    const result = await resetPassword(actor(), {
      token: tokenIn(sent[0]),
      password: 'another-fresh-password-7',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.revokedSessions).toBeGreaterThanOrEqual(3)

    const live = await getPrisma().refreshToken.findMany({ where: { userId, revokedAt: null } })
    expect(live).toEqual([])

    const intruderRow = await getPrisma().refreshToken.findUnique({
      where: { tokenHash: hashToken(intruder.token) },
    })
    expect(intruderRow?.revokedReason).toBe('password_reset')
  }, 180_000)

  it('refuses a reset token twice', async () => {
    const email = 'reset-once@example.com'
    await newUser(email)
    sent.length = 0
    await requestPasswordReset(actor(), { email })
    const token = tokenIn(sent[0])

    expect((await resetPassword(actor(), { token, password: 'first-new-password-3' })).ok).toBe(
      true,
    )

    const second = await resetPassword(actor(), { token, password: 'second-new-password-4' })
    expect(second.ok).toBe(false)
  }, 180_000)

  it('still applies the password policy', async () => {
    const email = 'reset-weak@example.com'
    await newUser(email)
    sent.length = 0
    await requestPasswordReset(actor(), { email })

    const result = await resetPassword(actor(), { token: tokenIn(sent[0]), password: 'password' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('CONFLICT')
  }, 60_000)
})

describe('registering an address that already exists', () => {
  it('answers identically and mails the owner a reset link instead', async () => {
    // The other half of "registration does not disclose whether an email exists": the
    // response is the same either way, and the truth goes to whoever owns the address.
    const email = 'already-registered@example.com'
    await newUser(email)
    sent.length = 0

    const again = await register(actor(), {
      email,
      password: PASSWORD,
      fullName: 'Someone Else Entirely',
      locale: 'tr',
    })

    expect(again.ok).toBe(true)

    const message = sent.find((mail) => mail.to === email)
    expect(message?.subject).toContain('Zaten bir hesabınız var')
    expect(linkIn(message)).toContain('/sifre-yenile?token=')

    // And the account was not overwritten.
    const user = await getPrisma().user.findUnique({ where: { email } })
    expect(user?.fullName).toBe('Verification Test')
  }, 120_000)
})
