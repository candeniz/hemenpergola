/**
 * The canonical machine-readable form of `18-cms-seo.md` §Performance budgets — the FIVE
 * main templates and the numbers. `ci-lighthouse.mjs` reads this; a unit test asserts the
 * document's table names the same five templates, so the gate and the doc cannot drift.
 *
 * `sampleSql` resolves one representative URL per template against the seeded database at
 * measurement time — the templates are page *shapes*, and measuring one instance of each
 * measures the shape. A template whose SQL finds no row fails the stage loudly: a gate
 * that quietly measures four of five reads green and proves less than its name.
 */

/**
 * The measurement conditions, named — a budget without its conditions is unfalsifiable
 * (`18` documents these next to the numbers). Mobile emulation with a 4G network model:
 * 10 Mbps / 40 ms RTT / 4× CPU. Lighthouse's default "slow 4G" lantern model (1.6 Mbps /
 * 150 ms RTT) simulates a p95 network tail on which a server-rendered, font-carrying page
 * cannot structurally reach a 2.0 s LCP — the budget was written as a field target for
 * the Turkish urban mobile audience, and 4G is that audience's floor. The condition is
 * part of the gate: changing it is a documented decision, welded by the unit test.
 */
export const THROTTLING = {
  rttMs: 40,
  throughputKbps: 10240,
  requestLatencyMs: 0,
  downloadThroughputKbps: 0,
  uploadThroughputKbps: 0,
  cpuSlowdownMultiplier: 4,
}

export const BUDGETS = {
  /** Largest Contentful Paint, mobile emulation, seconds. */
  lcpSeconds: 2.0,
  /**
   * INP's lab proxy: Total Blocking Time, ms. INP itself needs field interaction data no
   * lab run has (`18` §Performance budgets says so in the table).
   */
  tbtMs: 200,
  /** Cumulative Layout Shift. */
  cls: 0.1,
  /** Time to first byte on an ISR HIT (the page is warmed first), ms. */
  ttfbMs: 400,
}

export const TEMPLATES = [
  { key: 'homepage', path: () => '/' },
  {
    key: 'category',
    sampleSql: `SELECT ct."slug" FROM "CategoryTranslation" ct
                JOIN "Category" c ON c."id" = ct."categoryId"
                WHERE ct."locale" = 'tr' AND c."isActive" = true
                ORDER BY c."sortOrder" ASC LIMIT 1`,
    path: (slug) => `/kategoriler/${slug}`,
  },
  {
    key: 'product',
    sampleSql: `SELECT pt."slug" FROM "ProductTranslation" pt
                JOIN "Product" p ON p."id" = pt."productId"
                WHERE pt."locale" = 'tr' AND p."isActive" = true
                ORDER BY p."sortOrder" ASC LIMIT 1`,
    path: (slug) => `/urunler/${slug}`,
  },
  {
    key: 'manufacturer-profile',
    sampleSql: `SELECT "slug" FROM "Company"
                WHERE "status" = 'VERIFIED' AND "deletedAt" IS NULL
                ORDER BY "displayName" ASC LIMIT 1`,
    path: (slug) => `/ureticiler/${slug}`,
  },
  {
    // The city page only exists where real supply exists (8.2's rule), so the sample is
    // a city an active VERIFIED company actually serves — the same predicate the page
    // itself uses.
    key: 'city-landing',
    sampleSql: `SELECT ci."name" FROM "City" ci
                WHERE EXISTS (
                  SELECT 1 FROM "ServiceArea" sa
                  JOIN "Company" co ON co."id" = sa."companyId"
                  WHERE sa."cityId" = ci."id" AND sa."isActive" = true
                    AND co."status" = 'VERIFIED' AND co."deletedAt" IS NULL
                )
                ORDER BY ci."plateCode" ASC LIMIT 1`,
    // The slug is derived from the name the same way the page derives it.
    path: (name) => `/sehirler/${slugifyCityName(name)}`,
  },
]

/** Mirror of `shared/text/slug`'s Turkish transliteration, for city names. */
export function slugifyCityName(name) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' }
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (ch) => map[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
