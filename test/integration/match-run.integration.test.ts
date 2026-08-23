import { beforeAll, describe, expect, it } from 'vitest'

import { getMatchRun, runMatch } from '@/modules/matching/application/match-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { eligibleCompaniesForProject } from '@/shared/geo'

import { getPrisma } from './setup'

/**
 * The match pipeline against a real database — tasks 5.1–5.5,
 * `09-manufacturer-matching.md`.
 *
 * What cannot be proven against a fake: the eligibility filter is **one SQL query** whose
 * `RADIUS` branch runs `ST_DWithin` on the GiST-indexed `centerPoint`; the ownership scoping
 * that makes a foreign project's matches a 404; and the persistence — `MatchRun`,
 * `MatchResult`, `PriceCalculation` — that lets the results page re-render without
 * recomputing.
 *
 * The two named requirements from the phase brief:
 *
 *   **A pricing failure never removes a match** — the company with no published book is in
 *   the results as `priceOnRequest`, ranked below priced companies even when its score is
 *   higher.
 *
 *   **Determinism** — two runs over the same input produce the same order, and a score tie
 *   breaks on `companyId`, not on iteration luck.
 */

const PROJECT_POINT = { latitude: 40.7654, longitude: 29.9408 }
/** ~5.5 km north of the project — inside a 40 km radius. */
const NEAR_CENTRE = { latitude: 40.815, longitude: 29.9408 }

let cityId = ''
let districtId = ''
let otherCityId = ''
let productId = ''
let requiredAttributeId = ''
let requiredOptionId = ''
let projectId = ''

let priced1 = '' // CITY area, published book — priced
let priced2 = '' // same signals as priced1 — the deliberate score tie
let unpriced = '' // covers, offers, NO published book — must still appear
let radius = '' // RADIUS area via GiST — priced
let pending = '' // not VERIFIED — excluded
let wrongArea = '' // covers another city — excluded
let noOption = '' // does not offer the required option — excluded

const owner = (): ActorContext =>
  anonymousActor({ userId: 'usr_match_owner', globalRole: 'CUSTOMER', ip: '203.0.113.77' })

let sequence = 0
async function company(
  label: string,
  options: { status?: 'VERIFIED' | 'PENDING'; offersProduct?: boolean; offersOption?: boolean },
): Promise<string> {
  sequence += 1
  const created = await getPrisma().company.create({
    data: {
      slug: `match-${label}-${sequence}`,
      legalName: `${label} A.Ş.`,
      displayName: `Match ${label}`,
      status: options.status ?? 'VERIFIED',
      verifiedAt: options.status === 'PENDING' ? null : new Date('2026-01-10T00:00:00Z'),
    },
  })

  if (options.offersProduct !== false) {
    const companyProduct = await getPrisma().companyProduct.create({
      data: { companyId: created.id, productId, isActive: true },
    })
    if (options.offersOption !== false) {
      await getPrisma().companyProductOption.create({
        data: { companyProductId: companyProduct.id, optionId: requiredOptionId, isOffered: true },
      })
    }
  }

  return created.id
}

async function publishBook(companyId: string, forProductId: string): Promise<void> {
  await getPrisma().priceBook.create({
    data: {
      companyId,
      version: 1,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-20T00:00:00Z'),
      items: {
        create: {
          productId: forProductId,
          basePriceKurus: 500_00,
          unit: 'PER_M2',
          minProjectPriceKurus: 100_000_00,
        },
      },
    },
  })
}

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'Kocaeli', plateCode: 961 } })
  cityId = city.id
  const district = await prisma.district.create({ data: { cityId, name: 'İzmit' } })
  districtId = district.id
  const otherCity = await prisma.city.create({ data: { name: 'Konya', plateCode: 962 } })
  otherCityId = otherCity.id

  const category = await prisma.category.create({ data: { sortOrder: 90 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  productId = product.id

  const attribute = await prisma.productAttribute.create({
    data: { productId, key: 'colour', inputType: 'SELECT', isRequired: true },
  })
  requiredAttributeId = attribute.id
  const option = await prisma.productOption.create({
    data: { attributeId: requiredAttributeId, value: 'anthracite', isActive: true },
  })
  requiredOptionId = option.id

  // The owner and their READY project, with a resolved point (`04` §Project).
  await prisma.user.upsert({
    where: { id: 'usr_match_owner' },
    create: { id: 'usr_match_owner', email: 'match-owner@example.com' },
    update: {},
  })

  const project = await prisma.project.create({
    data: {
      customerId: 'usr_match_owner',
      productId,
      status: 'READY',
      widthMm: 5000,
      depthMm: 4000,
      heightMm: 2800,
      areaM2: 20,
      quantity: 1,
      cityId,
      districtId,
      pointPrecision: 'DISTRICT',
      values: { create: { attributeId: requiredAttributeId, optionId: requiredOptionId } },
    },
  })
  projectId = project.id

  const { setPoint } = await import('@/shared/geo')
  await setPoint('Project', projectId, PROJECT_POINT)
  // The district gets a point too: the suites share one container, and `geo-seed`'s
  // invariant — every district has a centroid — must survive this fixture existing.
  await setPoint('District', districtId, PROJECT_POINT)

  // ── the candidate set ──────────────────────────────────────────────────────
  priced1 = await company('priced-a', {})
  priced2 = await company('priced-b', {})
  unpriced = await company('unpriced', {})
  radius = await company('radius', {})
  pending = await company('pending', { status: 'PENDING' })
  wrongArea = await company('elsewhere', {})
  noOption = await company('no-option', { offersOption: false })

  for (const companyId of [priced1, priced2, unpriced, noOption]) {
    await getPrisma().serviceArea.create({
      data: { companyId, kind: 'CITY', cityId, isActive: true },
    })
  }
  await getPrisma().serviceArea.create({
    data: { companyId: pending, kind: 'CITY', cityId, isActive: true },
  })
  await getPrisma().serviceArea.create({
    data: { companyId: wrongArea, kind: 'CITY', cityId: otherCityId, isActive: true },
  })

  const radiusArea = await getPrisma().serviceArea.create({
    data: {
      companyId: radius,
      kind: 'RADIUS',
      radiusKm: 40,
      isActive: true,
      precision: 'EXACT',
    },
  })
  await setPoint('ServiceArea', radiusArea.id, NEAR_CENTRE)

  await publishBook(priced1, productId)
  await publishBook(priced2, productId)
  await publishBook(radius, productId)

  /*
   * The unpriced company gets the **best signals on the board** — the same near-centre
   * radius as the radius company (full proximity marks) plus the deepest portfolio — so its
   * raw score beats every priced company. That is exactly what makes the ranking assertion
   * below meaningful: it sorts last anyway, because `priceOnRequest ASC` is the first key
   * (`09` §Ranking, `PRC-06`).
   */
  const unpricedRadius = await getPrisma().serviceArea.create({
    data: { companyId: unpriced, kind: 'RADIUS', radiusKm: 40, isActive: true },
  })
  await setPoint('ServiceArea', unpricedRadius.id, NEAR_CENTRE)

  for (let i = 0; i < 5; i += 1) {
    await getPrisma().portfolioItem.create({
      data: { companyId: unpriced, title: `İş ${i}`, productId, sortOrder: i },
    })
  }
}, 120_000)

describe('5.1 · eligibility — one SQL query', () => {
  it('admits exactly the verified, offering, covering, option-complete companies', async () => {
    const rows = await eligibleCompaniesForProject(projectId)
    const ids = rows.map((row) => row.companyId).sort()

    expect(ids).toEqual([priced1, priced2, unpriced, radius].sort())
  })

  it('carries the radius match through ST_DWithin with its distance and radius', async () => {
    const rows = await eligibleCompaniesForProject(projectId)
    const viaRadius = rows.find((row) => row.companyId === radius)

    expect(viaRadius).toBeDefined()
    expect(viaRadius?.matchedKinds).toContain('RADIUS')
    expect(viaRadius?.radiusKm).toBe(40)
    // ~5.5 km — the centre is 0.05° north of the project.
    expect(viaRadius?.distanceMetres).toBeGreaterThan(4_000)
    expect(viaRadius?.distanceMetres).toBeLessThan(7_000)
    // Q22: the matched area reports how its centre was obtained.
    expect(viaRadius?.areaPrecisions).toContain('EXACT')
  })
})

describe('5.3 · the pricing pass never removes a match', () => {
  it('returns the bookless company as price-on-request, ranked below priced results', async () => {
    const run = await runMatch(owner(), { projectId })
    expect(run.ok).toBe(true)
    if (!run.ok) return

    const results = run.value.results
    const unpricedResult = results.find((result) => result.companyId === unpriced)

    // In the list — not silently dropped (`08` §Failure modes).
    expect(unpricedResult).toBeDefined()
    expect(unpricedResult?.priceOnRequest).toBe(true)
    expect(unpricedResult?.bandLowKurus).toBeNull()

    // …and below every priced company, although its raw score is the highest.
    const stored = await getPrisma().matchResult.findMany({
      where: { matchRun: { projectId } },
      orderBy: { rank: 'asc' },
    })
    const latestRunId = stored[stored.length - 1]?.matchRunId
    const latest = stored.filter((row) => row.matchRunId === latestRunId)

    const unpricedRow = latest.find((row) => row.companyId === unpriced)
    const pricedRows = latest.filter((row) => !row.priceOnRequest)

    expect(unpricedRow?.priceOnRequest).toBe(true)
    for (const priced of pricedRows) {
      expect(unpricedRow!.score).toBeGreaterThan(priced.score) // the trap this test sets
      expect(unpricedRow!.rank).toBeGreaterThan(priced.rank) // and the rule that defuses it
    }
  })

  it('prices the priced companies as a band and persists the calculation', async () => {
    const run = await runMatch(owner(), { projectId })
    expect(run.ok).toBe(true)
    if (!run.ok) return

    const pricedResult = run.value.results.find((result) => result.companyId === priced1)
    expect(pricedResult?.priceOnRequest).toBe(false)
    expect(pricedResult?.bandLowKurus).not.toBeNull()
    expect(pricedResult?.bandHighKurus).not.toBeNull()

    const calculation = await getPrisma().priceCalculation.findFirst({
      where: { projectId, companyId: priced1 },
      orderBy: { calculatedAt: 'desc' },
    })
    expect(calculation).not.toBeNull()
    expect(calculation?.engineVersion).toBe(1)
    // 20 m² × ₺500/m² = ₺10 000 < the ₺100 000 floor — the floor is the net.
    expect(calculation?.netKurus).toBe(100_000_00)
  })
})

describe('5.4 · deterministic ranking', () => {
  it('produces the same order on two runs over the same input', async () => {
    const first = await runMatch(owner(), { projectId })
    const second = await runMatch(owner(), { projectId })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    expect(first.value.results.map((r) => r.companyId)).toEqual(
      second.value.results.map((r) => r.companyId),
    )
  })

  it('breaks the deliberate score tie on companyId, ascending', async () => {
    const run = await runMatch(owner(), { projectId })
    expect(run.ok).toBe(true)
    if (!run.ok) return

    // priced1 and priced2 are built identical: same area kind, same book, no located
    // contact, same (empty) history. Their scores must tie, and the tie must not wobble.
    const a = run.value.results.find((r) => r.companyId === priced1)
    const b = run.value.results.find((r) => r.companyId === priced2)
    expect(a).toBeDefined()
    expect(b).toBeDefined()

    const [expectedFirst, expectedSecond] = [priced1, priced2].sort()
    expect(
      run.value.results
        .filter((r) => r.companyId === priced1 || r.companyId === priced2)
        .map((r) => r.companyId),
    ).toEqual([expectedFirst, expectedSecond])

    const rows = await getPrisma().matchResult.findMany({
      where: { matchRunId: run.value.matchRunId, companyId: { in: [priced1, priced2] } },
    })
    expect(rows[0]?.score).toBe(rows[1]?.score)
  })
})

describe('5.5 · persistence and explainability', () => {
  it('stores the run, the ranked results and the seven-component breakdown', async () => {
    const run = await runMatch(owner(), { projectId })
    expect(run.ok).toBe(true)
    if (!run.ok) return

    const stored = await getPrisma().matchRun.findUnique({
      where: { id: run.value.matchRunId },
      include: { results: { orderBy: { rank: 'asc' } } },
    })

    expect(stored).not.toBeNull()
    expect(stored?.weightsVersion).toBe(1)
    expect(stored?.resultCount).toBe(4)
    expect(stored?.results.map((r) => r.rank)).toEqual([1, 2, 3, 4])

    const breakdown = stored?.results[0]?.scoreBreakdown as {
      components: Record<string, unknown>
      weightsVersion: number
    }
    expect(Object.keys(breakdown.components).sort()).toEqual([
      'capability',
      'freshness',
      'history',
      'portfolio',
      'proximity',
      'rating',
      'responsiveness',
    ])
    expect(breakdown.weightsVersion).toBe(1)
  })

  it('serves the stored run without recomputing, in stored rank order', async () => {
    await runMatch(owner(), { projectId })
    const runsBefore = await getPrisma().matchRun.count({ where: { projectId } })

    const view = await getMatchRun(owner(), { projectId })
    expect(view.ok).toBe(true)
    if (!view.ok) return

    expect(view.value.results.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    // Reading did not write: same number of runs after the read.
    expect(await getPrisma().matchRun.count({ where: { projectId } })).toBe(runsBefore)
  })

  it('shows the customer a band and no score, no breakdown, no line items', async () => {
    const view = await getMatchRun(owner(), { projectId })
    expect(view.ok).toBe(true)
    if (!view.ok) return

    for (const result of view.value.results) {
      // The exact key set, so a new field is a deliberate edit here rather than a leak.
      // `priceState` refines the empty band's reason (5.8) and `incomplete` is `08`
      // §Failure modes' caveat — neither is a number, a score or a line item.
      expect(Object.keys(result).sort()).toEqual(
        [
          'bandLowKurus',
          'bandHighKurus',
          'companyId',
          'displayName',
          'distanceKm',
          'incomplete',
          'priceOnRequest',
          'priceState',
          'rank',
        ].sort(),
      )
    }
  })
})

describe('the radiusKm ceiling is a constraint, not a convention', () => {
  it('refuses a service area whose radius exceeds the GiST pre-filter ceiling', async () => {
    /*
     * The eligibility query's index pre-filter expands by a constant 500 km (`ADR-025`)
     * and is correct only if no row can exceed it. Until migration 7 the 5..500 range
     * lived only in `addServiceAreaSchema` — one raw insert away from a service area that
     * silently drops out of every match. This asserts the database refuses to hold one.
     */
    await expect(
      getPrisma().serviceArea.create({
        data: { companyId: priced1, kind: 'RADIUS', radiusKm: 600, isActive: true },
      }),
    ).rejects.toThrow(/ServiceArea_radiusKm_range|check constraint/i)

    await expect(
      getPrisma().serviceArea.create({
        data: { companyId: priced1, kind: 'RADIUS', radiusKm: 2, isActive: true },
      }),
    ).rejects.toThrow(/ServiceArea_radiusKm_range|check constraint/i)
  })
})

describe('ownership', () => {
  it('answers NOT_FOUND for another customer and for a stranger cookie', async () => {
    await getPrisma().user.upsert({
      where: { id: 'usr_match_other' },
      create: { id: 'usr_match_other', email: 'match-other@example.com' },
      update: {},
    })
    const stranger = anonymousActor({ userId: 'usr_match_other', globalRole: 'CUSTOMER' })
    const anonymous = anonymousActor({ anonymousKey: 'not-the-owner-key' })

    for (const actor of [stranger, anonymous]) {
      const run = await runMatch(actor, { projectId })
      expect(run.ok).toBe(false)
      if (run.ok) return
      expect(run.error.kind).toBe('NOT_FOUND')

      const view = await getMatchRun(actor, { projectId })
      expect(view.ok).toBe(false)
      if (view.ok) return
      expect(view.error.kind).toBe('NOT_FOUND')
    }
  })

  it('refuses to match a DRAFT project', async () => {
    const draft = await getPrisma().project.create({
      data: { customerId: 'usr_match_owner', productId, status: 'DRAFT', cityId },
    })

    const run = await runMatch(owner(), { projectId: draft.id })
    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.error.kind).toBe('PRECONDITION')
  })
})
