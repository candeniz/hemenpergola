import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { PrismaClient } from '@prisma/client'

/**
 * Seeds the 81 provinces and their districts, each with a centre point.
 *
 * Source, licence and regeneration: `README.md` in this directory.
 *
 * Idempotent: keyed on `City.plateCode` and `District(cityId, name)`, both unique, so
 * re-running updates in place rather than duplicating.
 */

type GeoDistrict = { name: string; latitude: number; longitude: number }
type GeoCity = {
  plateCode: number
  name: string
  latitude: number
  longitude: number
  districts: GeoDistrict[]
}
type GeoFile = {
  attribution: string
  generatedAt: string
  cityCount: number
  districtCount: number
  cities: GeoCity[]
}

export function loadGeoData(): GeoFile {
  const path = fileURLToPath(new URL('./turkey.json', import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8')) as GeoFile
}

export async function seedGeography(prisma: PrismaClient): Promise<{
  cities: number
  districts: number
}> {
  const data = loadGeoData()

  for (const city of data.cities) {
    const row = await prisma.city.upsert({
      where: { plateCode: city.plateCode },
      create: { name: city.name, plateCode: city.plateCode },
      update: { name: city.name },
    })

    // `point` is PostGIS `geography` and invisible to the Prisma client (ADR-015), so it is
    // written as raw SQL. ST_MakePoint takes (longitude, latitude) — the reverse of how it
    // is spoken, which is why it is never written by hand outside src/shared/geo and here.
    await prisma.$executeRaw`
      UPDATE "City"
      SET "point" = ST_SetSRID(ST_MakePoint(${city.longitude}, ${city.latitude}), 4326)::geography
      WHERE "id" = ${row.id}
    `

    for (const district of city.districts) {
      const districtRow = await prisma.district.upsert({
        where: { cityId_name: { cityId: row.id, name: district.name } },
        create: { cityId: row.id, name: district.name },
        update: {},
      })

      await prisma.$executeRaw`
        UPDATE "District"
        SET "point" = ST_SetSRID(ST_MakePoint(${district.longitude}, ${district.latitude}), 4326)::geography
        WHERE "id" = ${districtRow.id}
      `
    }
  }

  // 09 §Service-area coverage falls back to the district centroid when the customer gives no
  // precise location. A district without a point would silently drop every radius-based
  // manufacturer for that district, so this is checked rather than assumed.
  const missing = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM "District" WHERE "point" IS NULL
  `
  if (Number(missing[0]?.count ?? 0) > 0) {
    throw new Error(`${missing[0]?.count} districts have no point after seeding`)
  }

  return { cities: data.cityCount, districts: data.districtCount }
}
