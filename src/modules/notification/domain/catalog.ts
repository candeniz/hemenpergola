/**
 * The notification catalogue — `13-notifications.md` §Event catalogue, as a **closed
 * list**. Task 7.1, and the phase gate hangs on it: `21` says *"every event fires with a
 * rendered `tr` template"*, and this file is what makes that a compile-time property —
 * `notification-templates.ts` maps `Record<NotificationEventType, …>`, so an event added
 * here without a template fails `pnpm typecheck` before any test runs.
 *
 * `notify()` (`infrastructure/notify.ts`) is the only writer of `Notification` rows and
 * takes its `type` from this union; the catalogue test scans the source tree to keep that
 * true. `13`'s `auth.*` family is deliberately not here: those are direct security emails
 * (`domain/templates.ts`), never `Notification` rows, and they ignore preferences by
 * construction.
 *
 * ## Mandatory events (`ADR-027`)
 *
 * `13`: *"Security and legal notices ignore preferences."* The catalogue spells out which:
 * `MANDATORY_EVENTS` below is a closed, pinned list. `contact_disclosed` is there because
 * the notification IS part of the disclosure's legal record — `19` §Disclosure and
 * `CLAUDE.md` non-negotiable 8 count it among the four things that make a disclosure
 * lawful, and a preference row must not be able to switch a legal obligation off.
 * Everything else is convenience and opts out per (channel, type).
 */

export type NotificationChannel = 'in_app' | 'push' | 'email' | 'sms'

export type NotificationEventEntry = {
  /**
   * `event` rows render and send. `subscription` rows are standing intent (the zero-result
   * watch) — stored in the same table, never dispatched, no template owed.
   */
  kind: 'event' | 'subscription'
  /** Who receives it — documentation, not dispatch logic (the row's userId decides). */
  audience: 'customer' | 'manufacturer' | 'both'
  channels: readonly NotificationChannel[]
  /**
   * A payload with every placeholder the templates use — the gate test renders each
   * template with this and fails on any `{hole}` left over.
   */
  sample: Record<string, string | number>
}

export const NOTIFICATION_EVENTS = {
  // ── offer request lifecycle (`13` rows 1–5) ────────────────────────────────
  offer_request_created: {
    kind: 'event',
    audience: 'customer',
    channels: ['in_app', 'push', 'email'],
    sample: { companyCount: 2 },
  },
  offer_request_received: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push', 'email', 'sms'],
    sample: { cityName: 'İstanbul', areaM2: 20 },
  },
  offer_request_sla_reminder: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push', 'email'],
    sample: { hoursLeft: 24 },
  },
  contact_disclosed: {
    kind: 'event',
    audience: 'customer',
    channels: ['in_app', 'push', 'email', 'sms'],
    sample: { companyName: 'Ege Pergola' },
  },
  offer_request_declined: {
    kind: 'event',
    audience: 'customer',
    channels: ['in_app', 'push', 'email'],
    sample: { companyName: 'Ege Pergola' },
  },
  offer_request_expired: {
    kind: 'event',
    audience: 'both',
    channels: ['in_app', 'push', 'email'],
    sample: { companyName: 'Ege Pergola' },
  },
  // ── appointments (`13` rows 6–7) ───────────────────────────────────────────
  survey_scheduled: {
    kind: 'event',
    audience: 'both',
    channels: ['in_app', 'push', 'email'],
    sample: { when: '26 Ağustos 2026 14:00' },
  },
  appointment_reminder: {
    kind: 'event',
    audience: 'both',
    channels: ['in_app', 'push', 'sms'],
    sample: { when: '26 Ağustos 2026 14:00' },
  },
  // ── offers (`13` rows 8–10) ────────────────────────────────────────────────
  offer_received: {
    kind: 'event',
    audience: 'customer',
    channels: ['in_app', 'push', 'email', 'sms'],
    sample: { companyName: 'Ege Pergola', validUntil: '7 Eylül 2026' },
  },
  offer_revised: {
    kind: 'event',
    audience: 'customer',
    channels: ['in_app', 'push', 'email'],
    sample: { companyName: 'Ege Pergola' },
  },
  offer_expiring: {
    kind: 'event',
    audience: 'both',
    channels: ['in_app', 'push', 'email'],
    sample: { companyName: 'Ege Pergola', validUntil: '7 Eylül 2026' },
  },
  offer_accepted: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push', 'email', 'sms'],
    sample: { offerNumber: 'EGE-2026-0002' },
  },
  offer_rejected: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push', 'email'],
    sample: { offerNumber: 'EGE-2026-0002' },
  },
  // ── communication and trust (`13` rows 11–13; triggers land in 7.2) ────────
  message_received: {
    kind: 'event',
    audience: 'both',
    channels: ['in_app', 'push'],
    sample: { senderName: 'Ege Pergola' },
  },
  review_published: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push', 'email'],
    sample: { rating: 5 },
  },
  review_responded: {
    kind: 'event',
    audience: 'customer',
    channels: ['in_app', 'push', 'email'],
    sample: { companyName: 'Ege Pergola' },
  },
  // `16` §Moderation: "REJECTED (reason, notified)" — the customer learns why, with the
  // narrow published grounds, rather than watching a review vanish.
  review_rejected: {
    kind: 'event',
    audience: 'customer',
    channels: ['in_app', 'push', 'email'],
    sample: { reason: 'Üçüncü kişilere ait kişisel veri içeriyor' },
  },
  // ── platform (`13` rows 14–15) ─────────────────────────────────────────────
  // in_app only: the verification decision's EMAIL is a direct send from the admin
  // service (Phase 2's templates.ts path, preference-exempt) — dispatching email here too
  // would double it. The row is the in-app record Phase 9's trigger scan demanded.
  company_verified: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push'],
    sample: { companyName: 'Ege Pergola' },
  },
  company_rejected: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push'],
    sample: { companyName: 'Ege Pergola', reason: 'Vergi levhası okunaklı değil' },
  },
  price_book_published: {
    kind: 'event',
    audience: 'manufacturer',
    channels: ['in_app', 'push'],
    sample: { version: 2 },
  },
  // ── standing intents, not events ───────────────────────────────────────────
  supply_gap_watch: {
    kind: 'subscription',
    audience: 'customer',
    channels: [],
    sample: {},
  },
} as const satisfies Record<string, NotificationEventEntry>

export type NotificationType = keyof typeof NOTIFICATION_EVENTS

export const ALL_NOTIFICATION_TYPES = Object.keys(NOTIFICATION_EVENTS) as NotificationType[]

/**
 * `ADR-027` — the events no preference row can switch off, CLOSED and pinned by test.
 * In-app is never suppressed for anything (`13`: it is the history); this list is about
 * email/SMS. One entry, on purpose: the disclosure notification is a leg of the legal
 * record, not a courtesy.
 */
export const MANDATORY_EVENTS: readonly NotificationType[] = ['contact_disclosed']

export function isMandatory(type: NotificationType): boolean {
  return MANDATORY_EVENTS.includes(type)
}
