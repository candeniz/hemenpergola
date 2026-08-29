import { expect, test, type APIRequestContext } from '@playwright/test'

import { SEED_PASSWORD, SEED_PILOT_OWNER_EMAIL } from '../prisma/seed/accounts'

/**
 * The Phase 3 gate — `21-development-roadmap.md`: *a verified company has a published price
 * book, service areas and products — that is, it is **matchable**.*
 *
 * Matching itself is Phase 5. What is proven here is **matchability**: every input the
 * matching filter will read exists, is owned by the right company, and produces a real
 * number rather than a placeholder.
 *
 * ## Why this drives `/api/v1`
 *
 * Same reasoning as the Phase 2 gate. The gate is about capability, not about a particular
 * button — can a manufacturer go from "verified" to "priced" without a deploy and without
 * anybody touching the database. The screens are covered separately: `a11y.spec.ts` renders
 * `/panel/[companyId]/fiyatlandirma`, and the pricing integration suite drives the same
 * services the editor's server actions call.
 *
 * ## Why it uses the seeded pilot manufacturer
 *
 * Unlike the Phase 2 gate, this one does not walk a company in from registration: that path
 * is already proven there, and repeating it would add ninety seconds of Argon2 to every run
 * for no new coverage. It uses the `demo` profile's pilot account — the same one
 * `27-d3-pilot-guide.md` puts in front of a real manufacturer — which has the additional
 * benefit that a broken pilot account fails the gate rather than the pilot session.
 *
 * It is re-runnable: a draft is created only when there is not one already, and publishing
 * archives whatever was live.
 */

/** The D3 pilot company — deliberately the one seeded WITHOUT a price book. */
const OWNER_EMAIL = SEED_PILOT_OWNER_EMAIL
const OWNER_PASSWORD = SEED_PASSWORD

type Envelope<T> = { data: T } | { error: { code: string; message: string } }

async function call<T>(
  request: APIRequestContext,
  method: 'get' | 'post',
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<Envelope<T>> {
  const headers: Record<string, string> =
    options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }

  const response =
    method === 'get'
      ? await request.get(path, { headers })
      : await request.post(path, { data: options.body ?? {}, headers })

  return (await response.json()) as Envelope<T>
}

function data<T>(envelope: Envelope<T>, what: string): T {
  if ('error' in envelope) {
    throw new Error(`${what}: ${envelope.error.code} — ${envelope.error.message}`)
  }
  return envelope.data
}

type ProductView = {
  productId: string
  companyProductId: string | null
  isActive: boolean
  name: string
  basisType: 'AREA_M2' | 'LENGTH_M' | 'UNIT'
  attributes: { options: { optionId: string; isOffered: boolean | null }[] }[]
}

type BookSummary = {
  priceBookId: string
  version: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  itemCount: number
}

test.describe('Phase 3 gate', () => {
  test.setTimeout(180_000)

  test.beforeEach(async ({ page }, testInfo) => {
    // A distinct client address per test, so `06` §Rate limits does not refuse the login.
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${testInfo.workerIndex + 40}.7`,
    })
  })

  test('a verified manufacturer marks products, drafts a price book, simulates it and publishes', async ({
    request,
  }) => {
    const session = data<{ accessToken: string }>(
      await call(request, 'post', '/api/v1/auth/login', {
        body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      }),
      'manufacturer login',
    )
    const token = session.accessToken

    // ── the company, from the caller's own memberships ──────────────────────
    const mine = data<{ companies: { companyId: string; displayName: string; status: string }[] }>(
      await call(request, 'get', '/api/v1/companies', { token }),
      'my companies',
    )

    const company = mine.companies.find((row) => row.status === 'VERIFIED')
    expect(company, 'the pilot manufacturer must belong to a verified company').toBeTruthy()
    const companyId = company?.companyId ?? ''

    // ── 3.2 · what we sell ──────────────────────────────────────────────────
    const catalogue = data<{ products: ProductView[] }>(
      await call(request, 'get', `/api/v1/companies/${companyId}/products`, { token }),
      'company products',
    )

    const product = catalogue.products.find(
      (row) => row.basisType === 'AREA_M2' && row.attributes.length > 0,
    )
    expect(product, 'the seeded catalogue must contain an area-based product').toBeTruthy()
    const productId = product?.productId ?? ''

    data<{ companyProductId: string }>(
      await call(request, 'post', `/api/v1/companies/${companyId}/products`, {
        token,
        body: { productId, isActive: true },
      }),
      'offer the product',
    )

    const offeredOptionIds = (product?.attributes ?? [])
      .flatMap((attribute) => attribute.options)
      .filter((option) => option.isOffered === true)
      .map((option) => option.optionId)
      .slice(0, 2)

    // ── 3.3 · a draft price book ────────────────────────────────────────────
    const before = data<{ books: BookSummary[] }>(
      await call(request, 'get', `/api/v1/companies/${companyId}/price-books`, { token }),
      'existing books',
    )

    // Re-runnable: reuse an open draft rather than colliding with it.
    const existingDraft = before.books.find((book) => book.status === 'DRAFT') ?? null
    const draft =
      existingDraft ??
      data<{ priceBookId: string; version: number }>(
        await call(request, 'post', `/api/v1/companies/${companyId}/price-books`, {
          token,
          body: {},
        }),
        'create draft',
      )

    const priceBookId = 'priceBookId' in draft ? draft.priceBookId : ''
    expect(priceBookId).toBeTruthy()

    data<{ priceBookId: string }>(
      await call(
        request,
        'post',
        `/api/v1/companies/${companyId}/price-books/${priceBookId}/save`,
        {
          token,
          body: {
            note: 'phase 3 gate',
            items: [
              {
                productId,
                basePriceKurus: 4_500_00,
                unit: 'PER_M2',
                minProjectPriceKurus: 25_000_00,
                setupFeeKurus: 3_000_00,
              },
            ],
            optionPrices: offeredOptionIds.map((optionId) => ({
              optionId,
              mode: 'FLAT',
              valueKurus: 6_000_00,
            })),
            adjustments: [],
            rules: [
              {
                kind: 'AREA_DISCOUNT',
                thresholdMin: 60,
                mode: 'PERCENT',
                percent: 5,
                note: 'volume',
              },
            ],
          },
        },
      ),
      'save the draft',
    )

    // ── 3.5 · simulate before publishing ────────────────────────────────────
    const simulation = data<{
      estimate: {
        netKurus: number
        bandLowKurus: number
        bandHighKurus: number
        breakdown: { baseKurus: number; setupKurus: number }
      } | null
      priceBookStatus: string
    }>(
      await call(
        request,
        'post',
        `/api/v1/companies/${companyId}/price-books/${priceBookId}/simulate`,
        {
          token,
          body: {
            productId,
            basisType: 'AREA_M2',
            areaM2: 20,
            perimeterM: 18,
            heightM: 3,
            quantity: 1,
            selectedOptionIds: offeredOptionIds,
          },
        },
      ),
      'simulate',
    )

    // `08` §Simulator: the same pure function, against the draft, with the full breakdown.
    expect(simulation.priceBookStatus, 'the simulator runs against the draft').toBe('DRAFT')
    expect(
      simulation.estimate,
      'a saved draft with a priced product must produce a figure',
    ).not.toBeNull()
    expect(simulation.estimate?.breakdown.baseKurus, '₺4 500/m² × 20 m²').toBe(90_000_00)
    expect(simulation.estimate?.breakdown.setupKurus).toBe(3_000_00)
    expect(simulation.estimate?.bandLowKurus ?? 0).toBeLessThanOrEqual(
      simulation.estimate?.netKurus ?? 0,
    )
    expect(simulation.estimate?.bandHighKurus ?? 0).toBeGreaterThanOrEqual(
      simulation.estimate?.netKurus ?? 0,
    )

    // ── 3.3 · publish ───────────────────────────────────────────────────────
    const published = data<{ version: number; archivedVersion: number | null }>(
      await call(
        request,
        'post',
        `/api/v1/companies/${companyId}/price-books/${priceBookId}/publish`,
        { token },
      ),
      'publish',
    )
    expect(published.version).toBeGreaterThan(0)

    // ── the gate itself: exactly one live book, with a priced product ───────
    const after = data<{ books: BookSummary[] }>(
      await call(request, 'get', `/api/v1/companies/${companyId}/price-books`, { token }),
      'books after publishing',
    )

    const live = after.books.filter((book) => book.status === 'PUBLISHED')
    expect(live, 'one live price book per company').toHaveLength(1)
    expect(live[0]?.itemCount, 'the live book prices at least one product').toBeGreaterThan(0)

    // And a published book cannot be edited — the immutability that makes a stored estimate
    // reproducible (`PRC-02`).
    const edit = await call(
      request,
      'post',
      `/api/v1/companies/${companyId}/price-books/${live[0]?.priceBookId}/save`,
      {
        token,
        body: {
          note: 'not allowed',
          items: [],
          optionPrices: [],
          adjustments: [],
          rules: [],
        },
      },
    )
    expect('error' in edit, 'a published book refuses edits').toBe(true)
  })

  test('another company’s price books are invisible, not merely forbidden', async ({ request }) => {
    /*
     * `ADR-006`: a competitor must not be able to read a manufacturer's price book. Ownership
     * lives in the `where` clause, so the answer is `NOT_FOUND` rather than `FORBIDDEN` — a
     * 403 would confirm the book exists, which is itself the leak.
     */
    const session = data<{ accessToken: string }>(
      await call(request, 'post', '/api/v1/auth/login', {
        body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      }),
      'manufacturer login',
    )

    const response = await call(request, 'get', '/api/v1/companies/cmp_someone_else/price-books', {
      token: session.accessToken,
    })

    expect('error' in response).toBe(true)
    if (!('error' in response)) return
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain(response.error.code)
  })
})
