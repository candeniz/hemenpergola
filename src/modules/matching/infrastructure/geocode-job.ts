import 'server-only'

import { prisma } from '@/shared/db'

import { geocodeQueryForServiceArea, getGeocoder } from './geocoder'

/**
 * `geo.geocode_service_area` — `05-system-architecture.md` §Background work.
 *
 * **In `infrastructure/`, not `application/`.** `05` §Shape defines an application service
 * as something that takes an `ActorContext`, asserts a permission and returns a `Result`; a
 * job handler does none of the three, because no user calls it. Same reasoning that already
 * put `audit/infrastructure/audit-log.ts` there — and the authorisation-matrix scan is what
 * pointed it out, by refusing an exported `application/` function with no matrix entry.
 *
 * Fills `ServiceArea.centerPoint` after a `RADIUS` area is saved.
 *
 * ## Idempotent, and here is exactly why it is
 *
 * `23` §Runtime requires it: a worker being replaced is drained, an in-flight job is retried
 * on the new instance, and a job that ran halfway before the old process went away runs
 * again from the start.
 *
 * This handler is idempotent because it is a **pure function of the row** — it reads the
 * area's city, district and label, resolves them, and writes the result. Running it twice
 * resolves the same inputs to the same point and writes the same value. Nothing accumulates,
 * nothing is appended, and there is no "already done" flag to get out of step with reality.
 *
 * The version that would *not* be idempotent is the tempting one: geocode on save, in the
 * request, and skip if `centerPoint` is already set. That skips the re-geocode after a
 * manufacturer corrects their district, which is the case that matters.
 */
export type GeocodeOutcome =
  | { status: 'geocoded'; precision: 'exact' | 'district' | 'city' }
  | { status: 'not-a-radius' }
  | { status: 'unresolvable' }

export async function runGeocodeServiceArea(serviceAreaId: string): Promise<GeocodeOutcome> {
  const query = await geocodeQueryForServiceArea(serviceAreaId)
  if (query.status === 'not-a-radius') return { status: 'not-a-radius' }
  /*
   * A radius with nothing to resolve from is *not* the same as a row this job does not
   * handle, and collapsing the two would report "not a radius" for an area that very much
   * is one — and is quietly matching nobody.
   */
  if (query.status === 'nothing-to-resolve') return { status: 'unresolvable' }

  const resolved = await getGeocoder().resolve(query.query)
  if (resolved === null) {
    /*
     * Left unset rather than defaulted to somewhere plausible. A radius around the wrong
     * point is worse than a radius around nowhere: the second shows up as a service area
     * that matches nothing and gets fixed, the first quietly matches the wrong city.
     */
    return { status: 'unresolvable' }
  }

  const { setPoint } = await import('@/shared/geo')
  await setPoint('ServiceArea', serviceAreaId, resolved.point)

  /*
   * Q22, migration 7: the precision is persisted, not just returned. Until Phase 5 the port
   * computed this and the row discarded it, so one end of every radius comparison could not
   * report its own accuracy. Written in the same idempotent spirit as the point: a re-run
   * resolves the same inputs to the same precision.
   */
  await prisma.serviceArea.update({
    where: { id: serviceAreaId },
    data: {
      precision:
        resolved.precision === 'exact'
          ? 'EXACT'
          : resolved.precision === 'district'
            ? 'DISTRICT'
            : 'CITY',
    },
  })

  return { status: 'geocoded', precision: resolved.precision }
}

/** Areas whose centre never resolved, for the screen to show as needing attention. */
export async function unresolvedRadiusAreas(companyId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "ServiceArea"
    WHERE "companyId" = ${companyId} AND "kind" = 'RADIUS' AND "centerPoint" IS NULL
  `
  return rows.map((row) => row.id)
}
