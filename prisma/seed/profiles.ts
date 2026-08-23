import type { CompanyRole, CompanyStatus, PrismaClient } from '@prisma/client'

import { seedCatalogue } from './catalogue/seed-catalogue'
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
 *   Phase 2  catalogue rows            → done: all three profiles seed the D2 catalogue
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
  categories: number
  products: number
  attributes: number
  options: number
  /** Of `products`, how many carry a complete attribute set (`26` §D2). */
  fullySpecified: number
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

/**
 * The bootstrap admin, and a password for it.
 *
 * Phase 1 built the credential flow, so a seeded admin with no password is an admin nobody
 * can sign in as — including `e2e/phase2-gate.spec.ts`, which has to be an admin to prove
 * the Phase 2 gate at all.
 *
 * The password is a constant in a seed file on purpose and is safe to be one: seeds run
 * against development and test databases, and `23` §Runtime never runs them in production —
 * the production admin is created by an operator, not by `pnpm seed`.
 */
const ADMIN_EMAIL = 'admin@pergola.local'
export const SEED_ADMIN_PASSWORD = 'phase2-gate-admin-password'

/**
 * The manufacturer sign-in for the **D3 pilot session** (`26-execution-plan.md` §Phase 3
 * task 3.8) and for `e2e/phase3-gate.spec.ts`.
 *
 * Same reasoning as the admin constant: development and test databases only. What it buys is
 * that the pilot manufacturer's session does not begin with somebody resetting a password
 * over a video call.
 */
export const SEED_MANUFACTURER_EMAIL = 'owner@marmaracam.local'
export const SEED_MANUFACTURER_PASSWORD = 'phase3-pilot-manufacturer-password'

/**
 * The customer sign-in for `e2e/core-flow.spec.ts` step 2.
 *
 * Phase 4's gate is *a **signed-in** customer walks the wizard to `READY`*. Anonymous drafts
 * are task 4.5, in the second half — until then `createProject` refuses a caller with no
 * identity, because `04` §Project's CHECK constraint would otherwise reject the row.
 *
 * Same reasoning as the other two constants: development and test databases only.
 */
export const SEED_CUSTOMER_EMAIL = 'musteri@pergola.local'
export const SEED_CUSTOMER_PASSWORD = 'phase4-core-flow-customer-password'

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

  /*
   * The catalogue is in *every* profile, including `minimal`.
   *
   * `26` §D2: Phase 4 renders a form from these rows and Phase 5 prices against them. A
   * developer database without them is one where neither can be run at all, which is not a
   * smaller database — it is a broken one. The rows are identical across profiles and their
   * ids derive from their slugs, so `e2e` gets its determinism for free.
   */
  const catalogue = await seedCatalogue(prisma)

  /*
   * Argon2 directly, with the work factor from `domain/password.ts`.
   *
   * `infrastructure/password-hasher.ts` carries `import 'server-only'`, which throws under
   * `tsx` — the seed is a Node script, not a request. Importing the *parameters* rather than
   * the hasher keeps one source for the numbers and leaves the guard on the module that
   * needs it.
   */
  const [{ hash }, { ARGON2_OPTIONS }] = await Promise.all([
    import('@node-rs/argon2'),
    import('@/modules/iam/domain/password'),
  ])

  const admin = await upsertUser(prisma, {
    ...(adminId === undefined ? {} : { id: adminId }),
    email: ADMIN_EMAIL,
    fullName: 'Platform Admin',
    globalRole: 'ADMIN',
  })

  // Set every run: an admin whose password drifted from the constant is an admin the gate
  // cannot sign in as, and the failure would read as a broken gate rather than a stale row.
  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await hash(SEED_ADMIN_PASSWORD, ARGON2_OPTIONS) },
  })

  return { ...geo, settings, ...catalogue }
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
  const customer = await upsertUser(prisma, {
    email: SEED_CUSTOMER_EMAIL,
    fullName: 'Ayşe Demir',
  })
  emails.add(SEED_CUSTOMER_EMAIL)

  /*
   * A password and a verified email, so the core-flow gate can sign in and so readiness can
   * pass — `10` §Validation makes a verified email one of its rules, and a customer who
   * cannot clear it can never reach `READY`.
   */
  {
    const [{ hash }, { ARGON2_OPTIONS }] = await Promise.all([
      import('@node-rs/argon2'),
      import('@/modules/iam/domain/password'),
    ])

    await prisma.user.update({
      where: { id: customer.id },
      data: {
        passwordHash: await hash(SEED_CUSTOMER_PASSWORD, ARGON2_OPTIONS),
        emailVerifiedAt: new Date(),
      },
    })
  }

  await prisma.company.update({
    where: { slug: 'karadeniz-yapi' },
    data: { rejectionReason: 'Vergi levhası okunaklı değil — yeniden yükleyiniz.' },
  })

  await seedPilotManufacturer(prisma)
  await seedMatchableSupply(prisma)

  return { profile: 'demo', ...common, users: emails.size, companies, memberships }
}

/**
 * Two companies with the whole supply side filled in — offers, an İstanbul service area and
 * a **published price book** — so `GET OFFERS` on a demo project returns ranked, *priced*
 * results (task 5.6, core-flow step 3).
 *
 * Marmara Cam is deliberately left out: the pilot stays bookless (`seedPilotManufacturer`'s
 * own comment), which also means the results page always shows one honest
 * `priceOnRequest` row next to the priced ones — `PRC-06` exercised by the demo data
 * rather than by a contrived fixture.
 *
 * Idempotent: keyed on `(companyId, version)` for the book, natural uniques elsewhere.
 */
async function seedMatchableSupply(prisma: PrismaClient): Promise<void> {
  const istanbul = await prisma.city.findFirst({ where: { plateCode: 34 } })
  if (istanbul === null) return

  const suppliers = [
    { slug: 'ege-pergola', basePriceKurus: 4_500_00, minProjectPriceKurus: 60_000_00 },
    { slug: 'anadolu-gunes-kontrol', basePriceKurus: 5_200_00, minProjectPriceKurus: 75_000_00 },
  ]

  const products = await prisma.product.findMany({
    include: { attributes: { include: { options: true } } },
  })

  for (const supplier of suppliers) {
    const company = await prisma.company.findUnique({ where: { slug: supplier.slug } })
    if (company === null) continue

    // Everything offered, like the pilot — the demo is about the results page, not about a
    // company that half-answers its catalogue.
    for (const product of products) {
      const companyProduct = await prisma.companyProduct.upsert({
        where: { companyId_productId: { companyId: company.id, productId: product.id } },
        create: { companyId: company.id, productId: product.id, isActive: true },
        update: { isActive: true },
      })

      for (const attribute of product.attributes) {
        for (const option of attribute.options) {
          await prisma.companyProductOption.upsert({
            where: {
              companyProductId_optionId: {
                companyProductId: companyProduct.id,
                optionId: option.id,
              },
            },
            create: { companyProductId: companyProduct.id, optionId: option.id, isOffered: true },
            update: { isOffered: true },
          })
        }
      }
    }

    const existingArea = await prisma.serviceArea.findFirst({
      where: { companyId: company.id, kind: 'CITY', cityId: istanbul.id },
    })
    if (existingArea === null) {
      await prisma.serviceArea.create({
        data: { companyId: company.id, kind: 'CITY', cityId: istanbul.id, isActive: true },
      })
    }

    const existingBook = await prisma.priceBook.findUnique({
      where: { companyId_version: { companyId: company.id, version: 1 } },
    })
    if (existingBook !== null) continue

    await prisma.priceBook.create({
      data: {
        companyId: company.id,
        version: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedBy: null,
        items: {
          create: products.map((product) => ({
            productId: product.id,
            basePriceKurus: supplier.basePriceKurus,
            unit: 'PER_M2',
            minProjectPriceKurus: supplier.minProjectPriceKurus,
          })),
        },
        optionPrices: {
          create: products
            .flatMap((product) => product.attributes)
            .flatMap((attribute) => attribute.options)
            .map((option) => ({ optionId: option.id, mode: 'FLAT' as const, valueKurus: 250_00 })),
        },
      },
    })
  }
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

/**
 * Everything the **D3 pilot manufacturer** needs in order to walk in and price something —
 * `26` §Phase 3 task 3.8: *this screen has to be put in front of a real manufacturer the week
 * it lands.*
 *
 * The deliberate omission is the price book. Marmara Cam gets a password, its products marked
 * as offered and a service area, and then **stops** — because the thing being observed is a
 * manufacturer building a price book from nothing, and seeding one would test our ability to
 * render a price book rather than their ability to enter one.
 *
 * Idempotent like every other seed step: keyed on natural unique columns, re-runnable.
 */
async function seedPilotManufacturer(prisma: PrismaClient): Promise<void> {
  const [{ hash }, { ARGON2_OPTIONS }] = await Promise.all([
    import('@node-rs/argon2'),
    import('@/modules/iam/domain/password'),
  ])

  const user = await prisma.user.findUnique({ where: { email: SEED_MANUFACTURER_EMAIL } })
  const company = await prisma.company.findUnique({ where: { slug: 'marmara-cam-sistemleri' } })
  if (user === null || company === null) return

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hash(SEED_MANUFACTURER_PASSWORD, ARGON2_OPTIONS),
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  })

  // Everything in the catalogue, offered. A pilot who has to first tick twenty product boxes
  // is a pilot whose hour goes on task 3.2 instead of the screen under test.
  const products = await prisma.product.findMany({
    include: { attributes: { include: { options: true } } },
  })

  for (const product of products) {
    const companyProduct = await prisma.companyProduct.upsert({
      where: { companyId_productId: { companyId: company.id, productId: product.id } },
      create: { companyId: company.id, productId: product.id, isActive: true },
      update: { isActive: true },
    })

    for (const attribute of product.attributes) {
      for (const option of attribute.options) {
        await prisma.companyProductOption.upsert({
          where: {
            companyProductId_optionId: {
              companyProductId: companyProduct.id,
              optionId: option.id,
            },
          },
          create: { companyProductId: companyProduct.id, optionId: option.id, isOffered: true },
          update: { isOffered: true },
        })
      }
    }
  }

  // One city service area, so the company is matchable on everything except a price book —
  // which is exactly the state `21`'s phase gate describes minus its last step.
  const istanbul = await prisma.city.findFirst({ where: { plateCode: 34 } })
  if (istanbul !== null) {
    const existing = await prisma.serviceArea.findFirst({
      where: { companyId: company.id, kind: 'CITY', cityId: istanbul.id },
    })
    if (existing === null) {
      await prisma.serviceArea.create({
        data: { companyId: company.id, kind: 'CITY', cityId: istanbul.id, isActive: true },
      })
    }
  }
}
