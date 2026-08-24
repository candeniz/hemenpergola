import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  toAcceptedLead,
  toPendingLead,
  type AcceptedLeadView,
  type LeadProject,
  type NoContactFields,
  type PendingLeadView,
} from './lead-dto'

/**
 * Task 6.5 as a **compile-time** property — the same construction, and the same argument,
 * as `estimate-dto.test.ts`: a runtime test proves today's payload is clean; only the type
 * proves tomorrow's must be. These assertions fail `pnpm typecheck`, a pipeline stage, so a
 * `PENDING` DTO that grows a phone number cannot reach a runner at all.
 *
 * Deliberately about the DTO's shape and not about a rendered page: a page test stays
 * green while the JSON underneath it carries a phone number — which is exactly the failure
 * `26` warns about.
 */

const PROJECT: LeadProject = {
  projectId: 'prj_1',
  productId: 'prd_1',
  widthMm: 5000,
  depthMm: 4000,
  heightMm: 2800,
  areaM2: 20,
  quantity: 1,
  cityName: 'İstanbul',
  districtName: 'Kadıköy',
  timing: 'ASAP',
  selectedOptionIds: ['opt_1'],
}

describe('the pending type cannot carry contact data', () => {
  it('rejects every contact-shaped key at compile time', () => {
    expectTypeOf<NoContactFields<{ phone: string }>['phone']>().toEqualTypeOf<never>()
    expectTypeOf<NoContactFields<{ email: string }>['email']>().toEqualTypeOf<never>()
    expectTypeOf<NoContactFields<{ fullName: string }>['fullName']>().toEqualTypeOf<never>()
    expectTypeOf<NoContactFields<{ addressNote: string }>['addressNote']>().toEqualTypeOf<never>()
    expectTypeOf<
      NoContactFields<{ contact: { phone: string } }>['contact']
    >().toEqualTypeOf<never>()
  })

  it('has no contact block on PendingLeadView itself', () => {
    expectTypeOf<PendingLeadView>().not.toHaveProperty('contact')
    expectTypeOf<PendingLeadView>().not.toHaveProperty('email')
    expectTypeOf<PendingLeadView>().not.toHaveProperty('phone')
  })

  it('does not let an AcceptedLeadView stand in for a PendingLeadView', () => {
    // Structurally incompatible, so a shared handler cannot return the wrong one.
    expectTypeOf<AcceptedLeadView>().not.toMatchTypeOf<PendingLeadView>()
  })

  it('keeps the project block itself contact-free — the exact address never rides along', () => {
    expectTypeOf<PendingLeadView['project']>().not.toHaveProperty('addressNote')
    expectTypeOf<PendingLeadView['project']>().not.toHaveProperty('addressLine')
  })

  it('treats the free-text note as contact data before acceptance — ADR-026', () => {
    // Customers write phone numbers and street directions into free text; scrubbing was
    // rejected as unwinnable, so the field itself crosses with the disclosure.
    expectTypeOf<NoContactFields<{ note: string }>['note']>().toEqualTypeOf<never>()
    expectTypeOf<PendingLeadView['project']>().not.toHaveProperty('note')
  })
})

describe('the builders', () => {
  it('builds a pending view with the exact key set — nothing extra can arrive unnoticed', () => {
    const pending = toPendingLead({
      offerRequestId: 'req_1',
      status: 'PENDING',
      slaExpiresAt: new Date('2026-08-26T12:00:00Z'),
      createdAt: new Date('2026-08-24T12:00:00Z'),
      project: PROJECT,
    })

    expect(Object.keys(pending).sort()).toEqual([
      'createdAt',
      'kind',
      'offerRequestId',
      'project',
      'slaExpiresAt',
      'status',
    ])
    expect(pending.kind).toBe('pending')
  })

  it('builds an accepted view whose contact block is the disclosure, not a superset of it', () => {
    const accepted = toAcceptedLead({
      offerRequestId: 'req_1',
      status: 'ACCEPTED',
      slaExpiresAt: new Date('2026-08-26T12:00:00Z'),
      createdAt: new Date('2026-08-24T12:00:00Z'),
      contactDisclosedAt: new Date('2026-08-24T13:00:00Z'),
      project: PROJECT,
      contact: { fullName: 'Ayşe Demir', email: 'ayse@example.com', phone: '+905551112233' },
      customerNote: 'Bahçe kapısından girin.',
    })

    expect(Object.keys(accepted.contact).sort()).toEqual(['email', 'fullName', 'phone'])
    expect(accepted.kind).toBe('accepted')
  })
})
