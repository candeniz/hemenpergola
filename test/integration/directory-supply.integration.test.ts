import { beforeAll, describe, expect, it } from 'vitest'

import {
  getPublicCity,
  listPublicCities,
  listPublicManufacturers,
  listPublicSlugs,
} from '@/modules/directory/application/directory-service'
import { anonymousActor } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * **What the directory is willing to call supply** — task 14.4.
 *
 * Nothing asserted the contents of `/ureticiler` before this file, which is why eight
 * `Gate Pergola <timestamp>` cards sat in the demo database for months: the e2e gate verified
 * a company through the real API on every run and never removed it, and no test ever looked
 * at what the directory held afterwards.
 *
 * The rule it now holds is `09` §1's: a `ServiceArea` is a **hard** eligibility filter, so a
 * verified company covering nowhere can never be a match candidate — and a directory card
 * for it is a road that ends. `18`'s city pages have applied exactly this since Phase 8. One
 * predicate now, asserted from both ends, because two definitions of supply is the drift
 * this repository keeps closing.
 *
 * The profile page is deliberately outside the rule and that is asserted too: refusing a
 * direct link would 404 a company that genuinely exists.
 */

const anonymous = () => anonymousActor({ ip: '203.0.113.90' })

let coveringId = ''
let coveringSlug = ''
let coverlessId = ''
let coverlessSlug = ''

beforeAll(async () => {
  const prisma = getPrisma()
  const city = await prisma.city.create({ data: { name: 'SupplyCity', plateCode: 913 } })

  const covering = await prisma.company.create({
    data: {
      slug: 'supply-covering',
      legalName: 'Kapsayan A.Ş.',
      displayName: 'Kapsayan',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  coveringId = covering.id
  coveringSlug = covering.slug
  await prisma.serviceArea.create({
    data: { companyId: covering.id, kind: 'CITY', cityId: city.id, isActive: true },
  })

  // Verified, and covers nowhere — exactly what the gate spec used to leave behind.
  const coverless = await prisma.company.create({
    data: {
      slug: 'supply-coverless',
      legalName: 'Kapsamayan A.Ş.',
      displayName: 'Kapsamayan',
      status: 'VERIFIED',
      verifiedAt: new Date(),
    },
  })
  coverlessId = coverless.id
  coverlessSlug = coverless.slug
}, 120_000)

describe('14.4 · the directory lists supply, not just verification', () => {
  it('lists a verified company that covers somewhere', async () => {
    const result = await listPublicManufacturers(anonymous(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.map((card) => card.slug)).toContain(coveringSlug)
  })

  it('does NOT list a verified company with no service area', async () => {
    const result = await listPublicManufacturers(anonymous(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(
      result.value.map((card) => card.slug),
      'a company that covers nowhere can never match anyone (09 §1) — a card for it is a dead end',
    ).not.toContain(coverlessSlug)
  })

  it('an inactive service area does not count as coverage', async () => {
    const prisma = getPrisma()
    const city = await prisma.city.create({ data: { name: 'InactiveCity', plateCode: 914 } })
    const company = await prisma.company.create({
      data: {
        slug: 'supply-inactive',
        legalName: 'Pasif A.Ş.',
        displayName: 'Pasif',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    })
    await prisma.serviceArea.create({
      data: { companyId: company.id, kind: 'CITY', cityId: city.id, isActive: false },
    })

    const result = await listPublicManufacturers(anonymous(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((card) => card.slug)).not.toContain('supply-inactive')
  })

  it('the sitemap advertises the same set the directory lists', async () => {
    const result = await listPublicSlugs(anonymous(), {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slugs = JSON.stringify(result.value)
    expect(slugs).toContain(coveringSlug)
    expect(
      slugs,
      'a URL offered to a crawler that the site itself will not link is the same inconsistency',
    ).not.toContain(coverlessSlug)
  })

  it('the profile page still resolves — a direct link is not a dead end', async () => {
    const { getPublicManufacturer } =
      await import('@/modules/directory/application/directory-service')
    const result = await getPublicManufacturer(anonymous(), { slug: coverlessSlug })

    // Not listed and not advertised, but it exists and a link to it works. Refusing here
    // would 404 a real, verified company.
    expect(result.ok).toBe(true)
  })

  it('city pages and the directory agree, because they share one predicate', async () => {
    const cities = await listPublicCities(anonymous(), {})
    expect(cities.ok).toBe(true)
    if (!cities.ok) return

    // The covering company supplies SupplyCity, so the city has a page. The coverless one
    // supplies nothing, so it adds no city — the two surfaces cannot disagree.
    expect(cities.value.map((row) => row.name)).toContain('SupplyCity')
    expect(cities.value.map((row) => row.name)).not.toContain('InactiveCity')
  })

  it('one company leaving the rule drops from all three surfaces at once — 14.5', async () => {
    const prisma = getPrisma()
    const city = await prisma.city.create({ data: { name: 'BirlikteŞehir', plateCode: 921 } })
    const company = await prisma.company.create({
      data: {
        slug: 'supply-birlikte',
        legalName: 'Birlikte A.Ş.',
        displayName: 'Birlikte',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    })
    const area = await prisma.serviceArea.create({
      data: { companyId: company.id, kind: 'CITY', cityId: city.id, isActive: true },
    })

    const surfaces = async () => {
      const [list, cities, detail] = await Promise.all([
        listPublicManufacturers(anonymous(), {}),
        listPublicCities(anonymous(), {}),
        getPublicCity(anonymous(), { slug: 'birliktesehir' }),
      ])
      return {
        directory: list.ok ? list.value.some((card) => card.slug === 'supply-birlikte') : false,
        cityCount: cities.ok
          ? (cities.value.find((row) => row.name === 'BirlikteŞehir')?.manufacturerCount ?? 0)
          : -1,
        cityDetail: detail.ok
          ? detail.value.manufacturers.some((card) => card.slug === 'supply-birlikte')
          : false,
      }
    }

    const before = await surfaces()
    expect(before.directory).toBe(true)
    expect(before.cityCount).toBe(1)
    expect(before.cityDetail).toBe(true)

    /*
     * Now make it unlistable by the one term the three surfaces share. Before 14.5 the count
     * under a city name and the list on its page were written by hand, so a change to the
     * rule moved the directory and left those two behind: `/sehirler` saying "1 ÜRETİCİ"
     * over a page listing none.
     */
    await prisma.serviceArea.update({ where: { id: area.id }, data: { isActive: false } })

    const after = await surfaces()
    expect(after.directory, 'directory').toBe(false)
    expect(after.cityCount, 'the count beside the city name').toBe(0)
    expect(after.cityDetail, 'the list on the city page').toBe(false)
  })

  it('the fixture is what the test thinks it is', () => {
    // A guard against the suite silently testing nothing.
    expect(coveringId).not.toBe('')
    expect(coverlessId).not.toBe('')
  })
})
