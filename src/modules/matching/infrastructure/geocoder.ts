import 'server-only'

import { prisma } from '@/shared/db'
import type { Point } from '@/shared/geo'

/**
 * The `Geocoder` port — `05-system-architecture.md` §Ports — and its V1 adapter.
 *
 * ## Q4, decided (`ADR-019`)
 *
 * `26` §Decision calendar put "geocoding provider and budget" at the start of Phase 3, and
 * the answer is that **V1 needs no provider**, because it needs no street-level accuracy.
 *
 * A `RADIUS` service area says "we work within N kilometres of here". The uncertainty that
 * matters is N — a manufacturer picks 30 or 50, not 32.4 — and on the other side of the
 * comparison `09` §Service-area coverage already accepts a **district centroid** as the
 * project's point when the customer gave no precise location. Paying a provider to place one
 * end of that comparison to within ten metres, while the other end is the middle of a
 * district, buys nothing.
 *
 * So the adapter resolves city + district to the centroid Phase 0 already seeded — 974 of
 * them, offline, free, no rate limit, and no address leaving the country — and a manufacturer
 * who knows their coordinates can supply them directly, which is the precision escape hatch
 * without a map-tile vendor.
 *
 * The port stays, because the day street-level accuracy is needed it is one file. What was
 * bought by deciding this way is that nothing in Phase 3 waits on a procurement decision.
 */

export type GeocodeQuery = {
  cityId?: string | null
  districtId?: string | null
  /** What the manufacturer typed. Kept for a future adapter; unused by this one. */
  label?: string | null
  /** Coordinates the manufacturer supplied directly. Wins over everything else. */
  point?: Point | null
}

export type GeocodeResult = {
  point: Point
  /**
   * How the point was arrived at. Stored and shown, because a radius drawn around a
   * district centroid is a different promise from one drawn around a pin, and the
   * manufacturer should be able to tell which they have.
   */
  precision: 'exact' | 'district' | 'city'
}

export type Geocoder = {
  readonly name: string
  resolve(query: GeocodeQuery): Promise<GeocodeResult | null>
}

/**
 * The V1 adapter: administrative centroids, from the geography seeded in Phase 0.
 *
 * Deliberately *not* called `nullGeocoder` or `stubGeocoder`. It is a real geocoder with a
 * coarse resolution, it is the one V1 ships, and naming it after what it lacks would invite
 * somebody to replace it before finding out whether the resolution is a problem.
 */
export const administrativeGeocoder: Geocoder = {
  name: 'administrative-centroid',

  async resolve(query) {
    if (query.point != null) return { point: query.point, precision: 'exact' }

    if (query.districtId != null) {
      const point = await centroid('District', query.districtId)
      if (point !== null) return { point, precision: 'district' }
    }

    if (query.cityId != null) {
      const point = await centroid('City', query.cityId)
      if (point !== null) return { point, precision: 'city' }
    }

    return null
  },
}

/**
 * Read a seeded centroid.
 *
 * `ADR-015`: every spatial read goes through `shared/geo`, which cannot see these columns
 * through the Prisma client. The table name is one of two literals, never input.
 */
async function centroid(table: 'City' | 'District', id: string): Promise<Point | null> {
  const { getPoint } = await import('@/shared/geo')
  return getPoint(table, id)
}

let geocoder: Geocoder | undefined

export function getGeocoder(): Geocoder {
  geocoder ??= administrativeGeocoder
  return geocoder
}

/** Tests, and the day a real provider arrives. */
export function setGeocoder(next: Geocoder): void {
  geocoder = next
}

/**
 * A service area's own resolution inputs, read from the row.
 *
 * Separate from `resolve` so the job stays a thin wrapper: fetch, resolve, write. Anything
 * more in the handler would have to be duplicated by whatever re-geocodes in bulk later.
 */
export type ServiceAreaQuery =
  | { status: 'ready'; query: GeocodeQuery }
  /** The row is not a `RADIUS` area, so there is nothing for this job to do. */
  | { status: 'not-a-radius' }
  /** It is a radius, and there is no city, district or company point to resolve from. */
  | { status: 'nothing-to-resolve' }

export async function geocodeQueryForServiceArea(serviceAreaId: string): Promise<ServiceAreaQuery> {
  const area = await prisma.serviceArea.findUnique({
    where: { id: serviceAreaId },
    select: { kind: true, cityId: true, districtId: true, centerLabel: true, companyId: true },
  })
  if (area === null || area.kind !== 'RADIUS') return { status: 'not-a-radius' }

  if (area.cityId !== null || area.districtId !== null) {
    return {
      status: 'ready',
      query: { cityId: area.cityId, districtId: area.districtId, label: area.centerLabel },
    }
  }

  /*
   * No city or district on the area itself: fall back to where the company is. A radius with
   * no stated centre almost always means "around us", and the company's contact row already
   * carries a city, a district and — if they placed one — a point.
   */
  const contact = await prisma.companyContact.findUnique({
    where: { companyId: area.companyId },
    select: { cityId: true, districtId: true },
  })
  if (contact === null) return { status: 'nothing-to-resolve' }

  const { getPoint } = await import('@/shared/geo')
  const companyPoint = await getPoint('CompanyContact', area.companyId)

  return {
    status: 'ready',
    query: {
      cityId: contact.cityId,
      districtId: contact.districtId,
      label: area.centerLabel,
      point: companyPoint,
    },
  }
}
