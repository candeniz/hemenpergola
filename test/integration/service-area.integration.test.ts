import { beforeAll, describe, expect, it } from 'vitest'

import {
  addServiceArea,
  companiesCoveringPoint,
  listServiceAreas,
  removeServiceArea,
} from '@/modules/matching/application/service-area-service'
import { runGeocodeServiceArea } from '@/modules/matching/infrastructure/geocode-job'
import { setGeocoder, administrativeGeocoder } from '@/modules/matching/infrastructure/geocoder'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'
import { getPoint, setPoint } from '@/shared/geo'

import { getPrisma } from './setup'

/**
 * Service areas and radius containment — task 3.6,
 * `09-manufacturer-matching.md` §Service-area coverage.
 *
 * `20-testing-strategy.md` §Integration asks for this one by name: *a project point just
 * inside and just outside a radius*. It is the test that cannot be written against a fake,
 * because what is under test is `ST_DWithin` on a `geography` column and the GiST index
 * behind it — the whole reason `ADR-002` put the calculation in the database.
 */

const ISTANBUL = { latitude: 41.0082, longitude: 28.9784 }

/** Metres per degree of latitude, near enough at this latitude for a boundary probe. */
const METRES_PER_DEGREE_LAT = 111_320

function northOf(origin: { latitude: number; longitude: number }, metres: number) {
  return { latitude: origin.latitude + metres / METRES_PER_DEGREE_LAT, longitude: origin.longitude }
}

let cityId = ''
let districtId = ''
let otherDistrictId = ''

async function owner(companyId: string): Promise<ActorContext> {
  return anonymousActor({
    userId: `usr_sa_${companyId}`,
    globalRole: 'CUSTOMER',
    companyId,
    companyRole: 'OWNER',
    companyStatus: 'VERIFIED',
    ip: '203.0.113.50',
  })
}

let sequence = 0
async function verifiedCompany(label: string): Promise<string> {
  sequence += 1
  const company = await getPrisma().company.create({
    data: {
      slug: `${label}-${sequence}`,
      legalName: `${label} A.Ş.`,
      displayName: label,
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })

  await getPrisma().user.upsert({
    where: { id: `usr_sa_${company.id}` },
    create: { id: `usr_sa_${company.id}`, email: `sa-${company.id}@example.com` },
    update: {},
  })

  return company.id
}

beforeAll(async () => {
  setGeocoder(administrativeGeocoder)

  const city = await getPrisma().city.create({ data: { name: 'İstanbul', plateCode: 934 } })
  cityId = city.id
  await setPoint('City', cityId, ISTANBUL)

  const district = await getPrisma().district.create({
    data: { cityId, name: 'Kadıköy' },
  })
  districtId = district.id
  await setPoint('District', districtId, ISTANBUL)

  const other = await getPrisma().district.create({ data: { cityId, name: 'Şile' } })
  otherDistrictId = other.id
  // 60 km north, well outside a 40 km radius drawn on the city centre.
  await setPoint('District', otherDistrictId, northOf(ISTANBUL, 60_000))
}, 120_000)

describe('the three kinds', () => {
  it('covers a point by CITY', async () => {
    const companyId = await verifiedCompany('Sehir')
    const actor = await owner(companyId)

    const added = await addServiceArea(actor, { kind: 'CITY', companyId, cityId })
    expect(added.ok).toBe(true)

    const covering = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId,
      ...ISTANBUL,
    })
    expect(covering.ok).toBe(true)
    if (!covering.ok) return
    expect(covering.value.companyIds).toContain(companyId)
  }, 60_000)

  it('covers a point by DISTRICT, and only that district', async () => {
    const companyId = await verifiedCompany('Ilce')
    const actor = await owner(companyId)

    await addServiceArea(actor, { kind: 'DISTRICT', companyId, districtId })

    const inside = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId,
      ...ISTANBUL,
    })
    const elsewhere = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId: otherDistrictId,
      ...northOf(ISTANBUL, 60_000),
    })

    expect(inside.ok && elsewhere.ok).toBe(true)
    if (!inside.ok || !elsewhere.ok) return
    expect(inside.value.companyIds).toContain(companyId)
    expect(elsewhere.value.companyIds).not.toContain(companyId)
  }, 60_000)

  it('fills the district’s city automatically', async () => {
    // A DISTRICT area carries its city, so `09`'s CITY branch and the screen both have it
    // without a second join — and a manufacturer who picked a district has not also
    // accidentally claimed the whole province.
    const companyId = await verifiedCompany('Otomatik')
    const actor = await owner(companyId)

    await addServiceArea(actor, { kind: 'DISTRICT', companyId, districtId })

    const listed = await listServiceAreas(actor, { companyId })
    if (!listed.ok) return
    expect(listed.value.areas[0]?.cityId).toBe(cityId)
    expect(listed.value.areas[0]?.districtName).toBe('Kadıköy')
  }, 60_000)
})

describe('RADIUS · the boundary', () => {
  it('covers a point just inside and not one just outside', async () => {
    /*
     * The assertion `20` §Integration names. A 40 km radius on the İstanbul centroid, with
     * one probe 1 km inside the edge and one 1 km outside it — close enough that a
     * flat-earth approximation, a metres/kilometres mix-up or a missing `::geography` cast
     * would put them on the same side.
     */
    const companyId = await verifiedCompany('Yaricap')
    const actor = await owner(companyId)

    const added = await addServiceArea(actor, {
      kind: 'RADIUS',
      companyId,
      cityId,
      districtId,
      radiusKm: 40,
    })
    expect(added.ok).toBe(true)
    if (!added.ok) return

    // The centre is filled by the job, not by the save.
    expect(await getPoint('ServiceArea', added.value.serviceAreaId)).toBeNull()
    await runGeocodeServiceArea(added.value.serviceAreaId)
    expect(await getPoint('ServiceArea', added.value.serviceAreaId)).not.toBeNull()

    const justInside = northOf(ISTANBUL, 39_000)
    const justOutside = northOf(ISTANBUL, 41_000)

    const inside = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId: otherDistrictId,
      ...justInside,
    })
    const outside = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId: otherDistrictId,
      ...justOutside,
    })

    expect(inside.ok && outside.ok).toBe(true)
    if (!inside.ok || !outside.ok) return

    expect(inside.value.companyIds, '39 km from a 40 km centre').toContain(companyId)
    expect(outside.value.companyIds, '41 km from a 40 km centre').not.toContain(companyId)
  }, 120_000)

  it('covers nothing until the job has run', async () => {
    // A radius with no centre must not match everything, and must not match nothing *by
    // accident* — the `IS NOT NULL` guard in the coverage query is what makes it explicit.
    const companyId = await verifiedCompany('Beklemede')
    const actor = await owner(companyId)

    await addServiceArea(actor, { kind: 'RADIUS', companyId, cityId, districtId, radiusKm: 50 })

    const covering = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId: otherDistrictId,
      ...ISTANBUL,
    })
    if (!covering.ok) return
    expect(covering.value.companyIds).not.toContain(companyId)
  }, 60_000)

  it('refuses a radius outside the supported range', async () => {
    const { addServiceAreaSchema } =
      await import('@/modules/matching/application/service-area-service')

    expect(
      addServiceAreaSchema.safeParse({ companyId: 'c', kind: 'RADIUS', radiusKm: 2 }).success,
    ).toBe(false)
    expect(
      addServiceAreaSchema.safeParse({ companyId: 'c', kind: 'RADIUS', radiusKm: 900 }).success,
    ).toBe(false)
    // And a kind with its required field missing.
    expect(addServiceAreaSchema.safeParse({ companyId: 'c', kind: 'CITY' }).success).toBe(false)
  })
})

describe('coverage is filtered by verification state', () => {
  it('leaves a PENDING company out, however wide its area', async () => {
    /*
     * `02` §Verification state: a company that has not been checked is not matchable, and a
     * `SUSPENDED` one is hidden from search and matching. Filtering in the service means
     * every caller gets that rather than remembering it.
     */
    sequence += 1
    const pending = await getPrisma().company.create({
      data: {
        slug: `bekleyen-${sequence}`,
        legalName: 'Bekleyen A.Ş.',
        displayName: 'Bekleyen',
        status: 'PENDING',
      },
    })
    await getPrisma().serviceArea.create({
      data: { companyId: pending.id, kind: 'CITY', cityId, isActive: true },
    })

    const covering = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId,
      ...ISTANBUL,
    })
    if (!covering.ok) return
    expect(covering.value.companyIds).not.toContain(pending.id)
  }, 60_000)

  it('drops a company the moment it is suspended', async () => {
    const companyId = await verifiedCompany('Askiya')
    const actor = await owner(companyId)
    await addServiceArea(actor, { kind: 'CITY', companyId, cityId })

    const before = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId,
      ...ISTANBUL,
    })
    expect(before.ok && before.value.companyIds).toContain(companyId)

    await getPrisma().company.update({ where: { id: companyId }, data: { status: 'SUSPENDED' } })

    const after = await companiesCoveringPoint(anonymousActor(), {
      cityId,
      districtId,
      ...ISTANBUL,
    })
    if (!after.ok) return
    expect(after.value.companyIds).not.toContain(companyId)
  }, 60_000)
})

describe('editing', () => {
  it('does not double a row when the same area is added twice', async () => {
    // A manufacturer clicking twice must not appear twice in `companiesCovering`, or `09`
    // §4's ranking has to de-duplicate.
    const companyId = await verifiedCompany('Cift')
    const actor = await owner(companyId)

    await addServiceArea(actor, { kind: 'CITY', companyId, cityId })
    await addServiceArea(actor, { kind: 'CITY', companyId, cityId })

    const listed = await listServiceAreas(actor, { companyId })
    if (!listed.ok) return
    expect(listed.value.areas).toHaveLength(1)
  }, 60_000)

  it('refuses to remove another company’s area', async () => {
    // Ownership in the `where` clause: someone else's area matches nothing rather than being
    // found and then rejected (`CLAUDE.md` non-negotiable 3).
    const mine = await verifiedCompany('Benim')
    const theirs = await verifiedCompany('Onlarin')

    const theirActor = await owner(theirs)
    const added = await addServiceArea(theirActor, { kind: 'CITY', companyId: theirs, cityId })
    if (!added.ok) return

    const myActor = await owner(mine)
    const attempt = await removeServiceArea(myActor, {
      companyId: mine,
      serviceAreaId: added.value.serviceAreaId,
    })

    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    expect(attempt.error.kind).toBe('NOT_FOUND')
  }, 120_000)
})
