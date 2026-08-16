import { describe, expect, it } from 'vitest'

import { getPrisma, withRollback } from './setup'

/**
 * The first integration suite: the parts of migration 1 that Prisma's schema language
 * cannot express, and that therefore have no other proof they exist.
 *
 * `20-testing-strategy.md` §Integration lists the suites this stage owes as the modules
 * arrive. These are the ones migration 1 makes possible today.
 */

describe('migration 1 · extensions and collation', () => {
  it('has PostGIS loaded', async () => {
    const rows = await getPrisma().$queryRaw<{ version: string }[]>`
      SELECT PostGIS_Version() AS version
    `
    expect(rows[0]?.version).toMatch(/^\d+\.\d+/)
  })

  it('has pg_trgm loaded, which the directory search index needs', async () => {
    const rows = await getPrisma().$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `
    expect(rows).toHaveLength(1)
  })

  it('runs on a C-collated database', async () => {
    // 23 §Migrations requires this, and it is create-time: getting it wrong is a dump and
    // restore, not a migration.
    //
    // Read from `pg_database`, not `SHOW lc_collate`: PostgreSQL 16 removed `lc_collate`
    // and `lc_ctype` as runtime parameters — they are per-database properties now, and
    // `SHOW` errors with "unrecognized configuration parameter".
    const rows = await getPrisma().$queryRaw<{ datcollate: string; datctype: string }[]>`
      SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()
    `
    expect(rows[0]?.datcollate).toBe('C')
    expect(rows[0]?.datctype).toBe('C')
  })

  it.each([
    ['Company', 'displayName'],
    ['City', 'name'],
    ['District', 'name'],
  ])('gives %s.%s the Turkish collation', async (table, column) => {
    const rows = await getPrisma().$queryRaw<{ collation: string | null }[]>`
      SELECT co.collname AS collation
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      LEFT JOIN pg_collation co ON co.oid = a.attcollation
      WHERE c.relname = ${table} AND a.attname = ${column}
    `
    expect(rows[0]?.collation).toBe('tr-TR-x-icu')
  })

  it('sorts Turkish text the way a Turkish reader expects', async () => {
    // The point of the per-column collation. In C collation `Z` sorts before `a` and the
    // dotted/dotless i pair is wrong; in tr-TR-x-icu, `ı` precedes `i` and `İ` follows it.
    const rows = await getPrisma().$queryRaw<{ name: string }[]>`
      SELECT name FROM (VALUES ('Şırnak'), ('Sivas'), ('Iğdır'), ('İstanbul'), ('Çorum'))
        AS t(name)
      ORDER BY name COLLATE "tr-TR-x-icu"
    `
    expect(rows.map((row) => row.name)).toEqual(['Çorum', 'Iğdır', 'İstanbul', 'Sivas', 'Şırnak'])
  })
})

describe('migration 1 · indexes Prisma cannot declare', () => {
  it.each([
    ['CompanyContact_point_gist', 'CompanyContact'],
    ['City_point_gist', 'City'],
    ['District_point_gist', 'District'],
  ])('created %s as a GiST index', async (indexName, table) => {
    const rows = await getPrisma().$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = ${table} AND indexname = ${indexName}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.indexdef).toMatch(/USING gist/i)
  })

  it('created the trigram index for directory search', async () => {
    const rows = await getPrisma().$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'Company' AND indexname = 'Company_displayName_trgm'
    `
    expect(rows[0]?.indexdef).toMatch(/gin_trgm_ops/i)
  })
})

describe('migration 1 · one OWNER per company', () => {
  const company = (suffix: string) => ({
    slug: `acme-${suffix}`,
    legalName: 'Acme A.Ş.',
    displayName: 'Acme',
  })

  const user = (suffix: string) => ({ email: `owner-${suffix}@example.com` })

  it('accepts one OWNER', async () => {
    await withRollback(async (tx) => {
      const c = await tx.company.create({ data: company('one') })
      const u = await tx.user.create({ data: user('one') })

      const membership = await tx.companyMembership.create({
        data: { companyId: c.id, userId: u.id, role: 'OWNER' },
      })

      expect(membership.role).toBe('OWNER')
    })
  })

  it('rejects a second OWNER in the same company', async () => {
    // 02 §Company-scoped roles: exactly one OWNER, enforced by a partial unique index —
    // the database, not a service, because a race would otherwise slip through.
    await withRollback(async (tx) => {
      const c = await tx.company.create({ data: company('two') })
      const first = await tx.user.create({ data: user('two-a') })
      const second = await tx.user.create({ data: user('two-b') })

      await tx.companyMembership.create({
        data: { companyId: c.id, userId: first.id, role: 'OWNER' },
      })

      await expect(
        tx.companyMembership.create({
          data: { companyId: c.id, userId: second.id, role: 'OWNER' },
        }),
      ).rejects.toThrow()
    })
  })

  it('allows many ADMINs, and an OWNER in a different company', async () => {
    await withRollback(async (tx) => {
      const a = await tx.company.create({ data: company('three-a') })
      const b = await tx.company.create({ data: company('three-b') })
      const u1 = await tx.user.create({ data: user('three-a') })
      const u2 = await tx.user.create({ data: user('three-b') })

      await tx.companyMembership.create({ data: { companyId: a.id, userId: u1.id, role: 'ADMIN' } })
      await tx.companyMembership.create({ data: { companyId: a.id, userId: u2.id, role: 'ADMIN' } })
      await tx.companyMembership.create({ data: { companyId: b.id, userId: u1.id, role: 'OWNER' } })

      expect(await tx.companyMembership.count({ where: { companyId: a.id } })).toBe(2)
    })
  })
})

describe('migration 1 · geography columns accept and return points', () => {
  it('stores a point and reads it back through PostGIS', async () => {
    await withRollback(async (tx) => {
      const city = await tx.city.create({ data: { name: 'İstanbul', plateCode: 34 } })

      // ST_MakePoint takes (longitude, latitude) — the reverse of how it is said aloud.
      await tx.$executeRaw`
        UPDATE "City"
        SET "point" = ST_SetSRID(ST_MakePoint(28.9784, 41.0082), 4326)::geography
        WHERE "id" = ${city.id}
      `

      const rows = await tx.$queryRaw<{ latitude: number; longitude: number }[]>`
        SELECT ST_Y("point"::geometry) AS latitude, ST_X("point"::geometry) AS longitude
        FROM "City" WHERE "id" = ${city.id}
      `

      expect(rows[0]?.latitude).toBeCloseTo(41.0082, 4)
      expect(rows[0]?.longitude).toBeCloseTo(28.9784, 4)
    })
  })

  it('computes distance on the spheroid, in metres', async () => {
    // İstanbul → Ankara is roughly 350 km. This is the query shape 09 §Service-area
    // coverage uses; if it ever moves into JavaScript, the GiST index stops being used.
    const rows = await getPrisma().$queryRaw<{ metres: number }[]>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(28.9784, 41.0082), 4326)::geography,
        ST_SetSRID(ST_MakePoint(32.8597, 39.9334), 4326)::geography
      ) AS metres
    `
    expect(Number(rows[0]?.metres)).toBeGreaterThan(330_000)
    expect(Number(rows[0]?.metres)).toBeLessThan(370_000)
  })
})

/**
 * Migration scope, phase by phase (`ADR-014`: one migration per phase).
 *
 * This assertion is exact on purpose. A table appearing before its phase means a module got
 * built early, and the list is the cheapest way to notice. It moves when a phase lands —
 * which is a deliberate edit in that phase's commit, not a surprise.
 */
describe('migration scope', () => {
  it('has exactly the tables Phases 0 and 1 own, and none from later phases', async () => {
    const rows = await getPrisma().$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `
    const tables = rows.map((row) => row.tablename).filter((name) => !name.startsWith('_'))

    expect(tables).toEqual([
      'Account',
      'AuditLog',
      // Phase 1 · migration 2
      'AuthToken',
      'City',
      'Company',
      'CompanyContact',
      'CompanyDocument',
      'CompanyMembership',
      'ConfiguratorQuestion',
      'ConfiguratorRule',
      'Consent',
      'District',
      'File',
      'LeadCredit',
      'Payment',
      'Plan',
      'PlatformSetting',
      // Phase 1 · migration 2
      'RateLimitHit',
      'RefreshToken',
      'Session',
      'Subscription',
      'User',
      'VerificationToken',
      'spatial_ref_sys',
    ])

    // The catalogue, project, pricing, matching, offer, messaging, review and content
    // tables arrive with their phases — their absence here is the assertion.
    expect(tables).not.toContain('Product')
    expect(tables).not.toContain('Project')
    expect(tables).not.toContain('PriceBook')
    expect(tables).not.toContain('OfferRequest')
  })
})
