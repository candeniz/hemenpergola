import { beforeAll, describe, expect, it } from 'vitest'

import { getMatchRun, runMatch } from '@/modules/matching/application/match-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { respond } from '@/shared/http/respond'

import { getPrisma } from './setup'

/**
 * **`ADR-006` on the wire** — `CLAUDE.md` non-negotiable 5: *"Customers never see price
 * line items — only the band from `EstimateBand`."*
 *
 * Phase 10.2 put the match run behind `GET /api/v1/projects/{id}/matches`, and that is
 * exactly the moment this needs a test. A `PriceCalculation` row carries `netKurus` and a
 * per-line `breakdown` **in the same row** as `bandLowKurus`/`bandHighKurus`, so the band a
 * customer may see and the arithmetic they may not are one `include` away from each other.
 * One `...priceCalculation` in a DTO — or one `select` widened for debugging and left in —
 * publishes a manufacturer's cost structure to every customer who asked for a quote.
 *
 * This is not hypothetical. `toPendingLead` leaked `project.note` in Phase 6, which is
 * contact data before the disclosure (`ADR-026`), by exactly this mechanism: a spread of a
 * row that carried more than the screen needed.
 *
 * **The test asserts the response body, not the DTO type.** A type is erased at runtime and
 * a `select` is not; the body is what a client receives. It runs the value through
 * `respond()` — the same mapping the route handler uses, which is the whole of what the
 * route adds — and scans the serialised JSON recursively for forbidden keys at any depth.
 *
 * The last assertion is the one that keeps the rest honest: it proves the forbidden fields
 * **exist on the stored row**. Without it, a refactor that stopped persisting `breakdown`
 * would leave every assertion above passing for the wrong reason.
 */

const POINT = { latitude: 40.7654, longitude: 29.9408 }

/** What may never cross the customer boundary, whatever it is nested inside. */
const FORBIDDEN = ['netKurus', 'breakdown', 'priceBookId', 'unitPriceKurus', 'score'] as const

let projectId = ''
let companyId = ''

const owner = (): ActorContext =>
  anonymousActor({ userId: 'usr_leak_owner', globalRole: 'CUSTOMER', ip: '203.0.113.91' })

/** Every key appearing anywhere in a JSON-serialisable value. */
function keysDeep(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysDeep(item, found)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key)
      keysDeep(nested, found)
    }
  }
  return found
}

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'Sakarya', plateCode: 971 } })
  const district = await prisma.district.create({ data: { cityId: city.id, name: 'Adapazarı' } })

  const category = await prisma.category.create({ data: { sortOrder: 91 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })

  const company = await prisma.company.create({
    data: {
      slug: 'leak-priced',
      legalName: 'Leak Priced A.Ş.',
      displayName: 'Leak Priced',
      status: 'VERIFIED',
      verifiedAt: new Date('2026-01-10T00:00:00Z'),
    },
  })
  companyId = company.id

  await prisma.companyProduct.create({
    data: { companyId, productId: product.id, isActive: true },
  })
  await prisma.serviceArea.create({
    data: { companyId, kind: 'CITY', cityId: city.id, isActive: true },
  })

  // A book with a per-m² base and a minimum: enough for the engine to produce a real
  // breakdown rather than a degenerate one.
  await prisma.priceBook.create({
    data: {
      companyId,
      version: 1,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-20T00:00:00Z'),
      items: {
        create: {
          productId: product.id,
          basePriceKurus: 500_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 100_000_00,
        },
      },
    },
  })

  await prisma.user.upsert({
    where: { id: 'usr_leak_owner' },
    create: { id: 'usr_leak_owner', email: 'leak-owner@example.com' },
    update: {},
  })

  const project = await prisma.project.create({
    data: {
      customerId: 'usr_leak_owner',
      productId: product.id,
      status: 'READY',
      widthMm: 5000,
      depthMm: 4000,
      heightMm: 2800,
      areaM2: 20,
      quantity: 1,
      cityId: city.id,
      districtId: district.id,
      pointPrecision: 'DISTRICT',
    },
  })
  projectId = project.id

  const { setPoint } = await import('@/shared/geo')
  await setPoint('Project', projectId, POINT)
  await setPoint('District', district.id, POINT)

  const run = await runMatch(owner(), { projectId })
  expect(run.ok, 'the fixture must produce a priced run for the test to mean anything').toBe(true)
})

describe('ADR-006 · the customer match response carries the band and nothing under it', () => {
  it('returns a priced band, so the assertions below are not passing on an empty payload', async () => {
    const result = await getMatchRun(owner(), { projectId })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.results.length).toBeGreaterThan(0)
    const [first] = result.value.results
    expect(first?.bandLowKurus).toBeTypeOf('number')
    expect(first?.bandHighKurus).toBeTypeOf('number')
    // Integer kuruş end to end (`ADR-005`) — a float here would be a defect of its own.
    expect(Number.isInteger(first?.bandLowKurus)).toBe(true)
  })

  it('never carries netKurus, breakdown, priceBookId, unit prices or the score', async () => {
    const result = await getMatchRun(owner(), { projectId })
    expect(result.ok).toBe(true)

    const body = await respond(result).json()
    const keys = keysDeep(body)

    for (const forbidden of FORBIDDEN) {
      expect(keys.has(forbidden), `\`${forbidden}\` reached the customer response body`).toBe(false)
    }
  })

  it('does not leak them as substrings either — a renamed wrapper is still a leak', async () => {
    const result = await getMatchRun(owner(), { projectId })
    const text = await respond(result).text()

    // `09` §Explainability: the customer gets a sentence, the admin gets the numbers. A
    // payload that mentions the score under any key has crossed that line.
    for (const forbidden of ['netKurus', 'breakdown', 'priceBookId'] as const) {
      expect(text.includes(forbidden), `\`${forbidden}\` appears in the serialised body`).toBe(
        false,
      )
    }
  })

  it('proves the forbidden fields are really on the stored row', async () => {
    const calculation = await getPrisma().priceCalculation.findFirst({
      where: { companyId },
      select: { netKurus: true, breakdown: true, priceBookId: true },
    })

    // If this ever goes null the assertions above stop meaning anything, and they would
    // keep passing while meaning nothing — which is the failure mode of every test that
    // asserts an absence.
    expect(calculation).not.toBeNull()
    expect(calculation?.netKurus).toBeTypeOf('number')
    expect(calculation?.breakdown).not.toBeNull()
    expect(calculation?.priceBookId).toBeTypeOf('string')
  })
})
