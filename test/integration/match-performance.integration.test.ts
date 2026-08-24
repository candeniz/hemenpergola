import { beforeAll, describe, expect, it } from 'vitest'

import { runMatch } from '@/modules/matching/application/match-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * `09` §Performance, asserted rather than believed: **p95 ≤ 2.5 s end to end for ≤ 200
 * candidates.** This runs in the integration stage, so CI makes the claim on every push —
 * a budget measured once on a fast laptop and never again is a budget that erodes silently.
 *
 * 200 candidates is the doc's own ceiling, built as the worst honest case: every company
 * verified, covering the city, offering the product, carrying a published book with option
 * prices — so every candidate takes the expensive path (scored *and* priced *and*
 * persisted). Twelve timed runs after two warm-ups; p95 of twelve is the worst-but-one,
 * which keeps one GC pause or container hiccup from failing the build while a real
 * regression still does.
 */

const CANDIDATES = 200
const WARMUP_RUNS = 2
const TIMED_RUNS = 12
const BUDGET_MS = 2_500

let projectId = ''

const owner = (): ActorContext =>
  anonymousActor({ userId: 'usr_perf_owner', globalRole: 'CUSTOMER', ip: '203.0.113.99' })

beforeAll(async () => {
  const prisma = getPrisma()

  const city = await prisma.city.create({ data: { name: 'PerfCity', plateCode: 900 } })
  const category = await prisma.category.create({ data: { sortOrder: 95 } })
  const product = await prisma.product.create({
    data: { categoryId: category.id, basisType: 'AREA_M2' },
  })
  const attribute = await prisma.productAttribute.create({
    data: { productId: product.id, key: 'perf_colour', inputType: 'SELECT', isRequired: true },
  })
  const option = await prisma.productOption.create({
    data: { attributeId: attribute.id, value: 'perf-anthracite', isActive: true },
  })

  await prisma.user.upsert({
    where: { id: 'usr_perf_owner' },
    create: { id: 'usr_perf_owner', email: 'perf-owner@example.com' },
    update: {},
  })

  const project = await prisma.project.create({
    data: {
      customerId: 'usr_perf_owner',
      productId: product.id,
      status: 'READY',
      widthMm: 5000,
      depthMm: 4000,
      heightMm: 2800,
      areaM2: 20,
      quantity: 1,
      cityId: city.id,
      pointPrecision: 'CITY',
      values: { create: { attributeId: attribute.id, optionId: option.id } },
    },
  })
  projectId = project.id

  // ── 200 fully-eligible, fully-priceable candidates, in batched writes ──────
  const ids = Array.from({ length: CANDIDATES }, (_, index) => `perf_c_${index}`)

  await prisma.company.createMany({
    data: ids.map((id, index) => ({
      id,
      slug: `perf-company-${index}`,
      legalName: `Perf ${index} A.Ş.`,
      displayName: `Perf ${index}`,
      status: 'VERIFIED' as const,
      verifiedAt: new Date('2026-01-01T00:00:00Z'),
    })),
  })

  await prisma.companyProduct.createMany({
    data: ids.map((id, index) => ({
      id: `perf_cp_${index}`,
      companyId: id,
      productId: product.id,
      isActive: true,
    })),
  })

  await prisma.companyProductOption.createMany({
    data: ids.map((_, index) => ({
      companyProductId: `perf_cp_${index}`,
      optionId: option.id,
      isOffered: true,
    })),
  })

  await prisma.serviceArea.createMany({
    data: ids.map((id) => ({ companyId: id, kind: 'CITY' as const, cityId: city.id })),
  })

  await prisma.priceBook.createMany({
    data: ids.map((id, index) => ({
      id: `perf_pb_${index}`,
      companyId: id,
      version: 1,
      status: 'PUBLISHED' as const,
      publishedAt: new Date('2026-08-01T00:00:00Z'),
    })),
  })

  await prisma.priceBookItem.createMany({
    data: ids.map((_, index) => ({
      priceBookId: `perf_pb_${index}`,
      productId: product.id,
      basePriceKurus: 4_000_00 + index * 100,
      unit: 'PER_M2' as const,
      minProjectPriceKurus: 50_000_00,
    })),
  })

  await prisma.priceBookOptionPrice.createMany({
    data: ids.map((_, index) => ({
      priceBookId: `perf_pb_${index}`,
      optionId: option.id,
      mode: 'FLAT' as const,
      valueKurus: 250_00,
    })),
  })
}, 120_000)

describe('09 §Performance — the p95 budget, measured', () => {
  it(
    `p95 of a full run over ${CANDIDATES} priced candidates stays within ${BUDGET_MS} ms`,
    { timeout: 300_000 },
    async () => {
      /*
       * Refresh the application client's pool first. This file runs late in the
       * sequential suite, and on Windows Docker an idle pooled connection can be silently
       * dropped by the NAT proxy — the first heavy query then dies with "Server has
       * closed the connection", which reads as a performance failure and is a stale
       * socket. Disconnecting forces fresh connections; on Linux/CI it is a no-op cost.
       */
      const { prisma: appPrisma } = await import('@/shared/db')
      await appPrisma.$disconnect()

      for (let index = 0; index < WARMUP_RUNS; index += 1) {
        const warm = await runMatch(owner(), { projectId })
        expect(warm.ok).toBe(true)
      }

      const durations: number[] = []
      for (let index = 0; index < TIMED_RUNS; index += 1) {
        const started = performance.now()
        const run = await runMatch(owner(), { projectId })
        durations.push(performance.now() - started)

        expect(run.ok).toBe(true)
        if (run.ok) expect(run.value.resultCount).toBe(CANDIDATES)
      }

      const sorted = [...durations].sort((a, b) => a - b)
      const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.POSITIVE_INFINITY

      // Printed so a CI log answers "how close are we" without a rerun.
      console.log(
        `match p95 over ${CANDIDATES} candidates: ${Math.round(p95)} ms ` +
          `(min ${Math.round(sorted[0] ?? 0)} ms, max ${Math.round(sorted[sorted.length - 1] ?? 0)} ms)`,
      )

      expect(p95).toBeLessThanOrEqual(BUDGET_MS)
    },
  )
})
