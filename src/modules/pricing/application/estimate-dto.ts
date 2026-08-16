import type { Breakdown } from '../domain/engine'

/**
 * The disclosure boundary for money — `ADR-006`, `PRC-03`.
 *
 * `ADR-006` item 2: *"The customer sees a rounded band, never line items."* That is a rule
 * about a **type**, not about a code review. A customer-facing payload that merely happens
 * not to include a breakdown today acquires one the first time somebody adds a field to a
 * shared view model and forgets which audience it reaches.
 *
 * So there are two types and the customer one is *provably* incapable of carrying a line
 * item: `NoLineItems<T>` makes any property named like a breakdown, a line item or an
 * internal amount a type error. `estimate-dto.test.ts` pins it with compile-time assertions,
 * because a constraint that is never exercised is a comment.
 */

/**
 * Property names that must never appear in something a customer receives. The check is by
 * name because that is what survives refactoring: a reviewer renaming `breakdown` to
 * `priceDetail` is exactly the case a structural check would miss.
 */
type ForbiddenKey =
  | 'breakdown'
  | 'lines'
  | 'lineItems'
  | 'items'
  | 'options'
  | 'rules'
  | 'netKurus'
  | 'baseKurus'
  | 'subtotalKurus'
  | 'optionsKurus'
  | 'rulesKurus'
  | 'regionalKurus'
  | 'setupKurus'
  | 'preFloorKurus'
  | 'minProjectPriceKurus'
  | 'basePriceKurus'
  | 'priceBookId'
  | 'priceBookVersion'

/**
 * `T` with a compile error on any forbidden key.
 *
 * The mechanism: a forbidden key is mapped to `never`, and no value satisfies `never`, so
 * the offending object cannot be assigned. The error lands on the property rather than on the
 * whole type, which is what makes it readable.
 */
export type NoLineItems<T> = {
  [K in keyof T]: K extends ForbiddenKey ? never : T[K]
}

/**
 * What a customer is allowed to see. `22` §Patterns' `EstimateBand` renders exactly this and
 * nothing else, which is why the component takes this type rather than a loose set of props.
 */
export type CustomerEstimate = NoLineItems<{
  companyId: string
  /** Null on a `priceOnRequest` company or one with no published book (`PRC-06`). */
  bandLowKurus: number | null
  bandHighKurus: number | null
  priceOnRequest: boolean
  /** True when an option had no price row: the band is shown with a caveat, not hidden. */
  incomplete: boolean
}>

/**
 * What the owning manufacturer and an admin see — `ADR-006` item 3. Same calculation, the
 * full breakdown, and it is a *separate type* so that handing one to a customer surface is a
 * type error rather than an oversight.
 */
export type OwnerEstimate = {
  companyId: string
  netKurus: number
  bandLowKurus: number
  bandHighKurus: number
  breakdown: Breakdown
  incomplete: boolean
  engineVersion: number
}

/**
 * The only supported way to turn an owner view into a customer view.
 *
 * A function rather than a spread at each call site: `PRC-03` is one rule, so it gets one
 * implementation, and adding a field to `OwnerEstimate` cannot leak it by default.
 */
export function toCustomerEstimate(
  estimate: OwnerEstimate,
  options: { priceOnRequest: boolean },
): CustomerEstimate {
  if (options.priceOnRequest) {
    return {
      companyId: estimate.companyId,
      bandLowKurus: null,
      bandHighKurus: null,
      priceOnRequest: true,
      incomplete: estimate.incomplete,
    }
  }

  return {
    companyId: estimate.companyId,
    bandLowKurus: estimate.bandLowKurus,
    bandHighKurus: estimate.bandHighKurus,
    priceOnRequest: false,
    incomplete: estimate.incomplete,
  }
}

/** A company that cannot be priced at all — no published book, or the product is not in it. */
export function unpricedEstimate(companyId: string): CustomerEstimate {
  return {
    companyId,
    bandLowKurus: null,
    bandHighKurus: null,
    priceOnRequest: true,
    incomplete: false,
  }
}
