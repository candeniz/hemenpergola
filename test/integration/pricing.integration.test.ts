import { beforeAll, describe, expect, it } from 'vitest'

import {
  createDraft,
  getPriceBook,
  listPriceBooks,
  publishPriceBook,
  savePriceBook,
} from '@/modules/pricing/application/price-book-service'
import {
  estimateForProject,
  simulatePriceBook,
} from '@/modules/pricing/application/simulate-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Price-book lifecycle and immutability — task 3.3, `08-pricing-engine.md` §Versioning.
 *
 * `20-testing-strategy.md` §Integration asks for one of these by name:
 * *"publishing a price book v2 does not alter any stored `PriceCalculation`."* It cannot be
 * written against a fake, because what is under test is that a real row, written under v1,
 * still reads back as v1 after the database has moved on.
 */

let companyId = ''
let otherCompanyId = ''
let productId = ''
let optionId = ''
let cityId = ''

async function owner(id: string): Promise<ActorContext> {
  return anonymousActor({
    userId: `usr_pricing_${id}`,
    globalRole: 'CUSTOMER',
    companyId: id,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.77',
  })
}

async function makeCompany(label: string): Promise<string> {
  const company = await getPrisma().company.create({
    data: {
      slug: `${label}-${Date.now()}-${Math.floor(performance.now())}`,
      legalName: `${label} A.Ş.`,
      displayName: label,
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })

  await getPrisma().user.upsert({
    where: { id: `usr_pricing_${company.id}` },
    create: { id: `usr_pricing_${company.id}`, email: `pricing-${company.id}@example.com` },
    update: {},
  })

  return company.id
}

beforeAll(async () => {
  companyId = await makeCompany('Fiyat')
  otherCompanyId = await makeCompany('Baska')

  const category = await getPrisma().category.create({ data: { sortOrder: 1 } })
  const product = await getPrisma().product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  productId = product.id

  const attribute = await getPrisma().productAttribute.create({
    data: { productId, key: 'motor', inputType: 'SELECT', affectsPrice: true },
  })
  const option = await getPrisma().productOption.create({
    data: { attributeId: attribute.id, value: 'motorised' },
  })
  optionId = option.id

  const city = await getPrisma().city.create({ data: { name: 'Kocaeli', plateCode: 941 } })
  cityId = city.id
}, 120_000)

/** A complete, publishable book: one product priced, one option, one region, one rule. */
async function fillDraft(actor: ActorContext, priceBookId: string, basePriceKurus: number) {
  return savePriceBook(actor, {
    companyId,
    priceBookId,
    note: null,
    items: [
      {
        productId,
        basePriceKurus,
        unit: 'PER_M2',
        minProjectPriceKurus: 10_000_00,
        setupFeeKurus: 2_500_00,
      },
    ],
    optionPrices: [{ optionId, mode: 'FLAT', valueKurus: 5_000_00, percent: null }],
    adjustments: [{ cityId, districtId: null, mode: 'FLAT', valueKurus: 10_000_00, percent: null }],
    rules: [
      {
        kind: 'AREA_DISCOUNT',
        thresholdMin: 50,
        thresholdMax: null,
        mode: 'PERCENT',
        valueKurus: null,
        percent: 5,
        note: 'volume',
      },
    ],
  })
}

describe('the lifecycle', () => {
  it('goes DRAFT → PUBLISHED, archiving the previous live book', async () => {
    const actor = await owner(companyId)

    const v1 = await createDraft(actor, { companyId })
    expect(v1.ok).toBe(true)
    if (!v1.ok) return

    await fillDraft(actor, v1.value.priceBookId, 4_000_00)
    const published = await publishPriceBook(actor, {
      companyId,
      priceBookId: v1.value.priceBookId,
    })

    expect(published.ok).toBe(true)
    if (!published.ok) return
    expect(published.value.archivedVersion).toBeNull()

    const v2 = await createDraft(actor, { companyId, fromPriceBookId: v1.value.priceBookId })
    expect(v2.ok).toBe(true)
    if (!v2.ok) return
    expect(v2.value.version).toBe(v1.value.version + 1)

    const secondPublish = await publishPriceBook(actor, {
      companyId,
      priceBookId: v2.value.priceBookId,
    })
    expect(secondPublish.ok).toBe(true)
    if (!secondPublish.ok) return
    expect(secondPublish.value.archivedVersion).toBe(v1.value.version)

    const books = await listPriceBooks(actor, { companyId })
    if (!books.ok) return
    const live = books.value.books.filter((book) => book.status === 'PUBLISHED')
    expect(live).toHaveLength(1)
    expect(live[0]?.version).toBe(v2.value.version)
  }, 120_000)

  it('carries every row across when a draft is cloned', async () => {
    // Cloning is how editing works, so a clone that dropped the rules would silently change
    // a manufacturer's prices at exactly the moment they thought they were preserving them.
    const id = await makeCompany('Kopya')
    const actor = await owner(id)

    const first = await createDraft(actor, { companyId: id })
    if (!first.ok) return

    await savePriceBook(actor, {
      companyId: id,
      priceBookId: first.value.priceBookId,
      note: 'ilk',
      items: [
        {
          productId,
          basePriceKurus: 3_000_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 0,
          setupFeeKurus: null,
        },
      ],
      optionPrices: [{ optionId, mode: 'PERCENT', valueKurus: null, percent: 12 }],
      adjustments: [{ cityId, districtId: null, mode: 'PERCENT', valueKurus: null, percent: 8 }],
      rules: [
        {
          kind: 'HEIGHT_SURCHARGE',
          thresholdMin: 4,
          thresholdMax: null,
          mode: 'PERCENT',
          valueKurus: null,
          percent: 3,
          note: 'tall',
        },
      ],
    })

    await publishPriceBook(actor, { companyId: id, priceBookId: first.value.priceBookId })

    const clone = await createDraft(actor, {
      companyId: id,
      fromPriceBookId: first.value.priceBookId,
    })
    if (!clone.ok) return

    const detail = await getPriceBook(actor, {
      companyId: id,
      priceBookId: clone.value.priceBookId,
    })
    if (!detail.ok) return

    expect(detail.value.items).toHaveLength(1)
    expect(detail.value.items[0]?.basePriceKurus).toBe(3_000_00)
    expect(detail.value.optionPrices[0]?.percent).toBe(12)
    expect(detail.value.adjustments[0]?.percent).toBe(8)
    expect(detail.value.rules[0]?.kind).toBe('HEIGHT_SURCHARGE')
    expect(detail.value.rules[0]?.thresholdMin).toBe(4)
  }, 120_000)

  it('refuses to edit a published book', async () => {
    const id = await makeCompany('Kilitli')
    const actor = await owner(id)

    const draft = await createDraft(actor, { companyId: id })
    if (!draft.ok) return

    await savePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      note: null,
      items: [
        {
          productId,
          basePriceKurus: 1_000_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 0,
          setupFeeKurus: null,
        },
      ],
      optionPrices: [],
      adjustments: [],
      rules: [],
    })
    await publishPriceBook(actor, { companyId: id, priceBookId: draft.value.priceBookId })

    const attempt = await savePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      note: 'sneaky',
      items: [
        {
          productId,
          basePriceKurus: 1,
          unit: 'PER_M2',
          minProjectPriceKurus: 0,
          setupFeeKurus: null,
        },
      ],
      optionPrices: [],
      adjustments: [],
      rules: [],
    })

    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    expect(attempt.error.kind).toBe('PRECONDITION')
  }, 120_000)

  it('refuses to publish a book with no priced product', async () => {
    // Publishing an empty book would make the company "priced" for `09`'s ranking while every
    // estimate came back unpriced — worse than no book, which at least ranks honestly.
    const id = await makeCompany('Bos')
    const actor = await owner(id)

    const draft = await createDraft(actor, { companyId: id })
    if (!draft.ok) return

    const attempt = await publishPriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
    })
    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    expect(attempt.error.kind).toBe('PRECONDITION')
  }, 120_000)

  it('allows only one draft at a time', async () => {
    const id = await makeCompany('TekTaslak')
    const actor = await owner(id)

    await createDraft(actor, { companyId: id })
    const second = await createDraft(actor, { companyId: id })

    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.kind).toBe('CONFLICT')
  }, 120_000)

  it('keeps one published book per company, enforced by the database', async () => {
    /*
     * The partial unique index from migration 5. Asserted against raw SQL rather than through
     * the service, because the service's ordering is exactly what the index exists to survive
     * — two tabs publishing at once do not take turns.
     */
    const id = await makeCompany('Tekil')
    const draftA = await getPrisma().priceBook.create({
      data: { companyId: id, version: 1, status: 'PUBLISHED' },
    })
    expect(draftA.id).toBeTruthy()

    await expect(
      getPrisma().priceBook.create({
        data: { companyId: id, version: 2, status: 'PUBLISHED' },
      }),
    ).rejects.toThrow()
  }, 120_000)
})

describe('immutability of stored calculations', () => {
  it('publishing v2 does not alter any stored PriceCalculation', async () => {
    /*
     * The assertion `20` §Integration names. A calculation is written against v1, then v2 is
     * published at a different base price; the stored row must still hold v1's number and
     * v1's version. `PRC-02` makes the table append-only, and this is what "append-only"
     * buys: an estimate a customer was shown stays reproducible.
     */
    const id = await makeCompany('Degismez')
    const actor = await owner(id)

    const v1 = await createDraft(actor, { companyId: id })
    if (!v1.ok) return

    await savePriceBook(actor, {
      companyId: id,
      priceBookId: v1.value.priceBookId,
      note: null,
      items: [
        {
          productId,
          basePriceKurus: 1_000_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 0,
          setupFeeKurus: null,
        },
      ],
      optionPrices: [],
      adjustments: [],
      rules: [],
    })
    await publishPriceBook(actor, { companyId: id, priceBookId: v1.value.priceBookId })

    const estimate = await estimateForProject(actor, {
      companyId: id,
      productId,
      basisType: 'AREA_M2',
      areaM2: 20,
      quantity: 1,
      selectedOptionIds: [],
      requestIp: '198.51.100.9',
    })

    expect(estimate.ok).toBe(true)
    if (!estimate.ok || estimate.value.estimate === null) return

    const storedBefore = await getPrisma().priceCalculation.findFirst({
      where: { companyId: id },
      orderBy: { calculatedAt: 'desc' },
    })
    expect(storedBefore?.netKurus).toBe(20_000_00)
    expect(storedBefore?.priceBookVersion).toBe(v1.value.version)

    // Now double the price and publish v2.
    const v2 = await createDraft(actor, { companyId: id, fromPriceBookId: v1.value.priceBookId })
    if (!v2.ok) return

    await savePriceBook(actor, {
      companyId: id,
      priceBookId: v2.value.priceBookId,
      note: null,
      items: [
        {
          productId,
          basePriceKurus: 2_000_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 0,
          setupFeeKurus: null,
        },
      ],
      optionPrices: [],
      adjustments: [],
      rules: [],
    })
    await publishPriceBook(actor, { companyId: id, priceBookId: v2.value.priceBookId })

    const storedAfter = await getPrisma().priceCalculation.findUnique({
      where: { id: storedBefore?.id ?? '' },
    })

    expect(storedAfter?.netKurus, 'the stored net must not move').toBe(20_000_00)
    expect(storedAfter?.priceBookVersion, 'nor the version it was computed against').toBe(
      v1.value.version,
    )
    expect(storedAfter?.calculatedAt).toEqual(storedBefore?.calculatedAt)

    // And a fresh calculation does pick up v2, or the test would pass on a broken publish.
    const after = await estimateForProject(actor, {
      companyId: id,
      productId,
      basisType: 'AREA_M2',
      areaM2: 20,
      quantity: 1,
      selectedOptionIds: [],
    })
    if (!after.ok || after.value.estimate === null) return
    expect(after.value.estimate.netKurus).toBe(40_000_00)
  }, 180_000)

  it('records the actor and the IP on every calculation', async () => {
    // `ADR-006` §Anti-scraping: the detection heuristic is one actor, many calculations,
    // systematically varied dimensions. Without these two columns there is nothing to detect.
    const id = await makeCompany('Iz')
    const actor = await owner(id)

    const draft = await createDraft(actor, { companyId: id })
    if (!draft.ok) return
    await savePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      note: null,
      items: [
        {
          productId,
          basePriceKurus: 500_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 0,
          setupFeeKurus: null,
        },
      ],
      optionPrices: [],
      adjustments: [],
      rules: [],
    })
    await publishPriceBook(actor, { companyId: id, priceBookId: draft.value.priceBookId })

    await estimateForProject(actor, {
      companyId: id,
      productId,
      basisType: 'AREA_M2',
      areaM2: 10,
      quantity: 1,
      selectedOptionIds: [],
      requestIp: '198.51.100.44',
    })

    const stored = await getPrisma().priceCalculation.findFirst({ where: { companyId: id } })
    expect(stored?.actorUserId).toBe(`usr_pricing_${id}`)
    expect(stored?.requestIp).toBe('198.51.100.44')
    expect(stored?.engineVersion).toBe(1)
  }, 120_000)
})

describe('the simulator', () => {
  it('runs against a draft and returns the full breakdown', async () => {
    const id = await makeCompany('Simulasyon')
    const actor = await owner(id)

    const draft = await createDraft(actor, { companyId: id })
    if (!draft.ok) return

    await savePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      note: null,
      items: [
        {
          productId,
          basePriceKurus: 4_000_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 10_000_00,
          setupFeeKurus: 2_500_00,
        },
      ],
      optionPrices: [{ optionId, mode: 'FLAT', valueKurus: 5_000_00, percent: null }],
      adjustments: [
        { cityId, districtId: null, mode: 'FLAT', valueKurus: 10_000_00, percent: null },
      ],
      rules: [],
    })

    const result = await simulatePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      productId,
      basisType: 'AREA_M2',
      areaM2: 20,
      quantity: 1,
      selectedOptionIds: [optionId],
      cityId,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.value.estimate === null) return

    expect(result.value.priceBookStatus).toBe('DRAFT')
    const { breakdown } = result.value.estimate
    expect(breakdown.baseKurus).toBe(80_000_00)
    expect(breakdown.optionsKurus).toBe(5_000_00)
    expect(breakdown.setupKurus).toBe(2_500_00)
    expect(breakdown.regionalKurus).toBe(10_000_00)
    expect(result.value.estimate.netKurus).toBe(97_500_00)
  }, 120_000)

  it('writes no PriceCalculation — a simulation is not an estimate anybody saw', async () => {
    const id = await makeCompany('Kayitsiz')
    const actor = await owner(id)

    const draft = await createDraft(actor, { companyId: id })
    if (!draft.ok) return
    await fillDraftFor(actor, id, draft.value.priceBookId)

    const before = await getPrisma().priceCalculation.count({ where: { companyId: id } })
    await simulatePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      productId,
      basisType: 'AREA_M2',
      areaM2: 30,
      quantity: 1,
      selectedOptionIds: [],
    })
    const after = await getPrisma().priceCalculation.count({ where: { companyId: id } })

    expect(after).toBe(before)
  }, 120_000)

  it('refuses another company’s price book', async () => {
    // Ownership in the `where` clause — the other company's book matches nothing rather than
    // being loaded and then rejected.
    const mineActor = await owner(companyId)
    const theirsActor = await owner(otherCompanyId)

    const theirs = await createDraft(theirsActor, { companyId: otherCompanyId })
    if (!theirs.ok) return

    const attempt = await simulatePriceBook(mineActor, {
      companyId,
      priceBookId: theirs.value.priceBookId,
      productId,
      basisType: 'AREA_M2',
      areaM2: 20,
      quantity: 1,
      selectedOptionIds: [],
    })

    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    expect(attempt.error.kind).toBe('NOT_FOUND')
  }, 120_000)

  it('reports a rule set that makes a larger project cheaper', async () => {
    // The diagnostic from `domain/diagnostics.ts`, end to end: the manufacturer sees it in
    // the simulator panel before publishing rather than in a customer complaint after.
    const id = await makeCompany('Ters')
    const actor = await owner(id)

    const draft = await createDraft(actor, { companyId: id })
    if (!draft.ok) return

    await savePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      note: null,
      items: [
        {
          productId,
          basePriceKurus: 100_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 0,
          setupFeeKurus: null,
        },
      ],
      optionPrices: [],
      adjustments: [],
      rules: [
        {
          kind: 'AREA_DISCOUNT',
          thresholdMin: 100,
          thresholdMax: null,
          mode: 'PERCENT',
          valueKurus: null,
          percent: 10,
          note: null,
        },
      ],
    })

    const result = await simulatePriceBook(actor, {
      companyId: id,
      priceBookId: draft.value.priceBookId,
      productId,
      basisType: 'AREA_M2',
      areaM2: 120,
      quantity: 1,
      selectedOptionIds: [],
    })

    if (!result.ok) return
    expect(result.value.warnings.some((w) => w.kind === 'non-monotonic-in-basis')).toBe(true)
  }, 120_000)
})

async function fillDraftFor(actor: ActorContext, id: string, priceBookId: string) {
  return savePriceBook(actor, {
    companyId: id,
    priceBookId,
    note: null,
    items: [
      {
        productId,
        basePriceKurus: 1_000_00,
        unit: 'PER_M2',
        minProjectPriceKurus: 0,
        setupFeeKurus: null,
      },
    ],
    optionPrices: [],
    adjustments: [],
    rules: [],
  })
}
