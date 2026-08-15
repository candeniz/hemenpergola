import type { CompanyRole, CompanyStatus, PrismaClient } from '@prisma/client'

import { seedGeography } from './geo/seed-geo'
import { seedPlatformSettings } from './platform-settings'

/**
 * The three seed profiles from `20-testing-strategy.md` §Test data.
 *
 *   minimal  a developer's empty-but-usable database: geography, settings, one admin
 *   demo     realistic enough to demonstrate: several companies in several cities
 *   e2e      fixed, deterministic ids that `e2e/core-flow.spec.ts` can rely on
 *
 * **Scope today.** `20`'s description of `demo` — 20 companies with published price books,
 * reviews and portfolios — is the destination, not this stop. Migration 1 has no catalogue,
 * pricing or review tables (`ADR-014`), so those parts arrive with their phases:
 *
 *   Phase 2  catalogue rows            → `demo` gains products and options
 *   Phase 3  price books, service areas → `demo` gains published price books
 *   Phase 5  match runs                → `e2e` gains a project that can be priced
 *   Phase 7  reviews                    → `demo` gains ratings
 *
 * Each profile builds its own skeleton now and later phases extend their own slice. Nothing
 * here seeds a table that does not exist.
 *
 * Every profile is idempotent: keyed on natural unique columns and re-runnable.
 */

export type ProfileName = 'minimal' | 'demo' | 'e2e'

export type SeedSummary = {
  profile: ProfileName
  cities: number
  districts: number
  settings: number
  users: number
  companies: number
  memberships: number
}

/**
 * `e2e` ids are fixed and readable. `e2e/core-flow.spec.ts` is nine skipped steps today and
 * binds to these in Phase 6, so they are part of the contract from now on: changing one
 * breaks the release gate, which is the intended amount of friction.
 */
export const E2E_IDS = {
  users: {
    admin: 'e2e_user_admin',
    customer: 'e2e_user_customer',
    manufacturerOwner: 'e2e_user_mfr_owner',
    manufacturerSales: 'e2e_user_mfr_sales',
  },
  companies: {
    verified: 'e2e_company_verified',
    pending: 'e2e_company_pending',
  },
} as const

/** The bootstrap admin. Phase 1 replaces the null password with a real credential flow. */
const ADMIN_EMAIL = 'admin@pergola.local'

type CompanySpec = {
  id?: string
  slug: string
  legalName: string
  displayName: string
  status: CompanyStatus
  cityPlate: number
  owner: { id?: string; email: string; fullName: string }
  members?: { id?: string; email: string; fullName: string; role: CompanyRole }[]
}

async function upsertUser(
  prisma: PrismaClient,
  spec: { id?: string; email: string; fullName: string; globalRole?: 'CUSTOMER' | 'ADMIN' },
) {
  return prisma.user.upsert({
    where: { email: spec.email },
    create: {
      ...(spec.id === undefined ? {} : { id: spec.id }),
      email: spec.email,
      fullName: spec.fullName,
      globalRole: spec.globalRole ?? 'CUSTOMER',
      // Verified on purpose: an unverified seed user cannot request offers (`03` §F2),
      // which would make every seeded database unusable for the flow it exists to exercise.
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    },
    update: { fullName: spec.fullName },
  })
}

async function upsertCompany(prisma: PrismaClient, spec: CompanySpec) {
  const city = await prisma.city.findUnique({ where: { plateCode: spec.cityPlate } })
  if (city === null) {
    throw new Error(`City with plate ${spec.cityPlate} not found — seed geography first`)
  }

  const company = await prisma.company.upsert({
    where: { slug: spec.slug },
    create: {
      ...(spec.id === undefined ? {} : { id: spec.id }),
      slug: spec.slug,
      legalName: spec.legalName,
      displayName: spec.displayName,
      status: spec.status,
      ...(spec.status === 'VERIFIED' ? { verifiedAt: new Date('2026-01-01T00:00:00Z') } : {}),
    },
    update: { displayName: spec.displayName, status: spec.status },
  })

  await prisma.companyContact.upsert({
    where: { companyId: company.id },
    create: { companyId: company.id, cityId: city.id, email: spec.owner.email },
    update: { cityId: city.id },
  })

  const owner = await upsertUser(prisma, spec.owner)
  const people: { userId: string; role: CompanyRole }[] = [{ userId: owner.id, role: 'OWNER' }]

  for (const member of spec.members ?? []) {
    const user = await upsertUser(prisma, member)
    people.push({ userId: user.id, role: member.role })
  }

  for (const person of people) {
    await prisma.companyMembership.upsert({
      where: { userId_companyId: { userId: person.userId, companyId: company.id } },
      create: { userId: person.userId, companyId: company.id, role: person.role },
      update: { role: person.role },
    })
  }

  return { company, memberships: people.length }
}

/** Shared by every profile: geography, settings, and one admin to log in as. */
async function seedCommon(prisma: PrismaClient, adminId?: string) {
  const geo = await seedGeography(prisma)
  const settings = await seedPlatformSettings(prisma)

  await upsertUser(prisma, {
    ...(adminId === undefined ? {} : { id: adminId }),
    email: ADMIN_EMAIL,
    fullName: 'Platform Admin',
    globalRole: 'ADMIN',
  })

  return { ...geo, settings }
}

async function seedMinimal(prisma: PrismaClient): Promise<SeedSummary> {
  const common = await seedCommon(prisma)

  return {
    profile: 'minimal',
    ...common,
    users: 1,
    companies: 0,
    memberships: 0,
  }
}

/**
 * `demo` — enough breadth to look like a marketplace: companies in different cities and in
 * different verification states, so the admin queue and the directory both have something
 * to show.
 */
const DEMO_COMPANIES: CompanySpec[] = [
  {
    slug: 'ege-pergola',
    legalName: 'Ege Pergola Sistemleri Sanayi ve Ticaret A.Ş.',
    displayName: 'Ege Pergola',
    status: 'VERIFIED',
    cityPlate: 35, // İzmir
    owner: { email: 'owner@egepergola.local', fullName: 'Deniz Ege' },
    members: [
      { email: 'satis@egepergola.local', fullName: 'Sinem Ak', role: 'SALES' },
      { email: 'yonetici@egepergola.local', fullName: 'Kaan Ünal', role: 'ADMIN' },
    ],
  },
  {
    slug: 'marmara-cam-sistemleri',
    legalName: 'Marmara Cam Sistemleri Ltd. Şti.',
    displayName: 'Marmara Cam Sistemleri',
    status: 'VERIFIED',
    cityPlate: 34, // İstanbul
    owner: { email: 'owner@marmaracam.local', fullName: 'Elif Şahin' },
    members: [{ email: 'satis@marmaracam.local', fullName: 'Burak Yıldız', role: 'SALES' }],
  },
  {
    slug: 'anadolu-gunes-kontrol',
    legalName: 'Anadolu Güneş Kontrol Sistemleri A.Ş.',
    displayName: 'Anadolu Güneş Kontrol',
    status: 'VERIFIED',
    cityPlate: 6, // Ankara
    owner: { email: 'owner@anadolugunes.local', fullName: 'Mert Çelik' },
  },
  {
    slug: 'akdeniz-tente',
    legalName: 'Akdeniz Tente ve Pergola Ltd. Şti.',
    displayName: 'Akdeniz Tente',
    status: 'PENDING', // sits in the admin verification queue
    cityPlate: 7, // Antalya
    owner: { email: 'owner@akdeniztente.local', fullName: 'Gizem Öz' },
  },
  {
    slug: 'karadeniz-yapi',
    legalName: 'Karadeniz Yapı Sistemleri Ltd. Şti.',
    displayName: 'Karadeniz Yapı',
    status: 'REJECTED', // rejected with a reason, can resubmit (03 §F3)
    cityPlate: 61, // Trabzon
    owner: { email: 'owner@karadenizyapi.local', fullName: 'Onur Kaya' },
  },
]

async function seedDemo(prisma: PrismaClient): Promise<SeedSummary> {
  const common = await seedCommon(prisma)

  let companies = 0
  let memberships = 0
  const emails = new Set<string>([ADMIN_EMAIL])

  for (const spec of DEMO_COMPANIES) {
    const result = await upsertCompany(prisma, spec)
    companies += 1
    memberships += result.memberships
    emails.add(spec.owner.email)
    for (const member of spec.members ?? []) emails.add(member.email)
  }

  // A customer, so the marketplace has both sides.
  await upsertUser(prisma, { email: 'musteri@pergola.local', fullName: 'Ayşe Demir' })
  emails.add('musteri@pergola.local')

  await prisma.company.update({
    where: { slug: 'karadeniz-yapi' },
    data: { rejectionReason: 'Vergi levhası okunaklı değil — yeniden yükleyiniz.' },
  })

  return { profile: 'demo', ...common, users: emails.size, companies, memberships }
}

/**
 * `e2e` — the smallest fixture the core flow needs, with fixed ids. Deliberately narrow:
 * a large deterministic fixture is a large thing to keep deterministic.
 */
async function seedE2e(prisma: PrismaClient): Promise<SeedSummary> {
  const common = await seedCommon(prisma, E2E_IDS.users.admin)

  await upsertUser(prisma, {
    id: E2E_IDS.users.customer,
    email: 'e2e-customer@pergola.local',
    fullName: 'E2E Müşteri',
  })

  const verified = await upsertCompany(prisma, {
    id: E2E_IDS.companies.verified,
    slug: 'e2e-verified-uretici',
    legalName: 'E2E Doğrulanmış Üretici A.Ş.',
    displayName: 'E2E Doğrulanmış Üretici',
    status: 'VERIFIED',
    cityPlate: 34,
    owner: {
      id: E2E_IDS.users.manufacturerOwner,
      email: 'e2e-owner@pergola.local',
      fullName: 'E2E Sahip',
    },
    members: [
      {
        id: E2E_IDS.users.manufacturerSales,
        email: 'e2e-sales@pergola.local',
        fullName: 'E2E Satış',
        role: 'SALES',
      },
    ],
  })

  const pending = await upsertCompany(prisma, {
    id: E2E_IDS.companies.pending,
    slug: 'e2e-bekleyen-uretici',
    legalName: 'E2E Bekleyen Üretici Ltd. Şti.',
    displayName: 'E2E Bekleyen Üretici',
    status: 'PENDING',
    cityPlate: 6,
    owner: { email: 'e2e-pending-owner@pergola.local', fullName: 'E2E Bekleyen Sahip' },
  })

  return {
    profile: 'e2e',
    ...common,
    users: 6, // admin, customer, two manufacturer users, pending owner — plus the shared admin
    companies: 2,
    memberships: verified.memberships + pending.memberships,
  }
}

export const PROFILES: Record<ProfileName, (prisma: PrismaClient) => Promise<SeedSummary>> = {
  minimal: seedMinimal,
  demo: seedDemo,
  e2e: seedE2e,
}

export function isProfileName(value: string): value is ProfileName {
  return value in PROFILES
}
