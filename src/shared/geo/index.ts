import 'server-only'

import { Prisma, prisma } from '@/shared/db'

/**
 * The PostGIS boundary.
 *
 * Prisma has no `geography` type, so every spatial column is `Unsupported(...)` in the
 * schema and is invisible to the query builder. Rather than scattering `$queryRaw` through
 * the modules, all of it lives here: this file is the only place in the application that
 * writes PostGIS SQL, and `ADR-002` is enforced by that fact rather than by review.
 *
 * The rule `ADR-002` actually cares about: **no Haversine in application code.** Distance
 * and containment are computed by the database, on an indexed `geography` column, or not at
 * all. A JavaScript distance function cannot use the GiST index, which turns every match
 * run into a full scan over every company.
 *
 * Phase 3 adds `ServiceArea` with the same pattern — `centerPoint` as `Unsupported`, its
 * GiST index in the migration, and its containment query as a function here.
 */

/** WGS 84. The only SRID in the system; PostGIS `geography` assumes it. */
export const SRID = 4326

export type Point = {
  /** Degrees, −90..90. */
  latitude: number
  /** Degrees, −180..180. */
  longitude: number
}

export class GeoError extends Error {
  override readonly name = 'GeoError'
}

export function assertPoint(point: Point): void {
  const { latitude, longitude } = point

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new GeoError(`latitude out of range: ${latitude}`)
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new GeoError(`longitude out of range: ${longitude}`)
  }
}

/**
 * A point as a parameterised SQL fragment. Note the argument order: PostGIS
 * `ST_MakePoint` takes **(longitude, latitude)**, which is the reverse of how everyone says
 * it out loud and the single likeliest bug in any spatial codebase. It is built here, once,
 * so no call site has to remember.
 */
export function pointSql(point: Point): Prisma.Sql {
  assertPoint(point)
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), ${SRID})::geography`
}

/**
 * `ST_DWithin` — "is this point within N metres of that one", evaluated by the index.
 * `geography` distances are metres, so the caller's kilometres are converted here.
 *
 * This is the shape `09-manufacturer-matching.md` uses for radius service areas:
 * `ST_DWithin(sa.center_point, :projectPoint, sa.radius_km * 1000)`.
 */
export function withinSql(column: Prisma.Sql, centre: Point, radiusKm: number): Prisma.Sql {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new GeoError(`radiusKm must be a positive number, received ${radiusKm}`)
  }
  return Prisma.sql`ST_DWithin(${column}, ${pointSql(centre)}, ${radiusKm * 1000})`
}

/** Metres between two points, computed by PostGIS on the spheroid. */
export async function distanceMetres(from: Point, to: Point): Promise<number> {
  const rows = await prisma.$queryRaw<{ metres: number }[]>`
    SELECT ST_Distance(${pointSql(from)}, ${pointSql(to)}) AS metres
  `
  const first = rows[0]
  if (first === undefined) throw new GeoError('ST_Distance returned no rows')
  return Number(first.metres)
}

/** Writes a point onto a row whose column Prisma cannot see. */
export async function setPoint(
  table: 'CompanyContact' | 'City' | 'District' | 'ServiceArea' | 'Project',
  id: string,
  point: Point,
): Promise<void> {
  // The table name cannot be a bind parameter, so it comes from a closed union rather than
  // from anything a caller can construct — the alternative is string interpolation into SQL.
  const relation = Prisma.raw(`"${table}"`)
  // `ServiceArea` calls its column `centerPoint`; everything else calls it `point`. One
  // more closed-union lookup rather than a second function that would drift from this one.
  const column = Prisma.raw(table === 'ServiceArea' ? '"centerPoint"' : '"point"')
  await prisma.$executeRaw`UPDATE ${relation} SET ${column} = ${pointSql(point)} WHERE "id" = ${id}`
}

/** Reads a point back. `null` when the row has none. */
export async function getPoint(
  table: 'CompanyContact' | 'City' | 'District' | 'ServiceArea' | 'Project',
  id: string,
): Promise<Point | null> {
  const relation = Prisma.raw(`"${table}"`)
  const column = Prisma.raw(table === 'ServiceArea' ? '"centerPoint"' : '"point"')
  const rows = await prisma.$queryRaw<{ latitude: number | null; longitude: number | null }[]>`
    SELECT ST_Y(${column}::geometry) AS latitude, ST_X(${column}::geometry) AS longitude
    FROM ${relation}
    WHERE "id" = ${id}
  `

  const first = rows[0]
  if (first === undefined || first.latitude === null || first.longitude === null) return null

  return { latitude: Number(first.latitude), longitude: Number(first.longitude) }
}

/** The PostGIS version string, for `/api/health` and for proving the extension is loaded. */
export async function postgisVersion(): Promise<string> {
  const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT PostGIS_Version() AS version`
  const first = rows[0]
  if (first === undefined) throw new GeoError('PostGIS_Version() returned no rows')
  return first.version
}

/**
 * Companies whose service area covers a point — `09-manufacturer-matching.md`
 * §Service-area coverage, verbatim.
 *
 * All three kinds in one query, because a company mixes them and a union in SQL is one
 * index scan per branch rather than three round trips. The `RADIUS` branch is the reason
 * `ServiceArea.centerPoint` has a GiST index: `ST_DWithin` on a `geography` column uses it,
 * and the same predicate written in JavaScript would not (`ADR-002`, `ADR-015`).
 *
 * Phase 5 wraps this in the matching filter; Phase 3 needs it to prove the boundary case.
 */
export async function companiesCovering(input: {
  point: Point
  cityId: string
  districtId?: string | null
}): Promise<string[]> {
  assertPoint(input.point)

  const rows = await prisma.$queryRaw<{ companyId: string }[]>`
    SELECT DISTINCT sa."companyId"
    FROM "ServiceArea" sa
    WHERE sa."isActive" = true
      AND (
        (sa."kind" = 'CITY'     AND sa."cityId"     = ${input.cityId})
        OR (sa."kind" = 'DISTRICT' AND sa."districtId" = ${input.districtId ?? null})
        OR (
          sa."kind" = 'RADIUS'
          AND sa."centerPoint" IS NOT NULL
          -- The constant ceiling first (ServiceArea_radiusKm_range CHECKs radiusKm to
          -- 5..500), so the GiST index has a usable condition; the per-row test the index
          -- cannot see runs second. Same pattern as eligibleCompaniesForProject (ADR-025).
          AND ST_DWithin(sa."centerPoint", ${pointSql(input.point)}, 500000)
          AND ST_DWithin(sa."centerPoint", ${pointSql(input.point)}, sa."radiusKm" * 1000)
        )
      )
  `

  return rows.map((row) => row.companyId)
}

/**
 * One eligible candidate for one project — the row shape `09-manufacturer-matching.md`
 * §Eligibility's single query produces. Distances are metres (PostGIS `geography`); the
 * caller converts to kilometres for display and scoring.
 */
export type EligibleCompanyRow = {
  companyId: string
  priceOnRequest: boolean
  verifiedAt: Date | null
  /** Company ↔ project: nearest matched RADIUS centre, else the company contact point. */
  distanceMetres: number | null
  /** The tightest matched radius, for normalising proximity over it. Null off RADIUS. */
  radiusKm: number | null
  /** Which service-area kinds matched — 'CITY' | 'DISTRICT' | 'RADIUS'. */
  matchedKinds: string[]
  /** `ServiceArea.precision` values among matched areas (Q22). Nulls are legacy rows. */
  areaPrecisions: (string | null)[]
}

/**
 * The eligibility filter — `09-manufacturer-matching.md` §1, as **one SQL query**.
 *
 * Five conditions, and the reason they are one query rather than five and a JS intersection
 * is the `RADIUS` branch: `ST_DWithin` on `ServiceArea.centerPoint` is what the GiST index
 * exists for, and it can only be used by the database (`ADR-002`). The rest of the
 * conditions ride along as joins so the candidate set never materialises in the application
 * at all.
 *
 *   1. `Company.status = VERIFIED`, not soft-deleted   — the JOIN on `Company`
 *   2. active `CompanyProduct` for the project product — the JOIN on `CompanyProduct`
 *   3. a `ServiceArea` covers the project location     — the JOIN on `ServiceArea`
 *   4. every *selected required* option is offered     — the NOT EXISTS
 *   5. not SUSPENDED                                   — implied by 1 (status is one value)
 *
 * A customer blocklist is condition 5's other half in `09`; no such table exists yet, so
 * there is deliberately no clause pretending to check one.
 *
 * Option semantics per the schema's own comment on `CompanyProductOption`: **the absence of
 * a row means not offered.** So "offered" is `EXISTS (… isOffered = true)`, and a required
 * selected option with no row disqualifies.
 *
 * Distance: the nearest matched RADIUS centre when one matched, else the company's contact
 * point. Both can be null — a CITY-matched company with no located contact simply has no
 * distance, which ranks last within its tier rather than being invented.
 *
 * Price, rating and response time are **not here** (`09` §1: "Not filters").
 *
 * `widenRadiusKm` is `09` §Zero-result handling step 1: the RADIUS test alone runs with the
 * given slack added to every area's own radius, and the caller labels what it shows. CITY
 * and DISTRICT areas have no radius to widen; widening them would mean inventing a
 * neighbouring-province rule nobody wrote.
 */
export async function eligibleCompaniesForProject(
  projectId: string,
  options: { widenRadiusKm?: number } = {},
): Promise<EligibleCompanyRow[]> {
  const widenKm = options.widenRadiusKm ?? 0
  // The GiST pre-filter's constant must stay a ceiling for the widened test too.
  const ceilingMetres = 500_000 + widenKm * 1000
  const rows = await prisma.$queryRaw<
    {
      companyId: string
      priceOnRequest: boolean
      verifiedAt: Date | null
      distanceMetres: number | null
      radiusKm: number | null
      matchedKinds: string[]
      areaPrecisions: (string | null)[]
    }[]
  >`
    SELECT
      c."id"             AS "companyId",
      c."priceOnRequest" AS "priceOnRequest",
      c."verifiedAt"     AS "verifiedAt",
      COALESCE(
        MIN(CASE WHEN sa."kind" = 'RADIUS' THEN ST_Distance(sa."centerPoint", p."point") END),
        MIN(ST_Distance(cc."point", p."point"))
      )                  AS "distanceMetres",
      MIN(CASE WHEN sa."kind" = 'RADIUS' THEN sa."radiusKm" END) AS "radiusKm",
      array_agg(DISTINCT sa."kind"::text)      AS "matchedKinds",
      array_agg(DISTINCT sa."precision"::text) AS "areaPrecisions"
    FROM "Project" p
    JOIN "Company" c
      ON c."status" = 'VERIFIED' AND c."deletedAt" IS NULL
    JOIN "CompanyProduct" cp
      ON cp."companyId" = c."id" AND cp."productId" = p."productId" AND cp."isActive" = true
    JOIN "ServiceArea" sa
      ON sa."companyId" = c."id" AND sa."isActive" = true
      AND (
        (sa."kind" = 'CITY'     AND sa."cityId"     = p."cityId")
        OR (sa."kind" = 'DISTRICT' AND sa."districtId" = p."districtId")
        OR (
          sa."kind" = 'RADIUS'
          AND sa."centerPoint" IS NOT NULL
          AND p."point" IS NOT NULL
          /*
           * Two ST_DWithin calls on purpose, and the order matters.
           *
           * 09's own SQL -- ST_DWithin(..., sa."radiusKm" * 1000) -- cannot use the GiST
           * index by itself: the expansion distance is a column of the indexed table, and
           * an index condition must be constant with respect to the scanned relation
           * (EXPLAIN shows it demoted to a row filter). The first call uses the database's
           * own ceiling -- ServiceArea_radiusKm_range, migration 7's CHECK, 5..500 km --
           * as a constant, which the planner turns into
           * "centerPoint && _st_expand(point, 500000)", an index condition. The second
           * call is the exact per-area test the first one over-approximates. The ceiling
           * is a CONSTRAINT, not a Zod convention: a raw row with radiusKm > 500 would
           * silently fall out of every match, so the database refuses to hold one
           * (ADR-025).
           */
          AND ST_DWithin(sa."centerPoint", p."point", ${ceilingMetres})
          AND ST_DWithin(sa."centerPoint", p."point", (sa."radiusKm" + ${widenKm}) * 1000)
        )
      )
    LEFT JOIN "CompanyContact" cc ON cc."companyId" = c."id"
    WHERE p."id" = ${projectId}
      AND p."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "ProjectAttributeValue" pav
        JOIN "ProductAttribute" pa ON pa."id" = pav."attributeId" AND pa."isRequired" = true
        WHERE pav."projectId" = p."id"
          AND pav."optionId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "CompanyProductOption" cpo
            WHERE cpo."companyProductId" = cp."id"
              AND cpo."optionId" = pav."optionId"
              AND cpo."isOffered" = true
          )
      )
    GROUP BY c."id", c."priceOnRequest", c."verifiedAt"
    ORDER BY c."id"
  `

  return rows.map((row) => ({
    ...row,
    distanceMetres: row.distanceMetres === null ? null : Number(row.distanceMetres),
    radiusKm: row.radiusKm === null ? null : Number(row.radiusKm),
    // `array_agg(DISTINCT …::text)` folds SQL NULLs in; keep them — a null precision is a
    // legacy row whose accuracy is unknown, and unknown is information (Q22).
  }))
}

/**
 * `09` §Zero-result handling step 2: verified companies whose service area covers the
 * project's location but who do **not** offer its product — "may be able to help", clearly
 * separated from matches by the caller. Same coverage predicate as eligibility, product
 * join inverted into a NOT EXISTS.
 */
export async function companiesServingLocationWithoutProduct(
  projectId: string,
): Promise<{ companyId: string }[]> {
  return prisma.$queryRaw<{ companyId: string }[]>`
    SELECT DISTINCT c."id" AS "companyId"
    FROM "Project" p
    JOIN "Company" c
      ON c."status" = 'VERIFIED' AND c."deletedAt" IS NULL
    JOIN "ServiceArea" sa
      ON sa."companyId" = c."id" AND sa."isActive" = true
      AND (
        (sa."kind" = 'CITY'     AND sa."cityId"     = p."cityId")
        OR (sa."kind" = 'DISTRICT' AND sa."districtId" = p."districtId")
        OR (
          sa."kind" = 'RADIUS'
          AND sa."centerPoint" IS NOT NULL
          AND p."point" IS NOT NULL
          AND ST_DWithin(sa."centerPoint", p."point", 500000)
          AND ST_DWithin(sa."centerPoint", p."point", sa."radiusKm" * 1000)
        )
      )
    WHERE p."id" = ${projectId}
      AND p."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "CompanyProduct" cp
        WHERE cp."companyId" = c."id" AND cp."productId" = p."productId" AND cp."isActive" = true
      )
    ORDER BY c."id"
  `
}

/** Metres from a service area's centre to a point. `null` when the area has no centre. */
export async function distanceToServiceArea(
  serviceAreaId: string,
  point: Point,
): Promise<number | null> {
  assertPoint(point)

  const rows = await prisma.$queryRaw<{ metres: number | null }[]>`
    SELECT ST_Distance("centerPoint", ${pointSql(point)}) AS metres
    FROM "ServiceArea"
    WHERE "id" = ${serviceAreaId}
  `

  const metres = rows[0]?.metres
  return metres === null || metres === undefined ? null : Number(metres)
}
