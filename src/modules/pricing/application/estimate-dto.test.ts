import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Breakdown } from '../domain/engine'

import {
  toCustomerEstimate,
  unpricedEstimate,
  type CustomerEstimate,
  type NoLineItems,
  type OwnerEstimate,
} from './estimate-dto'

/**
 * `ADR-006` item 2 and `PRC-03` as a **compile-time** property.
 *
 * These assertions are the point of the file. A runtime test cannot prove "a customer payload
 * can never carry a line item" — it can only prove that today's payload does not. The type
 * assertions below fail `pnpm typecheck`, which is a pipeline stage, so the rule is enforced
 * before anything runs.
 */

const BREAKDOWN: Breakdown = {
  engineVersion: 1,
  priceBookVersion: 2,
  basis: 20,
  basisUnit: 'AREA_M2',
  quantity: 1,
  baseKurus: 20_000_00,
  options: [],
  optionsKurus: 0,
  setupKurus: 0,
  subtotalKurus: 20_000_00,
  rules: [],
  rulesKurus: 0,
  regional: { mode: 'FLAT', amountKurus: 0, matchedOn: null },
  regionalKurus: 0,
  preFloorKurus: 20_000_00,
  minProjectPriceKurus: 0,
  floorApplied: false,
  netKurus: 20_000_00,
  unpricedOptionIds: [],
}

const OWNER: OwnerEstimate = {
  companyId: 'cmp_1',
  netKurus: 20_000_00,
  bandLowKurus: 19_000_00,
  bandHighKurus: 21_000_00,
  breakdown: BREAKDOWN,
  incomplete: false,
  engineVersion: 1,
}

describe('the customer type cannot carry line items', () => {
  it('rejects a breakdown at compile time', () => {
    // `never` is the only thing assignable to a forbidden key, so no real value fits.
    expectTypeOf<NoLineItems<{ breakdown: Breakdown }>['breakdown']>().toEqualTypeOf<never>()
    expectTypeOf<NoLineItems<{ netKurus: number }>['netKurus']>().toEqualTypeOf<never>()
    expectTypeOf<NoLineItems<{ lineItems: string[] }>['lineItems']>().toEqualTypeOf<never>()
    expectTypeOf<
      NoLineItems<{ priceBookVersion: number }>['priceBookVersion']
    >().toEqualTypeOf<never>()
  })

  it('leaves permitted fields alone', () => {
    expectTypeOf<NoLineItems<{ bandLowKurus: number }>['bandLowKurus']>().toEqualTypeOf<number>()
    expectTypeOf<NoLineItems<{ companyId: string }>['companyId']>().toEqualTypeOf<string>()
  })

  it('does not let an OwnerEstimate stand in for a CustomerEstimate', () => {
    // The two are structurally incompatible, which is what stops a handler returning the
    // wrong one from a shared code path.
    expectTypeOf<OwnerEstimate>().not.toMatchTypeOf<CustomerEstimate>()
  })

  it('has no forbidden key on CustomerEstimate itself', () => {
    expectTypeOf<CustomerEstimate>().not.toHaveProperty('breakdown')
    expectTypeOf<CustomerEstimate>().not.toHaveProperty('netKurus')
  })
})

describe('toCustomerEstimate', () => {
  it('keeps the band and drops everything else', () => {
    const customer = toCustomerEstimate(OWNER, { priceOnRequest: false })

    expect(customer).toEqual({
      companyId: 'cmp_1',
      bandLowKurus: 19_000_00,
      bandHighKurus: 21_000_00,
      priceOnRequest: false,
      incomplete: false,
    })
    // Belt and braces: the runtime shape matches the type, so a future spread cannot widen it
    // without failing here as well as in `tsc`.
    expect(Object.keys(customer).sort()).toEqual([
      'bandHighKurus',
      'bandLowKurus',
      'companyId',
      'incomplete',
      'priceOnRequest',
    ])
  })

  it('withholds the band entirely for a priceOnRequest company', () => {
    // `ADR-006` item 4 and `PRC-06`: matchable, displayed without a number.
    const customer = toCustomerEstimate(OWNER, { priceOnRequest: true })
    expect(customer.bandLowKurus).toBeNull()
    expect(customer.bandHighKurus).toBeNull()
    expect(customer.priceOnRequest).toBe(true)
  })

  it('carries the incomplete flag through, because the caveat is the customer’s business', () => {
    const customer = toCustomerEstimate({ ...OWNER, incomplete: true }, { priceOnRequest: false })
    expect(customer.incomplete).toBe(true)
  })

  it('produces a bandless estimate for a company that cannot be priced', () => {
    expect(unpricedEstimate('cmp_2')).toEqual({
      companyId: 'cmp_2',
      bandLowKurus: null,
      bandHighKurus: null,
      priceOnRequest: true,
      incomplete: false,
    })
  })
})
