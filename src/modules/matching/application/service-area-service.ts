import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { enqueue, JOB } from '@/shared/jobs'
import { err, notFound, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

/**
 * Service areas — task 3.6, `manufacturer_service_area_management`,
 * `09-manufacturer-matching.md` §Service-area coverage.
 *
 * In `matching/` because a service area exists for exactly one reader: the matching filter.
 * Nothing else in the product cares where a company works — the profile screen shows it, but
 * showing is not owning, and putting it in `iam/` would make the identity module hold a
 * PostGIS column it never queries.
 *
 * ## Radius areas and the job
 *
 * A `RADIUS` area is saved **without** a centre and the centre is filled by
 * `geo.geocode_service_area`. That is one more moving part than resolving it inline, and it
 * is the right one: `05` §Background work already names the job, resolving in the request
 * couples a save to whatever the geocoder is that week, and — the part that matters — a job
 * can be re-run over every row when the geocoder gets better, which an inline call cannot.
 */

export const listServiceAreasSchema = z.object({ companyId: z.string().min(1) })
export type ListServiceAreasInput = z.infer<typeof listServiceAreasSchema>

export const addServiceAreaSchema = z
  .object({
    companyId: z.string().min(1),
    kind: z.enum(['CITY', 'DISTRICT', 'RADIUS']),
    cityId: z.string().min(1).optional(),
    districtId: z.string().min(1).optional(),
    /** `09`: kilometres. Under 5 km is a street, over 500 km is the whole country. */
    radiusKm: z.number().int().min(5).max(500).optional(),
    centerLabel: z.string().trim().max(200).optional(),
  })
  .refine((value) => value.kind !== 'CITY' || value.cityId !== undefined, {
    message: 'a CITY area needs a city',
    path: ['cityId'],
  })
  .refine((value) => value.kind !== 'DISTRICT' || value.districtId !== undefined, {
    message: 'a DISTRICT area needs a district',
    path: ['districtId'],
  })
  .refine((value) => value.kind !== 'RADIUS' || value.radiusKm !== undefined, {
    message: 'a RADIUS area needs a radius',
    path: ['radiusKm'],
  })
export type AddServiceAreaInput = z.infer<typeof addServiceAreaSchema>

export const removeServiceAreaSchema = z.object({
  companyId: z.string().min(1),
  serviceAreaId: z.string().min(1),
})
export type RemoveServiceAreaInput = z.infer<typeof removeServiceAreaSchema>

export type ServiceAreaView = {
  id: string
  kind: 'CITY' | 'DISTRICT' | 'RADIUS'
  cityId: string | null
  cityName: string | null
  districtId: string | null
  districtName: string | null
  radiusKm: number | null
  centerLabel: string | null
  isActive: boolean
  /** `null` while the geocode job has not run, or could not resolve a centre. */
  centre: { latitude: number; longitude: number } | null
}

export const listServiceAreas = serviceMethod<ListServiceAreasInput, { areas: ServiceAreaView[] }>(
  'matching',
  'listServiceAreas',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_READ)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const rows = await prisma.serviceArea.findMany({
      where: { companyId },
      include: { city: { select: { name: true } }, district: { select: { name: true } } },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    })

    const { getPoint } = await import('@/shared/geo')

    const areas: ServiceAreaView[] = []
    for (const row of rows) {
      const centre = row.kind === 'RADIUS' ? await getPoint('ServiceArea', row.id) : null

      areas.push({
        id: row.id,
        kind: row.kind,
        cityId: row.cityId,
        cityName: row.city?.name ?? null,
        districtId: row.districtId,
        districtName: row.district?.name ?? null,
        radiusKm: row.radiusKm,
        centerLabel: row.centerLabel,
        isActive: row.isActive,
        centre,
      })
    }

    return ok({ areas })
  },
)

export type AddServiceAreaResult = {
  serviceAreaId: string
  /** True when a geocode job was queued. A `RADIUS` area has no centre until it runs. */
  geocodeQueued: boolean
}

export const addServiceArea = serviceMethod<AddServiceAreaInput, AddServiceAreaResult>(
  'matching',
  'addServiceArea',
  { kind: 'permission', permission: PERMISSIONS.SERVICE_AREA_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.SERVICE_AREA_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    if (input.cityId !== undefined) {
      if ((await prisma.city.findUnique({ where: { id: input.cityId } })) === null) {
        return err(notFound('City'))
      }
    }
    if (input.districtId !== undefined) {
      const district = await prisma.district.findUnique({ where: { id: input.districtId } })
      if (district === null) return err(notFound('District'))
      // A district area carries its city too, so `09`'s CITY branch and the screen both
      // have it without a second join.
      input.cityId ??= district.cityId
    }

    /*
     * The same area twice is not an error worth a 409 — it is a manufacturer clicking twice
     * — but it must not double a row, because `companiesCovering` would then return the
     * company twice and `09` §4's ranking would have to de-duplicate.
     */
    const existing = await prisma.serviceArea.findFirst({
      where: {
        companyId,
        kind: input.kind,
        cityId: input.cityId ?? null,
        districtId: input.districtId ?? null,
        ...(input.kind === 'RADIUS' ? { radiusKm: input.radiusKm ?? null } : {}),
      },
    })

    const area =
      existing ??
      (await prisma.serviceArea.create({
        data: {
          companyId,
          kind: input.kind,
          cityId: input.cityId ?? null,
          districtId: input.districtId ?? null,
          radiusKm: input.radiusKm ?? null,
          centerLabel: input.centerLabel ?? null,
          isActive: true,
        },
      }))

    if (existing !== null) {
      await prisma.serviceArea.update({ where: { id: area.id }, data: { isActive: true } })
    }

    let geocodeQueued = false
    if (input.kind === 'RADIUS') {
      const jobId = await enqueue(
        JOB.geocodeServiceArea,
        { serviceAreaId: area.id },
        // One pending geocode per area however many times it is saved. The handler is
        // idempotent regardless, because a *completed* job stops deduplicating a new one.
        { singletonKey: `geocode:${area.id}` },
      )
      geocodeQueued = jobId !== null
    }

    await recordAudit(actor, {
      action: 'service_area_changed',
      entityType: 'ServiceArea',
      entityId: area.id,
      companyId,
      after: {
        kind: input.kind,
        cityId: input.cityId ?? null,
        districtId: input.districtId ?? null,
        radiusKm: input.radiusKm ?? null,
      },
    })

    return ok({ serviceAreaId: area.id, geocodeQueued })
  },
)

/**
 * Remove an area.
 *
 * A hard delete, not a soft one. `04` §Conventions keeps `deletedAt` for the three tables
 * where a hard delete would break history, and a service area is not history — it is a
 * current statement about where a company works. Past `MatchRun` rows record the *result*,
 * not the areas that produced it, so nothing points back here.
 */
export const removeServiceArea = serviceMethod<RemoveServiceAreaInput, { removed: true }>(
  'matching',
  'removeServiceArea',
  { kind: 'permission', permission: PERMISSIONS.SERVICE_AREA_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.SERVICE_AREA_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    // Ownership in the `where` clause (`CLAUDE.md` non-negotiable 3): another company's
    // area matches nothing rather than being found and then rejected.
    const removed = await prisma.serviceArea.deleteMany({
      where: { id: input.serviceAreaId, companyId },
    })

    if (removed.count === 0) return err(notFound('ServiceArea'))

    await recordAudit(actor, {
      action: 'service_area_changed',
      entityType: 'ServiceArea',
      entityId: input.serviceAreaId,
      companyId,
      before: { existed: true },
      after: { existed: false },
    })

    return ok({ removed: true } as const)
  },
)

/**
 * Does this company cover this point? The Phase 5 filter in miniature.
 *
 * Exposed now because the boundary case — a project just inside and just outside a radius —
 * is what `20` §Integration asks for by name, and a test that reimplemented the SQL would be
 * testing itself.
 */
export const coversPointSchema = z.object({
  cityId: z.string().min(1),
  districtId: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
export type CoversPointInput = z.infer<typeof coversPointSchema>

export const companiesCoveringPoint = serviceMethod<CoversPointInput, { companyIds: string[] }>(
  'matching',
  'companiesCoveringPoint',
  {
    kind: 'anonymous',
    why: 'coverage is a property of the public directory; a visitor may ask who works in their district',
  },
  async (actor, input) => {
    void actor
    const { companiesCovering } = await import('@/shared/geo')

    const companyIds = await companiesCovering({
      point: { latitude: input.latitude, longitude: input.longitude },
      cityId: input.cityId,
      districtId: input.districtId ?? null,
    })

    if (companyIds.length === 0) return ok({ companyIds })

    /*
     * Coverage is a claim; being matchable is a status. `02` §Verification state hides a
     * `SUSPENDED` company from search and matching, and a `PENDING` one has never been
     * checked — filtering here means every caller gets that for free rather than
     * remembering it.
     */
    const verified = await prisma.company.findMany({
      where: { id: { in: companyIds }, status: 'VERIFIED', deletedAt: null },
      select: { id: true },
    })

    return ok({ companyIds: verified.map((company) => company.id) })
  },
)

export const serviceAreaService = {
  listServiceAreas,
  addServiceArea,
  removeServiceArea,
  companiesCoveringPoint,
} satisfies Record<string, { meta: unknown }>

export const listCitiesSchema = z.object({ companyId: z.string().min(1) })
export type ListCitiesInput = z.infer<typeof listCitiesSchema>

/**
 * The provinces, for any screen that needs to name one — service areas, the price book's
 * regional table, and the public configurator's location step.
 *
 * A service method rather than a `prisma.city.findMany` in the page, because
 * `CLAUDE.md` non-negotiable 2 says pages call application services and nothing below them.
 *
 * **Anonymous since Phase 5, and the history is a bug worth recording.** Phase 3 gated this
 * behind `MEMBER_READ`, reasoning that only company screens read it — which `ADR-021`
 * quietly invalidated: the public wizard's location step reads it too, with a customer or
 * no session at all. The page's fallback for a failed load is an empty list, so the symptom
 * was two selects offering nothing, and the phase-4 gate never noticed because it never
 * chose a location. 81 seeded provinces are public reference data; there is nothing here a
 * permission protects.
 */
export const listCities = serviceMethod<
  ListCitiesInput,
  { cities: { cityId: string; name: string }[] }
>(
  'matching',
  'listCities',
  {
    kind: 'anonymous',
    why: 'public reference data (81 seeded provinces); the public configurator location step reads it with no session (ADR-021)',
  },
  async (actor, input) => {
    void actor
    void input

    // Turkish collation is on the column, so `İ` and `ı` order the way a Turkish reader
    // expects rather than the way ASCII does.
    const cities = await prisma.city.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    return ok({ cities: cities.map((city) => ({ cityId: city.id, name: city.name })) })
  },
)

export const listDistrictsSchema = z.object({ companyId: z.string().min(1) })
export type ListDistrictsInput = z.infer<typeof listDistrictsSchema>

/**
 * The districts, for the same screens `listCities` serves. Separate rather than nested in
 * the city payload: 974 rows is one query either way, and a screen that only needs provinces
 * should not carry them.
 */
export const listDistricts = serviceMethod<
  ListDistrictsInput,
  { districts: { id: string; cityId: string; name: string }[] }
>(
  'matching',
  'listDistricts',
  {
    kind: 'anonymous',
    why: 'public reference data (974 seeded districts); the public configurator location step reads it with no session (ADR-021)',
  },
  async (actor, input) => {
    void actor
    void input

    const districts = await prisma.district.findMany({
      select: { id: true, cityId: true, name: true },
      orderBy: { name: 'asc' },
    })

    return ok({ districts })
  },
)
