import { execFileSync } from 'node:child_process'

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll } from 'vitest'

/**
 * The integration harness — `20-testing-strategy.md` §Integration.
 *
 *   one PostGIS container per run
 *   migrations applied once, by `prisma migrate deploy` — the same command production uses,
 *     so a migration that only works via `db push` fails here
 *   every test inside a transaction that is rolled back
 *   no shared mutable fixture state
 *
 * The container is created with `--locale=C`, matching `docker-compose.yml` and the
 * requirement in `23-deployment-and-environments.md` §Migrations. Testing against a
 * different collation than production runs would make the Turkish-ordering tests lie.
 */

const IMAGE = 'postgis/postgis:16-3.4'

let container: StartedPostgreSqlContainer
let databaseUrl: string
let rootClient: PrismaClient

export function getDatabaseUrl(): string {
  if (databaseUrl === undefined) {
    throw new Error('The integration harness has not started. Is this file in `setupFiles`?')
  }
  return databaseUrl
}

/** A client bound to the container. Callers should prefer `withRollback`. */
export function getPrisma(): PrismaClient {
  return rootClient
}

beforeAll(async () => {
  container = await new PostgreSqlContainer(IMAGE)
    .withDatabase('pergola_test')
    .withUsername('pergola')
    .withPassword('pergola')
    // Byte-order collation at the cluster, Turkish only per column (04 §Conventions).
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'full_page_writes=off'])
    .withEnvironment({ POSTGRES_INITDB_ARGS: '--locale=C --encoding=UTF8' })
    .start()

  databaseUrl = container.getConnectionUri()

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: 'inherit',
    shell: true,
  })

  rootClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  await rootClient.$connect()
}, 300_000)

afterAll(async () => {
  await rootClient?.$disconnect()
  await container?.stop()
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
