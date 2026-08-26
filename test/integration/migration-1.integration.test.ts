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
      /*
       * Plate 990, not 34. `plateCode` is unique and `geo-seed.integration.test.ts` commits the
       * real 81 provinces into the same database — one container per *run* since Phase 3, not
       * one per file. A fixture that claims a real plate code collides with it, and the 9xx
       * range is the convention the other suites already use — 906, 934 and 941 are taken.
       */
      const city = await tx.city.create({ data: { name: 'İstanbul', plateCode: 990 } })

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
  it('has exactly the tables Phases 0 to 3 own, and none from later phases', async () => {
    const rows = await getPrisma().$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `
    /*
     * pg-boss is excluded by schema, not by name: it creates and migrates its own tables and
     * they live in `pgboss` (`shared/jobs`). The query below is already scoped to `public`,
     * so this is a note rather than a filter — but it is the thing a reader wonders about
     * the first time they see a job queue in a project with an exact table list.
     */
    const tables = rows.map((row) => row.tablename).filter((name) => !name.startsWith('_'))

    expect(tables).toEqual([
      'Account',
      // Phase 6 · migration 8 — the lifecycle
      'Appointment',
      'AuditLog',
      // Phase 1 · migration 2
      'AuthToken',
      // Phase 2 · migration 3
      'Category',
      'CategoryTranslation',
      'City',
      'Company',
      'CompanyContact',
      'CompanyDocument',
      'CompanyMembership',
      // Phase 3 · migration 4
      'CompanyProduct',
      'CompanyProductOption',
      'ConfiguratorQuestion',
      'ConfiguratorRule',
      'Consent',
      // Phase 6 · migration 8
      'ContactDisclosure',
      // Phase 8 · migration 12 — the structured-block CMS (18, task 8.3)
      'ContentPage',
      'District',
      'File',
      // Phase 3 · migration 4
      'FileVariant',
      'LeadCredit',
      // Phase 5 · migration 7 — matching
      'MatchResult',
      'MatchRun',
      // Phase 7 · migration 10 — messaging (15, ADR-028)
      'Message',
      // Phase 5 · migration 7 — 04 §Messaging's Notification, pulled forward by 5.7
      'Notification',
      // Phase 7 · migration 9 — preferences; absence of a row means enabled
      'NotificationPreference',
      // Phase 6 · migration 8
      'Offer',
      'OfferLine',
      'OfferRequest',
      'Payment',
      'Plan',
      'PlatformSetting',
      // Phase 3 · migration 4
      'PortfolioItem',
      'PortfolioPhoto',
      // Phase 3 · migration 5 — the price book
      'PriceBook',
      'PriceBookItem',
      'PriceBookOptionPrice',
      'PriceBookRegionAdjustment',
      'PriceBookRule',
      'PriceCalculation',
      // Phase 2 · migration 3
      'Product',
      'ProductAttribute',
      'ProductAttributeTranslation',
      'ProductOption',
      'ProductOptionTranslation',
      'ProductTranslation',
      // Phase 1 · migration 2
      // Phase 4 · migration 6 — the configurator
      'Project',
      'ProjectAttachment',
      'ProjectAttributeValue',
      // Phase 12 · migration 14 — the push channel's device address (13 + Q32)
      'PushToken',
      'RateLimitHit',
      'RefreshToken',
      // Phase 7 · migration 10 — reviews (16)
      'Review',
      'ReviewResponse',
      // Phase 2 · migration 3
      'Seo',
      // Phase 3 · migration 4
      'ServiceArea',
      'Session',
      // Phase 8 · migration 11 — old slugs answer permanently (18 §URLs, task 8.5)
      'SlugRedirect',
      'Subscription',
      // Phase 7 · migration 10
      'Thread',
      'User',
      'VerificationToken',
      'spatial_ref_sys',
    ])

    // Later-phase tables arrive with their phases — their absence here is the assertion.
    // (`OfferRequest` left at migration 8; `Thread`/`Review` at 10; `ContentPage` at 12.)
    expect(tables).not.toContain('ComplaintCase')

    /*
     * `CompanyProduct` and `CompanyProductOption` arrived in migration 4, which is the
     * boundary task 2.1 stopped at: migration 3 said what the platform sells, migration 4
     * says who sells it. The assertion moved rather than being deleted.
     */
    expect(tables).toContain('CompanyProduct')
    expect(tables).toContain('CompanyProductOption')

    /*
     * And migration 5 is Phase 3's second half. `PriceCalculation` is the one worth naming:
     * it is append-only (`PRC-02`) and Phase 5 writes to it, so the table existing before
     * matching does is deliberate rather than premature.
     */
    expect(tables).toContain('PriceBook')
    expect(tables).toContain('PriceBookItem')
    expect(tables).toContain('PriceCalculation')

    /*
     * Migration 6 is Phase 4's. `Project` is worth naming: `04` §Project's "exactly one of
     * `customerId` / `anonymousKey`" is a CHECK constraint on it, which is the kind of thing
     * that silently disappears if a migration is ever regenerated without its hand-written
     * tail.
     */
    expect(tables).toContain('Project')
    expect(tables).toContain('ProjectAttributeValue')
    expect(tables).toContain('ProjectAttachment')

    // Migration 7 is Phase 5's, migration 8 is Phase 6's — each moved this boundary when it
    // landed, which is the deliberate edit the comment at the top of this test promises.
    expect(tables).toContain('MatchRun')
    expect(tables).toContain('OfferRequest')
    expect(tables).toContain('ContactDisclosure')

    // Migration 10 is Phase 7's second half: messaging (`ADR-028`'s Thread cannot exist
    // before acceptance — a service property; the table itself lands here) and reviews
    // with their CHECK-enforced 1..5 ratings.
    expect(tables).toContain('Thread')
    expect(tables).toContain('Message')
    expect(tables).toContain('Review')
    expect(tables).toContain('ReviewResponse')

    // Phase 9's complaint tables are the next boundary; their absence is the assertion now.
    // (`ContentPage` left this list at migration 12.)
    expect(tables).not.toContain('ComplaintCase')
  })
})

/**
 * Migration 3's hand-written half — the collations Prisma cannot express
 * (`04-data-model.md` §Conventions).
 */
describe('migration 3 · catalogue collation and per-locale slugs', () => {
  it.each([
    ['CategoryTranslation', 'name'],
    ['ProductTranslation', 'name'],
    ['ProductOptionTranslation', 'label'],
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

  it.each([
    ['CategoryTranslation', 'slug'],
    ['ProductTranslation', 'slug'],
  ])('leaves %s.%s on the cluster collation', async (table, column) => {
    /*
     * Slugs are identifiers. They must compare exactly and sort stably, and a Turkish
     * collation would make `İ`/`ı` comparisons locale-dependent inside a uniqueness index —
     * the same reason `04` §Conventions keeps emails and tokens on C.
     */
    const rows = await getPrisma().$queryRaw<{ collation: string | null }[]>`
      SELECT co.collname AS collation
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      LEFT JOIN pg_collation co ON co.oid = a.attcollation
      WHERE c.relname = ${table} AND a.attname = ${column}
    `
    expect(rows[0]?.collation).not.toBe('tr-TR-x-icu')
  })

  it('makes the slug unique per locale, not globally (ADR-017)', async () => {
    // The contradiction this migration settled: `04` said one slug per entity, `07` said
    // `en` has its own set. The index is what makes `07` true.
    const rows = await getPrisma().$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'ProductTranslation' AND indexdef LIKE '%UNIQUE%'
    `
    const perLocale = rows.filter(
      (row) => row.indexdef.includes('locale') && row.indexdef.includes('slug'),
    )

    expect(perLocale.length).toBeGreaterThanOrEqual(1)
  })

  it('accepts the same slug in two locales and refuses it twice in one', async () => {
    await withRollback(async (tx) => {
      const category = await tx.category.create({ data: {} })
      const product = await tx.product.create({
        data: { categoryId: category.id, basisType: 'UNIT' },
      })

      // One word, both locales — "pergola" is the same in Turkish and English, and nothing
      // should stop it being the slug in each.
      await tx.productTranslation.create({
        data: { productId: product.id, locale: 'tr', slug: 'pergola', name: 'Pergola' },
      })
      await tx.productTranslation.create({
        data: { productId: product.id, locale: 'en', slug: 'pergola', name: 'Pergola' },
      })

      const other = await tx.product.create({
        data: { categoryId: category.id, basisType: 'UNIT' },
      })
      await expect(
        tx.productTranslation.create({
          data: { productId: other.id, locale: 'tr', slug: 'pergola', name: 'Pergola 2' },
        }),
      ).rejects.toThrow()
    })
  })
})
