import { describe, expect, it } from 'vitest'

import {
  TRANSITIONS,
  transition,
  type GuardContext,
  type OfferRequestEvent,
  type OfferRequestStatus,
  type TransitionActor,
} from './state-machine'

/**
 * `11` §Transition table, asserted edge by edge — plus the property that makes the table a
 * machine rather than a suggestion: everything off it is a `CONFLICT`.
 */

const NOW = new Date('2026-08-24T12:00:00Z')
const FUTURE = new Date('2026-08-25T12:00:00Z')
const PAST = new Date('2026-08-23T12:00:00Z')

function ctx(overrides: Partial<GuardContext> = {}): GuardContext {
  return { now: NOW, actor: 'manufacturer', slaExpiresAt: FUTURE, ...overrides }
}

const ALL_STATUSES: OfferRequestStatus[] = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
  'SURVEY_SCHEDULED',
  'SURVEY_COMPLETED',
  'OFFER_SENT',
  'OFFER_ACCEPTED',
  'OFFER_REJECTED',
  'WON',
  'LOST',
  'CLOSED',
]

const ALL_EVENTS: OfferRequestEvent[] = [
  'accept',
  'decline',
  'expire',
  'cancel',
  'schedule',
  'complete',
  'reschedule',
  'send_offer',
  'accept_offer',
  'reject_offer',
  'revise',
  'mark_won',
  'mark_lost',
  'close',
]

describe('the table itself', () => {
  it('keys every edge uniquely on (from, event) — order cannot change an answer', () => {
    const keys = TRANSITIONS.map((edge) => `${edge.from}→${edge.event}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('leaves the terminal states terminal: WON, LOST and CLOSED have no outgoing edge', () => {
    for (const from of ['WON', 'LOST', 'CLOSED'] as const) {
      expect(TRANSITIONS.filter((edge) => edge.from === from)).toEqual([])
    }
  })
})

describe('the happy paths of 11 §Transition table', () => {
  it('PENDING → accept → ACCEPTED, inside the SLA, by the manufacturer', () => {
    const result = transition('PENDING', 'accept', ctx())
    expect(result.ok && result.value).toBe('ACCEPTED')
  })

  it('PENDING → decline → DECLINED, with a reason', () => {
    const result = transition('PENDING', 'decline', ctx({ reason: 'Kapasite dolu' }))
    expect(result.ok && result.value).toBe('DECLINED')
  })

  it('PENDING → expire → EXPIRED, by the system, only after the deadline', () => {
    const result = transition('PENDING', 'expire', ctx({ actor: 'system', slaExpiresAt: PAST }))
    expect(result.ok && result.value).toBe('EXPIRED')
  })

  it('PENDING → cancel → CANCELLED, by the customer', () => {
    const result = transition('PENDING', 'cancel', ctx({ actor: 'customer' }))
    expect(result.ok && result.value).toBe('CANCELLED')
  })

  it('walks the long road: ACCEPTED → survey → offer → OFFER_ACCEPTED → WON', () => {
    expect(
      transition('ACCEPTED', 'schedule', ctx({ scheduledAt: FUTURE })).ok &&
        transition('SURVEY_SCHEDULED', 'complete', ctx({ appointmentScheduledAt: PAST })).ok &&
        transition(
          'SURVEY_COMPLETED',
          'send_offer',
          ctx({ offer: { lineCount: 2, validUntil: FUTURE, taxRateSet: true } }),
        ).ok &&
        transition(
          'OFFER_SENT',
          'accept_offer',
          ctx({ actor: 'customer', offerValidUntil: FUTURE }),
        ).ok &&
        transition('OFFER_ACCEPTED', 'mark_won', ctx()).ok,
    ).toBe(true)
  })

  it('lets an offer be sent straight from ACCEPTED — the survey is optional', () => {
    const result = transition(
      'ACCEPTED',
      'send_offer',
      ctx({ offer: { lineCount: 1, validUntil: FUTURE, taxRateSet: true } }),
    )
    expect(result.ok && result.value).toBe('OFFER_SENT')
  })

  it('revise keeps OFFER_SENT — superseded, never overwritten', () => {
    const result = transition(
      'OFFER_SENT',
      'revise',
      ctx({ offer: { lineCount: 1, validUntil: FUTURE, taxRateSet: true } }),
    )
    expect(result.ok && result.value).toBe('OFFER_SENT')
  })
})

describe('every illegal edge is a CONFLICT — 11: "Everything else is a CONFLICT error"', () => {
  it('answers CONFLICT for every (state, event) pair the table does not carry', () => {
    const legal = new Set(TRANSITIONS.map((edge) => `${edge.from}→${edge.event}`))
    // A permissive context, so what is being tested is the table, not a guard.
    const permissive = ctx({
      actor: 'manufacturer',
      reason: 'x',
      scheduledAt: FUTURE,
      appointmentScheduledAt: PAST,
      offer: { lineCount: 1, validUntil: FUTURE, taxRateSet: true },
      offerValidUntil: FUTURE,
    })

    let refused = 0
    for (const from of ALL_STATUSES) {
      for (const event of ALL_EVENTS) {
        if (legal.has(`${from}→${event}`)) continue
        for (const actor of ['customer', 'manufacturer', 'system', 'admin'] as const) {
          const result = transition(from, event, { ...permissive, actor })
          expect(result.ok, `${from} → ${event} (${actor}) must refuse`).toBe(false)
          if (!result.ok) expect(result.error.kind).toBe('CONFLICT')
          refused += 1
        }
      }
    }
    // The sweep covered something: 13 states × 14 events × 4 actors, minus the legal edges.
    expect(refused).toBeGreaterThan(600)
  })

  it('refuses a legal event fired by the wrong side', () => {
    const cases: Array<[OfferRequestStatus, OfferRequestEvent, TransitionActor]> = [
      ['PENDING', 'accept', 'customer'], // accepting your own request for them
      ['PENDING', 'cancel', 'manufacturer'], // cancelling the customer's request
      ['OFFER_SENT', 'accept_offer', 'manufacturer'], // accepting your own offer
      ['PENDING', 'expire', 'manufacturer'], // expiry belongs to the system job
    ]
    for (const [from, event, actor] of cases) {
      const result = transition(from, event, ctx({ actor, offerValidUntil: FUTURE }))
      expect(result.ok, `${from} → ${event} by ${actor}`).toBe(false)
      if (!result.ok) expect(result.error.kind).toBe('CONFLICT')
    }
  })
})

describe('guards', () => {
  it('refuses accept after the SLA has elapsed', () => {
    const result = transition('PENDING', 'accept', ctx({ slaExpiresAt: PAST }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('CONFLICT')
  })

  it('refuses expire before the SLA has elapsed', () => {
    const result = transition('PENDING', 'expire', ctx({ actor: 'system', slaExpiresAt: FUTURE }))
    expect(result.ok).toBe(false)
  })

  it('refuses decline and mark_lost without a reason', () => {
    expect(transition('PENDING', 'decline', ctx({ reason: '  ' })).ok).toBe(false)
    expect(transition('OFFER_REJECTED', 'mark_lost', ctx({ reason: null })).ok).toBe(false)
  })

  it('refuses a survey scheduled into the past, and a completion before the visit', () => {
    expect(transition('ACCEPTED', 'schedule', ctx({ scheduledAt: PAST })).ok).toBe(false)
    expect(
      transition('SURVEY_SCHEDULED', 'complete', ctx({ appointmentScheduledAt: FUTURE })).ok,
    ).toBe(false)
  })

  it('refuses an offer with no lines, no tax rate, or an expired validity', () => {
    for (const offer of [
      { lineCount: 0, validUntil: FUTURE, taxRateSet: true },
      { lineCount: 1, validUntil: FUTURE, taxRateSet: false },
      { lineCount: 1, validUntil: PAST, taxRateSet: true },
    ]) {
      expect(transition('ACCEPTED', 'send_offer', ctx({ offer })).ok, JSON.stringify(offer)).toBe(
        false,
      )
    }
  })

  it('refuses accepting an expired offer', () => {
    const result = transition(
      'OFFER_SENT',
      'accept_offer',
      ctx({ actor: 'customer', offerValidUntil: PAST }),
    )
    expect(result.ok).toBe(false)
  })
})
