import { conflict, err, ok, type DomainError, type Result } from '@/shared/result'

/**
 * The offer-request state machine — `11-offer-request-lifecycle.md`, verbatim.
 *
 * **Pure**: no IO, no clock read (the caller passes `now` in the context), and the whole of
 * `11` §Transition table lives in one table below. The application service is the only
 * caller (`CLAUDE.md` non-negotiable 4: status changes go through the state machine, never
 * a direct `status` write), and it runs `transition` between a `FOR UPDATE` load and the
 * in-transaction side effects.
 *
 * Phase 4 wrote `Project.status` from two places and paid for it with two bugs;
 * `project/domain/status.ts` exists because of that. This is the same idea built big from
 * the start, for the machine the whole product hangs on: it owns when contact data is
 * disclosed and when money becomes a commitment.
 *
 * **Every edge not in the table is a `CONFLICT`** — including a legal event fired by the
 * wrong side (`accept` by a customer) and a legal pair blocked by a guard (`accept` after
 * the SLA). There is no admin override that skips a guard; an admin may `close` a stuck
 * request, with a reason, and that is all (`17-admin-system.md`).
 */

export type OfferRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SURVEY_SCHEDULED'
  | 'SURVEY_COMPLETED'
  | 'OFFER_SENT'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'WON'
  | 'LOST'
  | 'CLOSED'

export type OfferRequestEvent =
  | 'accept'
  | 'decline'
  | 'expire'
  | 'cancel'
  | 'schedule'
  | 'complete'
  | 'reschedule'
  | 'send_offer'
  | 'accept_offer'
  | 'reject_offer'
  | 'revise'
  | 'mark_won'
  | 'mark_lost'
  | 'close'

export type TransitionActor = 'customer' | 'manufacturer' | 'system' | 'admin'

/** Everything a guard may read. The caller supplies facts; the machine supplies judgement. */
export type GuardContext = {
  now: Date
  actor: TransitionActor
  slaExpiresAt: Date
  /** `decline` and `mark_lost` require one; `close` (admin) requires one too. */
  reason?: string | null
  /** `schedule` / `reschedule`. */
  scheduledAt?: Date | null
  /** `complete` reads the appointment being completed. */
  appointmentScheduledAt?: Date | null
  /** `send_offer`'s three guards, precomputed by the service (`11`). */
  offer?: { lineCount: number; validUntil: Date; taxRateSet: boolean } | null
  /** `accept_offer` must not accept an expired offer. */
  offerValidUntil?: Date | null
}

type Guard = (ctx: GuardContext) => DomainError | null

type Edge = {
  from: OfferRequestStatus
  event: OfferRequestEvent
  to: OfferRequestStatus
  /** Who may fire it — `11`'s Actor column. `either` is spelt as two rows. */
  actors: readonly TransitionActor[]
  guard?: Guard
}

const requireReason: Guard = (ctx) =>
  ctx.reason == null || ctx.reason.trim() === '' ? conflict('a reason is required') : null

/**
 * `11` §Transition table, row for row. Order is irrelevant — `(from, event)` is unique, and
 * the test suite asserts that so a duplicate row cannot make the answer depend on order.
 */
export const TRANSITIONS: readonly Edge[] = [
  {
    from: 'PENDING',
    event: 'accept',
    to: 'ACCEPTED',
    actors: ['manufacturer'],
    // "within SLA". The permission and the suspension check are the service's
    // (`authorize` + company status); the deadline is a fact about the row, so it is here.
    guard: (ctx) =>
      ctx.now.getTime() > ctx.slaExpiresAt.getTime()
        ? conflict('the SLA window has elapsed; the request can only expire')
        : null,
  },
  {
    from: 'PENDING',
    event: 'decline',
    to: 'DECLINED',
    actors: ['manufacturer'],
    guard: requireReason,
  },
  {
    from: 'PENDING',
    event: 'expire',
    to: 'EXPIRED',
    actors: ['system'],
    guard: (ctx) =>
      ctx.now.getTime() > ctx.slaExpiresAt.getTime()
        ? null
        : conflict('the SLA window has not elapsed'),
  },
  { from: 'PENDING', event: 'cancel', to: 'CANCELLED', actors: ['customer'] },
  {
    from: 'ACCEPTED',
    event: 'schedule',
    to: 'SURVEY_SCHEDULED',
    actors: ['manufacturer'],
    guard: (ctx) =>
      ctx.scheduledAt == null || ctx.scheduledAt.getTime() <= ctx.now.getTime()
        ? conflict('the survey must be scheduled in the future')
        : null,
  },
  {
    from: 'SURVEY_SCHEDULED',
    event: 'complete',
    to: 'SURVEY_COMPLETED',
    actors: ['manufacturer'],
    guard: (ctx) =>
      ctx.appointmentScheduledAt == null || ctx.appointmentScheduledAt.getTime() > ctx.now.getTime()
        ? conflict('a survey cannot be completed before it happens')
        : null,
  },
  {
    from: 'SURVEY_SCHEDULED',
    event: 'reschedule',
    to: 'SURVEY_SCHEDULED',
    actors: ['manufacturer', 'customer'],
    guard: (ctx) =>
      ctx.scheduledAt == null || ctx.scheduledAt.getTime() <= ctx.now.getTime()
        ? conflict('the survey must be rescheduled to the future')
        : null,
  },
  ...(['ACCEPTED', 'SURVEY_SCHEDULED', 'SURVEY_COMPLETED'] as const).map((from): Edge => ({
    from,
    event: 'send_offer',
    to: 'OFFER_SENT',
    actors: ['manufacturer'],
    guard: (ctx) => {
      if (ctx.offer == null) return conflict('an offer is required')
      if (ctx.offer.lineCount < 1) return conflict('an offer needs at least one line')
      if (!ctx.offer.taxRateSet) return conflict('an offer needs its tax rate set')
      if (ctx.offer.validUntil.getTime() <= ctx.now.getTime())
        return conflict('an offer must be valid into the future')
      return null
    },
  })),
  {
    from: 'OFFER_SENT',
    event: 'accept_offer',
    to: 'OFFER_ACCEPTED',
    actors: ['customer'],
    guard: (ctx) =>
      ctx.offerValidUntil == null || ctx.offerValidUntil.getTime() <= ctx.now.getTime()
        ? conflict('the offer has expired')
        : null,
  },
  { from: 'OFFER_SENT', event: 'reject_offer', to: 'OFFER_REJECTED', actors: ['customer'] },
  {
    from: 'OFFER_SENT',
    event: 'revise',
    to: 'OFFER_SENT',
    actors: ['manufacturer'],
    guard: (ctx) => {
      if (ctx.offer == null) return conflict('a revised offer is required')
      if (ctx.offer.lineCount < 1) return conflict('an offer needs at least one line')
      if (!ctx.offer.taxRateSet) return conflict('an offer needs its tax rate set')
      if (ctx.offer.validUntil.getTime() <= ctx.now.getTime())
        return conflict('an offer must be valid into the future')
      return null
    },
  },
  { from: 'OFFER_ACCEPTED', event: 'mark_won', to: 'WON', actors: ['manufacturer'] },
  {
    from: 'OFFER_ACCEPTED',
    event: 'mark_lost',
    to: 'LOST',
    actors: ['manufacturer'],
    guard: requireReason,
  },
  {
    from: 'OFFER_REJECTED',
    event: 'mark_lost',
    to: 'LOST',
    actors: ['manufacturer'],
    guard: requireReason,
  },
  /*
   * The one admin verb (`11`): a stuck terminal-adjacent request can be archived, with a
   * reason. Deliberately narrow — DECLINED / EXPIRED / CANCELLED only, the states `11`'s
   * table sends toward the CLOSED bucket.
   */
  { from: 'DECLINED', event: 'close', to: 'CLOSED', actors: ['admin'], guard: requireReason },
  { from: 'EXPIRED', event: 'close', to: 'CLOSED', actors: ['admin'], guard: requireReason },
  { from: 'CANCELLED', event: 'close', to: 'CLOSED', actors: ['admin'], guard: requireReason },
]

/**
 * The single entry point. Anything not in the table — wrong state, wrong event, wrong
 * actor — is a `CONFLICT`, and a guard that refuses is a `CONFLICT` too: the caller's
 * request was well-formed, the row's state simply does not allow it.
 */
export function transition(
  current: OfferRequestStatus,
  event: OfferRequestEvent,
  ctx: GuardContext,
): Result<OfferRequestStatus, DomainError> {
  const edge = TRANSITIONS.find((row) => row.from === current && row.event === event)

  if (edge === undefined) {
    return err(conflict(`no transition ${current} → ${event}`))
  }
  if (!edge.actors.includes(ctx.actor)) {
    return err(conflict(`${ctx.actor} may not ${event} a ${current} request`))
  }

  const refusal = edge.guard?.(ctx) ?? null
  if (refusal !== null) return err(refusal)

  return ok(edge.to)
}
