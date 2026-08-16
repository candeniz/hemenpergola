import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { afterAll, inject } from 'vitest'

/**
 * The per-file half of the integration harness — `20-testing-strategy.md` §Integration.
 *
 *   one PostGIS container per **run**, started by `global-setup.ts`
 *   migrations applied once there, by `prisma migrate deploy` — the same command production
 *     uses, so a migration that only works via `db push` fails here
 *   every test inside a transaction that is rolled back
 *   no shared mutable fixture state
 *
 * **The URL is copied into `process.env` at module scope, not in `beforeAll`.** Vitest awaits
 * setup files before it imports the test files, and the test files pull in `@/shared/db` —
 * which builds its Prisma client from `DATABASE_URL` when that module is evaluated. Assigning
 * it in a hook would be too late: the application client would already point at the
 * developer's database, and the suite would quietly test against it.
 *
 * The container itself lives in the global setup, because *this* file is evaluated once per
 * test file. It used to start the container here, which meant one container and one full
 * migration run per file — sixteen of each for one `pnpm test:integration`. See the note
 * there.
 */

const databaseUrl = inject('databaseUrl')

process.env.DATABASE_URL = databaseUrl
process.env.DIRECT_URL = databaseUrl

export function getDatabaseUrl(): string {
  return databaseUrl
}

const rootClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
await rootClient.$connect()

/** A client bound to the container. Callers should prefer `withRollback`. */
export function getPrisma(): PrismaClient {
  return rootClient
}

afterAll(async () => {
  /*
   * pg-boss first.
   *
   * A suite that enqueued anything has a boss holding its own pool, and pg-boss reconnects
   * on error by design — so stopping the container underneath it produces a burst of
   * `57P01 terminating connection due to administrator command` from a process that is
   * still trying. The tests had already passed; the run failed on the noise afterwards.
   */
  const { stopBoss } = await import('@/shared/jobs')
  await stopBoss()

  await rootClient.$disconnect()
})

/**
 * Runs `fn` inside a transaction and always rolls it back, so tests cannot see each other's
 * writes and order never matters.
 *
 * The rollback is forced by throwing a sentinel: Prisma has no "rollback" call, and
 * committing and then truncating would leave sequences and identity columns advanced.
 */
const ROLLBACK = Symbol('rollback')

export async function withRollback<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  let captured: T

  try {
    await rootClient.$transaction(async (tx) => {
      captured = await fn(tx as unknown as PrismaClient)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }

  return captured!
}
