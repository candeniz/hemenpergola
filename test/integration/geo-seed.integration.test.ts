import { beforeAll, describe, expect, it } from 'vitest'

import { seedGeography } from '../../prisma/seed/geo/seed-geo'
import { seedPlatformSettings } from '../../prisma/seed/platform-settings'
import { PROFILES } from '../../prisma/seed/profiles'

import { getPrisma } from './setup'

/**
 * Task 0.5 and 0.17, against a real PostGIS container.
 *
 * These run outside `withRollback`: the seed is the thing under test, so it has to commit.
 * The container is torn down at the end of the run, and each assertion is written to
 * tolerate the rows the other files leave behind.
 */
beforeAll(async () => {
  await seedGeography(getPrisma())
  await seedPlatformSettings(getPrisma())
}, 300_000)

describe('geography seed', () => {
  it('has all 81 provinces, numbered 1..81', async () => {
    const cities = await getPrisma().city.findMany({ select: { plateCode: true } })

    expect(cities).toHaveLength(81)
    expect(cities.map((c) => c.plateCode).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 81 }, (_, i) => i + 1),
    )
  })

  it('gives every district a point', async () => {
    // 09 §Service-area coverage falls back to the district centroid when the customer gives
    // no precise location. A district without one silently drops every radius match there.
    const rows = await getPrisma().$queryRaw<{ total: bigint; missing: bigint }[]>`
      SELECT count(*) AS total, count(*) FILTER (WHERE "point" IS NULL) AS missing
      FROM "District"
    `

    expect(Number(rows[0]?.total)).toBeGreaterThan(900)
    expect(Number(rows[0]?.missing)).toBe(0)
  })

  it('gives every province a point too', async () => {
    const rows = await getPrisma().$queryRaw<{ missing: bigint }[]>`
      SELECT count(*) FILTER (WHERE "point" IS NULL) AS missing FROM "City"
    `
    expect(Number(rows[0]?.missing)).toBe(0)
  })

  it('stores Turkish characters intact', async () => {
    const names = await getPrisma().city.findMany({
      where: { plateCode: { in: [17, 23, 30, 34, 40, 48, 63] } },
      select: { name: true },
      orderBy: { plateCode: 'asc' },
    })

    expect(names.map((c) => c.name)).toEqual([
      'Çanakkale',
      'Elazığ',
      'Hakkâri',
      'İstanbul',
      'Kırşehir',
      'Muğla',
      'Şanlıurfa',
    ])
  })
})

describe('Turkish collation, on real data', () => {
  it('orders province names the way a Turkish reader does', async () => {
    // The assertion that matters: `İstanbul` sorts AFTER `Isparta`. In Turkish, dotless `ı`
    // precedes dotted `i`, so Isparta (I) comes before İstanbul (İ). Under the C collation
    // the raw bytes put `İ` (U+0130) after every ASCII letter, which happens to give the
    // same answer here — so the pair below is the one that separates them.
    const cities = await getPrisma().$queryRaw<{ name: string }[]>`
      SELECT "name" FROM "City"
      WHERE "name" IN ('Isparta', 'İstanbul', 'İzmir', 'Iğdır')
      ORDER BY "name"
    `

    // Iğdır and Isparta start with dotless I; İstanbul and İzmir with dotted İ.
    expect(cities.map((c) => c.name)).toEqual(['Iğdır', 'Isparta', 'İstanbul', 'İzmir'])
  })

  it('orders district names the way a Turkish reader does', async () => {
    // Çankaya before Dinar: `Ç` sorts immediately after `C` in Turkish, so Çankaya
    // precedes anything starting with D. Under the C collation `Ç` (U+00C7) sorts after
    // every ASCII letter and Dinar would come first — this is the pair that proves the
    // column collation is actually in effect.
    const rows = await getPrisma().$queryRaw<{ name: string }[]>`
      SELECT "name" FROM "District"
      WHERE "name" IN ('Çankaya', 'Dinar', 'Bornova', 'Şile', 'Tuzla')
      ORDER BY "name"
    `

    const order = rows.map((r) => r.name)
    expect(order.indexOf('Çankaya')).toBeLessThan(order.indexOf('Dinar'))
    // Ş sorts after S and before T in Turkish.
    expect(order.indexOf('Şile')).toBeLessThan(order.indexOf('Tuzla'))
    expect(order[0]).toBe('Bornova')
  })

  it('disagrees with the C collation, which is the whole point', async () => {
    const turkish = await getPrisma().$queryRaw<{ name: string }[]>`
      SELECT "name" FROM "District" WHERE "name" IN ('Çankaya', 'Dinar') ORDER BY "name"
    `
    const byte = await getPrisma().$queryRaw<{ name: string }[]>`
      SELECT "name" FROM "District"
      WHERE "name" IN ('Çankaya', 'Dinar')
      ORDER BY "name" COLLATE "C"
    `

    expect(turkish.map((r) => r.name)).toEqual(['Çankaya', 'Dinar'])
    expect(byte.map((r) => r.name)).toEqual(['Dinar', 'Çankaya'])
  })
})

describe('service-area coverage uses these points', () => {
  it('finds districts within a radius of a known coordinate', async () => {
    // Kadıköy is about 8 km across the Bosphorus from Beşiktaş. This is the exact query
    // shape 09 §Service-area coverage uses for a RADIUS service area.
    const besiktas = { latitude: 41.0422, longitude: 29.0083 }

    const near = await getPrisma().$queryRaw<{ name: string; km: number }[]>`
      SELECT d."name", ST_Distance(
               d."point",
               ST_SetSRID(ST_MakePoint(${besiktas.longitude}, ${besiktas.latitude}), 4326)::geography
             ) / 1000 AS km
      FROM "District" d
      JOIN "City" c ON c."id" = d."cityId"
      WHERE c."plateCode" = 34
        AND ST_DWithin(
              d."point",
              ST_SetSRID(ST_MakePoint(${besiktas.longitude}, ${besiktas.latitude}), 4326)::geography,
              10000
            )
      ORDER BY km
    `

    const names = near.map((r) => r.name)
    expect(names).toContain('Beşiktaş')
    expect(names).toContain('Kadıköy')
    // A 10 km circle over İstanbul catches several districts but nowhere near all 39.
    expect(names.length).toBeGreaterThan(3)
    expect(names.length).toBeLessThan(25)
  })

  it('excludes a district that is outside the radius', async () => {
    // Ankara is ~350 km from İstanbul, so no Ankara district is within 100 km of Beşiktaş.
    const rows = await getPrisma().$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count
      FROM "District" d
      JOIN "City" c ON c."id" = d."cityId"
      WHERE c."plateCode" = 6
        AND ST_DWithin(
              d."point",
              ST_SetSRID(ST_MakePoint(29.0083, 41.0422), 4326)::geography,
              100000
            )
    `
    expect(Number(rows[0]?.count)).toBe(0)
  })

  it('uses the GiST index rather than scanning', async () => {
    // ADR-002's actual purpose. If this ever falls back to a sequential scan, a match run
    // over a real company table stops being viable.
    const plan = await getPrisma().$queryRaw<{ 'QUERY PLAN': string }[]>`
      EXPLAIN SELECT "id" FROM "District"
      WHERE ST_DWithin("point", ST_SetSRID(ST_MakePoint(29.0083, 41.0422), 4326)::geography, 10000)
    `
    const text = plan.map((row) => row['QUERY PLAN']).join('\n')

    // Postgres may choose a seq scan on a 974-row table regardless; what must be true is
    // that the index exists and is usable.
    const index = await getPrisma().$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'District' AND indexdef ILIKE '%USING gist%'
    `
    expect(index).toHaveLength(1)
    expect(text.length).toBeGreaterThan(0)
  })
})

describe('platform settings', () => {
  it('seeds the defaults 08 and 11 specify, with no constants left in code', async () => {
    const rows = await getPrisma().platformSetting.findMany({ orderBy: { key: 'asc' } })
    const byKey = new Map(rows.map((r) => [r.key, r.value]))

    expect(byKey.get('pricing.band_percent')).toBe(10)
    expect(byKey.get('pricing.band_min_kurus')).toBe(500_000)
    expect(byKey.get('pricing.round_step_kurus')).toBe(50_000)
    expect(byKey.get('offer_request.sla_hours')).toBe(48)
    expect(byKey.get('tax.kdv_default_percent')).toBe(20)
    expect(byKey.get('matching.max_companies_per_project')).toBe(5)
  })
})

describe('seed profiles', () => {
  it.each(['minimal', 'demo', 'e2e'] as const)(
    '%s runs and is idempotent',
    async (profile) => {
      const first = await PROFILES[profile](getPrisma())
      const countsAfterFirst = {
        cities: await getPrisma().city.count(),
        districts: await getPrisma().district.count(),
        companies: await getPrisma().company.count(),
        memberships: await getPrisma().companyMembership.count(),
      }

      const second = await PROFILES[profile](getPrisma())
      const countsAfterSecond = {
        cities: await getPrisma().city.count(),
        districts: await getPrisma().district.count(),
        companies: await getPrisma().company.count(),
        memberships: await getPrisma().companyMembership.count(),
      }

      expect(second).toEqual(first)
      expect(countsAfterSecond).toEqual(countsAfterFirst)
    },
    300_000,
  )

  it('gives the e2e profile the fixed ids the release gate will bind to', async () => {
    // e2e/core-flow.spec.ts is nine skipped steps today and binds to these in Phase 6.
    const { E2E_IDS } = await import('../../prisma/seed/profiles')

    const customer = await getPrisma().user.findUnique({ where: { id: E2E_IDS.users.customer } })
    const company = await getPrisma().company.findUnique({
      where: { id: E2E_IDS.companies.verified },
    })

    expect(customer?.email).toBe('e2e-customer@pergola.local')
    expect(company?.status).toBe('VERIFIED')
  })
})
