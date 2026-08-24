/**
 * The matching-path load test — task 9.6. A different question from CI's p95 gate: not
 * "how fast is one run over 200 candidates" but "what happens when N users run at once" —
 * pool exhaustion, GiST under concurrency, MatchRun write contention.
 *
 * Run:  pnpm exec tsx --conditions=react-server scripts/load-test-matching.ts
 * Env:  DATABASE_URL (defaults to the local stack)
 *
 * Each virtual user owns its own READY project (ownership is real, not bypassed) with its
 * own anonymous key and its own IP, so the 06 rate limits — which the production path now
 * enforces — behave as they would for real distinct users. Steps up through concurrency
 * levels and reports latency percentiles and errors per level; the first level with
 * errors or a p95 collapse is the knee.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola'
process.env.DATABASE_URL = DATABASE_URL

const LEVELS = [5, 10, 20, 40]
const RUNS_PER_USER = 5

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)] ?? 0
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })

  const { runMatch } = await import('../src/modules/matching/application/match-service')
  const { anonymousActor } = await import('../src/shared/context/actor')

  // A template project to clone: the seeded İstanbul READY shape.
  const product = await prisma.productTranslation.findFirstOrThrow({
    where: { locale: 'tr', name: 'Bioklimatik Pergola' },
    select: { productId: true },
  })
  const istanbul = await prisma.city.findFirstOrThrow({ where: { plateCode: 34 } })

  const maxUsers = Math.max(...LEVELS)
  console.log(`preparing ${maxUsers} virtual users (own project, key, ip each)…`)
  const users: { projectId: string; key: string; ip: string }[] = []
  for (let index = 0; index < maxUsers; index += 1) {
    const key = `loadtest-${Date.now()}-${index}`
    const project = await prisma.project.create({
      data: {
        anonymousKey: key,
        productId: product.productId,
        status: 'READY',
        widthMm: 5000,
        depthMm: 4000,
        heightMm: 2800,
        areaM2: 20,
        quantity: 1,
        cityId: istanbul.id,
      },
    })
    users.push({ projectId: project.id, key, ip: `198.51.100.${index % 250}` })
  }

  for (const level of LEVELS) {
    const cohort = users.slice(0, level)
    const durations: number[] = []
    let errors = 0
    const started = Date.now()

    await Promise.all(
      cohort.map(async (user) => {
        for (let run = 0; run < RUNS_PER_USER; run += 1) {
          const t0 = performance.now()
          try {
            const result = await runMatch(anonymousActor({ anonymousKey: user.key, ip: user.ip }), {
              projectId: user.projectId,
            })
            if (!result.ok) errors += 1
          } catch {
            errors += 1
          }
          durations.push(performance.now() - t0)
        }
      }),
    )

    durations.sort((a, b) => a - b)
    const total = (Date.now() - started) / 1000
    console.log(
      `concurrency ${String(level).padStart(2)} · ${durations.length} runs in ${total.toFixed(1)}s · ` +
        `p50 ${Math.round(percentile(durations, 50))}ms · p95 ${Math.round(
          percentile(durations, 95),
        )}ms · max ${Math.round(percentile(durations, 100))}ms · errors ${errors}`,
    )
  }

  // Leave the board as found.
  await prisma.project.deleteMany({ where: { anonymousKey: { startsWith: 'loadtest-' } } })
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('load test failed:', error)
  process.exit(1)
})
