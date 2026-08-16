import { describe, expect, it } from 'vitest'

import {
  confirmPhoneVerification,
  OTP_RESEND_INTERVAL_SECONDS,
  register,
  startPhoneVerification,
} from '@/modules/iam/application/auth-service'
import { hashToken, OTP_MAX_ATTEMPTS } from '@/modules/iam/infrastructure/token-service'
import { phoneSchema, startPhoneVerificationSchema } from '@/modules/iam/application/dto'
import { setSmsSender, type Sms } from '@/modules/notification/infrastructure/sms-sender'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Phone verification — `26-execution-plan.md` row 1.5.
 *
 * Q3 is open: no SMS provider is chosen, and the log adapter is what closes the row. The
 * port is the deliverable, so this suite drives the flow through a recording sender — which
 * is the same shape the real adapter will have, and the reason swapping one in is a file
 * rather than a refactor.
 */

const messages: Sms[] = []
setSmsSender({
  name: 'recording',
  async send(message) {
    messages.push(message)
  },
})

let nextOctet = 0
async function signedInUser(email: string): Promise<ActorContext> {
  const result = await register(anonymousActor({ ip: `198.51.100.${(nextOctet += 1) % 250}` }), {
    email,
    password: 'phone-test-password',
    fullName: 'Phone Test',
    locale: 'tr',
  })
  if (!result.ok) throw new Error(`register failed: ${JSON.stringify(result.error)}`)

  return anonymousActor({ userId: result.value.userId, globalRole: 'CUSTOMER' })
}

const lastCode = () => messages[messages.length - 1]?.text.match(/\d{6}/)?.[0] ?? ''

/**
 * Parse before calling, exactly as both adapters do.
 *
 * Normalisation lives in the Zod schema, and the schema is what the server action and the
 * route handler share (`CLAUDE.md` §Conventions). Handing the service a raw
 * "0555 111 22 33" would be testing a call that cannot happen — the service is typed against
 * the schema’s *output*, and the first version of this file quietly stored the unnormalised
 * string because it skipped the parse.
 */
const dial = (raw: string) => startPhoneVerificationSchema.parse({ phone: raw })

describe('the phone number is normalised before anything is sent to it', () => {
  it.each([
    ['0555 123 45 67', '+905551234567'],
    ['+90 555 123 45 67', '+905551234567'],
    ['905551234567', '+905551234567'],
    ['(0555) 123-45-67', '+905551234567'],
    ['5551234567', '+905551234567'],
  ])('reads %s as %s', (input, expected) => {
    // "0555 123 45 67" and "+905551234567" are one number. An OTP sent to a differently
    // formatted copy of it is simply lost, and the user sees a code that never arrives.
    expect(phoneSchema.parse(input)).toBe(expected)
  })

  it.each(['0212 123 45 67', '+1 555 123 4567', '05551234', 'not a phone'])(
    'rejects %s',
    (input) => {
      // Landlines included: an OTP is an SMS, and 0212 is not a mobile.
      expect(phoneSchema.safeParse(input).success).toBe(false)
    },
  )
})

describe('OTP lifecycle', () => {
  it('sends six digits and verifies the number', async () => {
    const actor = await signedInUser('otp-happy@example.com')
    messages.length = 0

    const started = await startPhoneVerification(actor, dial('0555 111 22 33'))
    expect(started.ok).toBe(true)

    expect(messages).toHaveLength(1)
    expect(messages[0]?.to).toBe('+905551112233')
    expect(lastCode()).toMatch(/^\d{6}$/)

    const before = await getPrisma().user.findUnique({ where: { id: actor.userId ?? '' } })
    expect(before?.phone).toBe('+905551112233')
    expect(before?.phoneVerifiedAt).toBeNull()

    const confirmed = await confirmPhoneVerification(actor, { code: lastCode() })
    expect(confirmed.ok).toBe(true)

    const after = await getPrisma().user.findUnique({ where: { id: actor.userId ?? '' } })
    expect(after?.phoneVerifiedAt).not.toBeNull()
  }, 120_000)

  it('stores the code hashed, with a five-minute life', async () => {
    const actor = await signedInUser('otp-stored@example.com')
    messages.length = 0
    await startPhoneVerification(actor, dial('0555 111 22 44'))

    const stored = await getPrisma().authToken.findUnique({
      where: { tokenHash: hashToken(lastCode()) },
    })

    expect(stored?.type).toBe('PHONE_OTP')
    expect(stored?.target).toBe('+905551112244')
    // A database dump must not be a list of working codes.
    expect(stored?.tokenHash).not.toBe(lastCode())

    const ttl = Math.round(((stored?.expiresAt.getTime() ?? 0) - Date.now()) / 1000)
    expect(ttl).toBeGreaterThan(240)
    expect(ttl).toBeLessThanOrEqual(300)
  }, 120_000)

  it('refuses a second code within sixty seconds, and says how long to wait', async () => {
    // Every SMS costs money, and a resend button is the cheapest way to spend somebody
    // else's.
    const actor = await signedInUser('otp-resend@example.com')
    messages.length = 0

    expect((await startPhoneVerification(actor, dial('0555 111 22 55'))).ok).toBe(true)

    const again = await startPhoneVerification(actor, dial('0555 111 22 55'))
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.error.kind).toBe('RATE_LIMITED')
    if (again.error.kind !== 'RATE_LIMITED') return
    expect(again.error.retryAfter).toBeGreaterThan(0)
    expect(again.error.retryAfter).toBeLessThanOrEqual(OTP_RESEND_INTERVAL_SECONDS)

    // And no second message went out.
    expect(messages).toHaveLength(1)
  }, 120_000)

  it('dies after five wrong attempts', async () => {
    /*
     * The cap is the only thing that makes a six-digit code a credential: a million
     * possibilities is nothing to a script, and without the cap the code is guessable in
     * minutes.
     */
    const actor = await signedInUser('otp-attempts@example.com')
    messages.length = 0
    await startPhoneVerification(actor, dial('0555 111 22 66'))
    const real = lastCode()

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      const wrong = String(100000 + i)
      const result = await confirmPhoneVerification(actor, { code: wrong })
      expect(result.ok, `attempt ${i}`).toBe(false)
    }

    // Even the right code is now refused — the token is spent, not the guesses.
    const withReal = await confirmPhoneVerification(actor, { code: real })
    expect(withReal.ok).toBe(false)

    const user = await getPrisma().user.findUnique({ where: { id: actor.userId ?? '' } })
    expect(user?.phoneVerifiedAt).toBeNull()
  }, 180_000)

  it('will not let one user confirm another user’s code', async () => {
    const owner = await signedInUser('otp-owner@example.com')
    const stranger = await signedInUser('otp-stranger@example.com')

    messages.length = 0
    await startPhoneVerification(owner, dial('0555 111 22 77'))
    const code = lastCode()

    const stolen = await confirmPhoneVerification(stranger, { code })
    expect(stolen.ok).toBe(false)

    const strangerRow = await getPrisma().user.findUnique({ where: { id: stranger.userId ?? '' } })
    expect(strangerRow?.phoneVerifiedAt).toBeNull()
  }, 180_000)

  it('requires a session', async () => {
    const result = await startPhoneVerification(anonymousActor(), dial('0555 111 22 88'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('FORBIDDEN')
  }, 30_000)

  it('clears an earlier verification when the number changes', async () => {
    // The old `phoneVerifiedAt` proved the *old* number. Keeping it would mean a user could
    // pass a phone gate on the strength of a number they no longer have.
    const actor = await signedInUser('otp-changed@example.com')
    messages.length = 0

    await startPhoneVerification(actor, dial('0555 111 33 11'))
    await confirmPhoneVerification(actor, { code: lastCode() })
    expect(
      (await getPrisma().user.findUnique({ where: { id: actor.userId ?? '' } }))?.phoneVerifiedAt,
    ).not.toBeNull()

    // Wait out the resend interval by rewriting the token's timestamp rather than sleeping
    // a minute: the interval is under test elsewhere, and this test is about the number.
    await getPrisma().authToken.updateMany({
      where: { userId: actor.userId ?? '', type: 'PHONE_OTP' },
      data: { createdAt: new Date(Date.now() - (OTP_RESEND_INTERVAL_SECONDS + 5) * 1000) },
    })

    await startPhoneVerification(actor, dial('0555 111 33 22'))

    const user = await getPrisma().user.findUnique({ where: { id: actor.userId ?? '' } })
    expect(user?.phone).toBe('+905551113322')
    expect(user?.phoneVerifiedAt).toBeNull()
  }, 180_000)
})
