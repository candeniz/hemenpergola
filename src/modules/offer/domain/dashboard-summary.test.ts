import { describe, expect, it } from 'vitest'

import { mostRecent, soonestDeadlines, summarise, type DashboardLead } from './dashboard-summary'
import type { OfferRequestStatus } from './state-machine'

/**
 * Task 13.8. The dashboard's counting, tested where it is pure.
 *
 * The property worth a test is the **cumulative funnel**: a `WON` request also passed
 * through `ACCEPTED`, so counting stages exclusively would show "accepted: 0" for a company
 * that closed everything — a bug that looks like data and would be believed.
 */

let sequence = 0
const lead = (status: OfferRequestStatus, offsets: { sla?: number; created?: number } = {}) => {
  sequence += 1
  return {
    offerRequestId: `ofr_${sequence}`,
    status,
    slaExpiresAt: new Date(Date.UTC(2026, 8, 1, offsets.sla ?? 12)),
    createdAt: new Date(Date.UTC(2026, 7, 1, offsets.created ?? 12)),
    areaM2: 20,
    cityName: 'İstanbul',
    districtName: null,
  } satisfies DashboardLead
}

describe('13.8 · dashboard summary', () => {
  it('counts each headline status exactly', () => {
    const { counts } = summarise([
      lead('PENDING'),
      lead('PENDING'),
      lead('ACCEPTED'),
      lead('SURVEY_SCHEDULED'),
      lead('SURVEY_COMPLETED'),
      lead('OFFER_SENT'),
      lead('WON'),
    ])

    expect(counts).toEqual({
      pending: 2,
      accepted: 1,
      // Both survey states are one thing to a person looking at a dashboard.
      surveyScheduled: 2,
      offerSent: 1,
      won: 1,
    })
  })

  it('is a CUMULATIVE funnel — a won request also reached accepted and offered', () => {
    const { funnel, total } = summarise([lead('WON')])
    expect(total).toBe(1)

    // Every stage is 1: the request passed through all of them.
    expect(funnel.map((row) => [row.stage, row.count, row.ofTotal])).toEqual([
      ['received', 1, 100],
      ['accepted', 1, 100],
      ['offered', 1, 100],
      ['won', 1, 100],
    ])
  })

  it('narrows honestly when requests stall', () => {
    const { funnel } = summarise([
      lead('PENDING'),
      lead('PENDING'),
      lead('DECLINED'),
      lead('ACCEPTED'),
      lead('WON'),
    ])

    // 5 received · 2 got past acceptance (ACCEPTED, WON) · 1 offered (WON) · 1 won.
    expect(funnel.map((row) => row.count)).toEqual([5, 2, 1, 1])
    expect(funnel.map((row) => row.ofTotal)).toEqual([100, 40, 20, 20])
  })

  it('divides by nothing safely', () => {
    const { funnel, total } = summarise([])
    expect(total).toBe(0)
    expect(funnel.every((row) => row.count === 0 && row.ofTotal === 0)).toBe(true)
  })

  it('a declined request counts as received and no further', () => {
    const { funnel } = summarise([lead('DECLINED'), lead('EXPIRED')])
    expect(funnel.map((row) => row.count)).toEqual([2, 0, 0, 0])
  })

  describe('soonestDeadlines', () => {
    it('is PENDING only, soonest first', () => {
      const late = lead('PENDING', { sla: 20 })
      const soon = lead('PENDING', { sla: 6 })
      const accepted = lead('ACCEPTED', { sla: 1 })

      const found = soonestDeadlines([late, accepted, soon])
      // The accepted one has the earliest clock and is still excluded: the SLA it was
      // measured against has already been met (`11` §SLA).
      expect(found.map((row) => row.offerRequestId)).toEqual([
        soon.offerRequestId,
        late.offerRequestId,
      ])
    })

    it('does not reorder the caller’s array', () => {
      const leads = [lead('PENDING', { sla: 20 }), lead('PENDING', { sla: 6 })]
      const before = leads.map((row) => row.offerRequestId)
      soonestDeadlines(leads)
      expect(leads.map((row) => row.offerRequestId)).toEqual(before)
    })

    it('truncates', () => {
      const many = Array.from({ length: 9 }, (_, index) => lead('PENDING', { sla: index }))
      expect(soonestDeadlines(many)).toHaveLength(5)
      expect(soonestDeadlines(many, 2)).toHaveLength(2)
    })
  })

  describe('mostRecent', () => {
    it('is newest first, whatever the status', () => {
      const old = lead('WON', { created: 1 })
      const fresh = lead('PENDING', { created: 23 })
      expect(mostRecent([old, fresh]).map((row) => row.offerRequestId)).toEqual([
        fresh.offerRequestId,
        old.offerRequestId,
      ])
    })
  })
})
