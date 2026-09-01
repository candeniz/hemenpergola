import type { OfferRequestStatus } from './state-machine'

/**
 * The portal dashboard's arithmetic — task 13.8, `manufacturer_portal_dashboard_final`.
 *
 * Pure: it takes the leads the inbox already returns and counts them. **No new service
 * method and no new table**, which is the constraint the task set and also the honest one —
 * every number here is a fact the system already holds, and a dashboard that needed new
 * capability would be a feature wearing a summary's clothes.
 *
 * ## What the design shows that this cannot
 *
 * The Stitch screen carries trend deltas ("+3 this week", "+12% MoM") and a "Download
 * Report" button. Both need a **history** — a snapshot per period — and nothing stores one:
 * `OfferRequest` has `createdAt` and a current status, so "how many were pending last
 * Tuesday" is not answerable, only guessable. A number that looks measured and is guessed is
 * worse than no number. Omitted, and recorded with the rest in `25` §Faz 13.8.
 *
 * The design's "Recent Requests" table also lists a **client name** per row. This one does
 * not, and that is not a shortcut: `ADR-006` and `19` §Disclosure make contact data
 * something a manufacturer receives *on acceptance*, with a `ContactDisclosure` row, an
 * audit entry and a notification behind it. A dashboard is not that event. Rows carry the
 * city and the area instead — what the pending lead DTO already permits.
 */

export type DashboardLead = {
  offerRequestId: string
  status: OfferRequestStatus
  slaExpiresAt: Date
  createdAt: Date
  areaM2: number | null
  cityName: string | null
  districtName: string | null
}

/**
 * The five headline counts, and the funnel underneath them.
 *
 * The stages are cumulative on purpose — a request that is `WON` also passed through
 * `ACCEPTED` — because that is what a conversion funnel means. Counting them exclusively
 * would show "accepted: 0" for a company that closed everything, which reads as a bug.
 */
export type DashboardSummary = {
  counts: {
    pending: number
    accepted: number
    surveyScheduled: number
    offerSent: number
    won: number
  }
  funnel: { stage: FunnelStage; count: number; ofTotal: number }[]
  total: number
}

export type FunnelStage = 'received' | 'accepted' | 'offered' | 'won'

/** Which statuses mean a request has *reached at least* each stage. */
const REACHED: Record<FunnelStage, readonly OfferRequestStatus[]> = {
  received: [
    'PENDING',
    'ACCEPTED',
    'SURVEY_SCHEDULED',
    'SURVEY_COMPLETED',
    'OFFER_SENT',
    'OFFER_ACCEPTED',
    'OFFER_REJECTED',
    'WON',
    'LOST',
    'DECLINED',
    'EXPIRED',
    'CANCELLED',
    'CLOSED',
  ],
  accepted: [
    'ACCEPTED',
    'SURVEY_SCHEDULED',
    'SURVEY_COMPLETED',
    'OFFER_SENT',
    'OFFER_ACCEPTED',
    'OFFER_REJECTED',
    'WON',
    'LOST',
    'CLOSED',
  ],
  offered: ['OFFER_SENT', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'WON', 'LOST', 'CLOSED'],
  won: ['WON'],
}

export const FUNNEL_STAGES = ['received', 'accepted', 'offered', 'won'] as const

export function summarise(leads: readonly DashboardLead[]): DashboardSummary {
  const has = (status: OfferRequestStatus): number =>
    leads.filter((lead) => lead.status === status).length

  const total = leads.length
  const funnel = FUNNEL_STAGES.map((stage) => {
    const count = leads.filter((lead) => REACHED[stage].includes(lead.status)).length
    return {
      stage,
      count,
      // Percent of everything that came in, rounded — the design's own reading.
      ofTotal: total === 0 ? 0 : Math.round((count / total) * 100),
    }
  })

  return {
    counts: {
      pending: has('PENDING'),
      accepted: has('ACCEPTED'),
      surveyScheduled: has('SURVEY_SCHEDULED') + has('SURVEY_COMPLETED'),
      offerSent: has('OFFER_SENT'),
      won: has('WON'),
    },
    funnel,
    total,
  }
}

/**
 * The leads whose answer clock runs out soonest — the design's "Pending Actions".
 *
 * `PENDING` only: once a request is accepted the SLA has been met and the clock stops
 * mattering (`11` §SLA). Sorted by how little time is left, because that is the order the
 * work has to be done in, and truncated because a dashboard that lists everything is a list.
 */
export function soonestDeadlines(
  leads: readonly DashboardLead[],
  limit = 5,
): readonly DashboardLead[] {
  // A copy before sorting: the caller's array is not ours to reorder. (`toSorted` would say
  // this in one word, but the repo's lib target predates it.)
  return [...leads]
    .filter((lead) => lead.status === 'PENDING')
    .sort((a, b) => a.slaExpiresAt.getTime() - b.slaExpiresAt.getTime())
    .slice(0, limit)
}

/** The most recent arrivals, whatever their status — the design's "Recent Requests". */
export function mostRecent(leads: readonly DashboardLead[], limit = 5): readonly DashboardLead[] {
  return [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit)
}
