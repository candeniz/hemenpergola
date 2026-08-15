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
  table: 'CompanyContact' | 'City' | 'District',
  id: string,
  point: Point,
): Promise<void> {
  // The table name cannot be a bind parameter, so it comes from a closed union rather than
  // from anything a caller can construct — the alternative is string interpolation into SQL.
  const relation = Prisma.raw(`"${table}"`)
  await prisma.$executeRaw`UPDATE ${relation} SET "point" = ${pointSql(point)} WHERE "id" = ${id}`
}

/** Reads a point back. `null` when the row has none. */
export async function getPoint(
  table: 'CompanyContact' | 'City' | 'District',
  id: string,
): Promise<Point | null> {
  const relation = Prisma.raw(`"${table}"`)
  const rows = await prisma.$queryRaw<{ latitude: number | null; longitude: number | null }[]>`
    SELECT ST_Y("point"::geometry) AS latitude, ST_X("point"::geometry) AS longitude
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
