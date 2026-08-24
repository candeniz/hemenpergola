import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runNotificationDispatch } from '@/modules/notification/infrastructure/dispatch-job'
import { logMailer, setMailer, type Email } from '@/modules/notification/infrastructure/mailer'
import { notify } from '@/modules/notification/infrastructure/notify'
import {
  logSmsSender,
  setSmsSender,
  type Sms,
} from '@/modules/notification/infrastructure/sms-sender'
import { setNotificationPreference } from '@/modules/notification/application/preference-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { ensureQueues } from '@/shared/jobs'

import { getPrisma } from './setup'

/**
 * `notification.dispatch` against a real database — task 7.1.
 *
 * The property under test is **at-most-once**: a dispatch that runs twice is two emails,
 * and a sent email cannot be unsent, so the row is claimed (`dispatchedAt`) in a committed
 * transaction BEFORE any channel sends. The suite proves both halves of the trade:
 * a second run sends nothing, and a crash *after* the claim also sends nothing on retry —
 * the failure mode is a rare lost email, never a duplicated one.
 */

const sentMail: Email[] = []
const sentSms: Sms[] = []

let userId = ''

const userActor = (): ActorContext =>
  anonymousActor({ userId, globalRole: 'CUSTOMER', ip: '203.0.113.77' })

async function notified(
  type: Parameters<typeof notify>[0]['type'],
  payload: Record<string, unknown>,
): Promise<string> {
  const result = await notify({ userId, type, payload })
  expect(result.notificationId).not.toBeNull()
  return result.notificationId ?? ''
}

beforeAll(async () => {
  setMailer({
    name: 'recording',
    async send(email) {
      sentMail.push(email)
    },
  })
  setSmsSender({
    name: 'recording',
    async send(sms) {
      sentSms.push(sms)
    },
  })

  await ensureQueues()

  const user = await getPrisma().user.create({
    data: {
      email: 'dispatch-customer@example.com',
      fullName: 'Dispatch Customer',
      phone: '+905551110099',
      locale: 'tr',
    },
  })
  userId = user.id
}, 120_000)

afterAll(() => {
  setMailer(logMailer)
  setSmsSender(logSmsSender)
})

describe('notification.dispatch · idempotent (claim-then-send)', () => {
  it('sends exactly one email however many times the job runs', async () => {
    const id = await notified('offer_received', {
      companyName: 'Ege Pergola',
      validUntil: '7 Eylül 2026',
    })

    const before = sentMail.length
    const first = await runNotificationDispatch(id)
    expect(first.status).toBe('dispatched')
    expect(sentMail.length).toBe(before + 1)
    expect(sentMail.at(-1)?.to).toBe('dispatch-customer@example.com')
    expect(sentMail.at(-1)?.subject.length).toBeGreaterThan(0)

    // The drained-worker replay: same job, same payload, run again.
    const second = await runNotificationDispatch(id)
    expect(second.status).toBe('already-dispatched')
    expect(sentMail.length).toBe(before + 1)
  }, 60_000)

  it('claims before sending, so a crash mid-send never duplicates on retry', async () => {
    const id = await notified('offer_revised', { companyName: 'Ege Pergola' })

    // A mailer that dies AFTER the claim committed — the crash window the design chose.
    setMailer({
      name: 'exploding',
      async send() {
        throw new Error('smtp fell over mid-send')
      },
    })
    await expect(runNotificationDispatch(id)).rejects.toThrow('smtp fell over')

    // Restore the recorder; the retry finds the stamp and sends NOTHING. At-most-once:
    // the lost email is the accepted failure mode, the duplicate is not.
    setMailer({
      name: 'recording',
      async send(email) {
        sentMail.push(email)
      },
    })
    const before = sentMail.length
    const retry = await runNotificationDispatch(id)
    expect(retry.status).toBe('already-dispatched')
    expect(sentMail.length).toBe(before)

    const row = await getPrisma().notification.findUniqueOrThrow({ where: { id } })
    expect(row.dispatchedAt).not.toBeNull()
  }, 60_000)
})

describe('preferences at dispatch (ADR-027)', () => {
  it('suppresses email when the user opted out — the in-app row stays', async () => {
    const set = await setNotificationPreference(userActor(), {
      channel: 'email',
      type: 'offer_request_declined',
      enabled: false,
    })
    expect(set.ok).toBe(true)

    const id = await notified('offer_request_declined', { companyName: 'Ege Pergola' })
    const before = sentMail.length
    const outcome = await runNotificationDispatch(id)

    expect(outcome.status).toBe('dispatched')
    if (outcome.status === 'dispatched') {
      expect(outcome.channels).toEqual(['in_app'])
    }
    expect(sentMail.length).toBe(before)

    const row = await getPrisma().notification.findUniqueOrThrow({ where: { id } })
    expect(row.dispatchedAt).not.toBeNull()
  }, 60_000)

  it('refuses to switch a mandatory event off at the write', async () => {
    const refused = await setNotificationPreference(userActor(), {
      channel: 'email',
      type: 'contact_disclosed',
      enabled: false,
    })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error.kind).toBe('PRECONDITION')
  })

  it('ignores a preference row for a mandatory event at dispatch — belt and braces', async () => {
    // The service refuses this row; plant it directly, as a legacy/hostile row would be.
    await getPrisma().notificationPreference.create({
      data: { userId, channel: 'email', type: 'contact_disclosed', enabled: false },
    })

    const id = await notified('contact_disclosed', { companyName: 'Ege Pergola' })
    const before = sentMail.length
    const outcome = await runNotificationDispatch(id)

    expect(outcome.status).toBe('dispatched')
    expect(sentMail.length).toBe(before + 1)
    expect(sentMail.at(-1)?.text).toContain('paylaşımın kaydıdır')
  }, 60_000)

  it('delivers a mandatory event at-least-once: a crash mid-send re-sends on retry', async () => {
    // The mirror of the at-most-once test above. For `contact_disclosed` the stamp lands
    // AFTER the send, so the crashed run leaves `dispatchedAt` null and the retry sends —
    // losing the disclosure notice is the KVKK failure, a duplicate is harmless.
    const id = await notified('contact_disclosed', { companyName: 'Marmara Cam' })

    setMailer({
      name: 'exploding',
      async send() {
        throw new Error('smtp fell over mid-send')
      },
    })
    await expect(runNotificationDispatch(id)).rejects.toThrow('smtp fell over')

    // The crash left the row UNSTAMPED — that is the whole design.
    const crashed = await getPrisma().notification.findUniqueOrThrow({ where: { id } })
    expect(crashed.dispatchedAt).toBeNull()

    setMailer({
      name: 'recording',
      async send(email) {
        sentMail.push(email)
      },
    })
    const before = sentMail.length
    const retry = await runNotificationDispatch(id)
    expect(retry.status).toBe('dispatched')
    expect(sentMail.length).toBe(before + 1)

    const done = await getPrisma().notification.findUniqueOrThrow({ where: { id } })
    expect(done.dispatchedAt).not.toBeNull()

    // And once stamped, a further replay sends nothing — both modes converge after success.
    const third = await runNotificationDispatch(id)
    expect(third.status).toBe('already-dispatched')
    expect(sentMail.length).toBe(before + 1)
  }, 60_000)
})

describe('sms channel · log adapter smoke', () => {
  it('hands the rendered sms to the SmsSender port for an sms-granted event', async () => {
    // The port and the template are real; the adapter is the log one until Q2/Q3 clear.
    // This is a smoke test of the seam, not a claim that SMS delivery works.
    const id = await notified('offer_request_received', { cityName: 'İzmir', areaM2: 24 })

    const before = sentSms.length
    const outcome = await runNotificationDispatch(id)

    expect(outcome.status).toBe('dispatched')
    if (outcome.status === 'dispatched') {
      expect(outcome.channels).toContain('sms')
    }
    expect(sentSms.length).toBe(before + 1)
    expect(sentSms.at(-1)?.to).toBe('+905551110099')
    expect(sentSms.at(-1)?.text).toContain('İzmir')
  }, 60_000)
})

describe('subscriptions and dedupe', () => {
  it('stamps a subscription row at write time and never sends for it', async () => {
    const result = await notify({
      userId,
      type: 'supply_gap_watch',
      payload: { projectId: 'sub-probe' },
    })
    const row = await getPrisma().notification.findUniqueOrThrow({
      where: { id: result.notificationId ?? '' },
    })
    expect(row.dispatchedAt).not.toBeNull()

    const before = sentMail.length
    const outcome = await runNotificationDispatch(row.id)
    expect(outcome.status).toBe('already-dispatched')
    expect(sentMail.length).toBe(before)
  }, 60_000)

  it('dedupes on ALL given conditions, not any one of them', async () => {
    // The 7.1 near-miss: reminders dedupe on (offerRequestId AND kind). A dedupe on kind
    // alone would silence request B's reminder because request A already sent one.
    const first = await notify({
      userId,
      type: 'offer_request_sla_reminder',
      payload: { offerRequestId: 'req-A', kind: 'reminder_50', hoursLeft: 24 },
      dedupeOn: [
        { path: ['offerRequestId'], equals: 'req-A' },
        { path: ['kind'], equals: 'reminder_50' },
      ],
    })
    const replay = await notify({
      userId,
      type: 'offer_request_sla_reminder',
      payload: { offerRequestId: 'req-A', kind: 'reminder_50', hoursLeft: 24 },
      dedupeOn: [
        { path: ['offerRequestId'], equals: 'req-A' },
        { path: ['kind'], equals: 'reminder_50' },
      ],
    })
    const otherRequest = await notify({
      userId,
      type: 'offer_request_sla_reminder',
      payload: { offerRequestId: 'req-B', kind: 'reminder_50', hoursLeft: 24 },
      dedupeOn: [
        { path: ['offerRequestId'], equals: 'req-B' },
        { path: ['kind'], equals: 'reminder_50' },
      ],
    })

    expect(first.deduped).toBe(false)
    expect(replay.deduped).toBe(true)
    expect(replay.notificationId).toBe(first.notificationId)
    expect(otherRequest.deduped).toBe(false)
    expect(otherRequest.notificationId).not.toBe(first.notificationId)
  }, 60_000)
})
