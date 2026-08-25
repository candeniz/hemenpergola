import { t, type Locale } from '../i18n'

/**
 * API status (UPPER_SNAKE, `11`'s vocabulary) → the shared `status.*` catalogue keys the
 * web has rendered since Phase 6. One map, so a status the machine adds and this misses
 * renders as its own key path — loud, per the resolver's deliberate failure mode.
 */
const STATUS_KEYS: Record<string, string> = {
  PENDING: 'status.pending',
  ACCEPTED: 'status.accepted',
  SURVEY_SCHEDULED: 'status.surveyScheduled',
  SURVEY_COMPLETED: 'status.surveyCompleted',
  OFFER_SENT: 'status.offerSent',
  OFFER_ACCEPTED: 'status.offerAccepted',
  OFFER_REJECTED: 'status.offerRejected',
  WON: 'status.won',
  LOST: 'status.lost',
  DECLINED: 'status.declined',
  EXPIRED: 'status.expired',
  CANCELLED: 'status.cancelled',
  CLOSED: 'status.closed',
}

export function statusLabel(locale: Locale, status: string): string {
  return t(locale, STATUS_KEYS[status] ?? `status.${status}`)
}
