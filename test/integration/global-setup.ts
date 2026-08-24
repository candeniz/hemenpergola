import { execFileSync } from 'node:child_process'

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

/**
 * One PostGIS container for the whole integration run — `20-testing-strategy.md` §Integration.
 *
 * This used to live in `setup.ts`, and `setup.ts` is a **setup file**: Vitest evaluates it
 * once per *test file*, not once per run. The config comment said "one container, shared by
 * the files" and the code started sixteen, applying every migration sixteen times. It was
 * invisible while the suite was small. By Phase 3 it was a ~123 s prologue per file, a
 * half-hour run, and — because sixteen sequential container boots on one Docker host is a
 * genuine resource problem — *different* files failed on each run, including files no recent
 * work had touched. Flakiness that moves around is a property of the harness, not of the code
 * under test.
 *
 * A global setup runs once, in Vitest's own process, before any worker starts. The URL
 * reaches the workers through `provide`, which is the supported channel; `setup.ts` copies it
 * into `process.env` there, because the application's typed env parses `process.env` when
 * `@/shared/db` is first imported and that import happens inside the worker.
 *
 * The container is created with `--locale=C`, matching `docker-compose.yml` and
 * `23-deployment-and-environments.md` §Migrations. Testing against a different collation than
 * production runs would make the Turkish-ordering tests lie.
 */

const IMAGE = 'postgis/postgis:16-3.4'

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string
  }
}

/**
 * Poll until the server actually accepts a connection.
 *
 * `container.start()` resolving is **not** the same as Postgres being ready. The official
 * image runs a temporary server for `initdb`, which logs *"database system is ready to accept
 * connections"*, shuts it down, and only then starts the real one — so a log-based wait can
 * match the first occurrence and hand back a container whose port is not listening yet.
 *
 * The symptom is `P1001: Can't reach database server` from `migrate deploy`, which fails the
 * **entire run** rather than one test, and does it intermittently. Two seconds of polling
 * beats a retry loop around the migration, because a half-applied migration is worse than a
 * slow start.
 */
async function waitUntilAcceptingConnections(connectionString: string): Promise<void> {
  const { Client } = await import('pg')
  const deadline = Date.now() + 60_000
  let lastError: unknown = null

  while (Date.now() < deadline) {
    const client = new Client({ connectionString, connectionTimeoutMillis: 2_000 })
    try {
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      return
    } catch (error) {
      lastError = error
      await client.end().catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(
    `Postgres never accepted a connection at ${connectionString}: ${String(lastError)}`,
  )
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(IMAGE)
    .withDatabase('pergola_test')
    .withUsername('pergola')
    .withPassword('pergola')
    .withCommand([
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'full_page_writes=off',
      // Phase 8 pushed the shared-container run to 27 files; under Docker Desktop's
      // default memory the 200-candidate performance fixture started killing backends
      // ("Server has closed the connection") when it ran late in the sequence. Explicit,
      // modest limits keep the container inside its cgroup instead of trusting defaults.
      '-c',
      'max_connections=200',
      '-c',
      'shared_buffers=192MB',
      '-c',
      'work_mem=8MB',
    ])
    .withEnvironment({ POSTGRES_INITDB_ARGS: '--locale=C --encoding=UTF8' })
    .start()

  const databaseUrl = container.getConnectionUri()

  await waitUntilAcceptingConnections(databaseUrl)

  /*
   * `migrate deploy`, not `db push` — the same command `23` §Migrations gives production, so a
   * migration that only works through schema diffing fails here rather than in a deployment.
   * Once per run: the schema is identical for every file, and each test rolls its own
   * transaction back.
   */
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: 'inherit',
    shell: true,
  })

  project.provide('databaseUrl', databaseUrl)

  return async () => {
    await container.stop()
  }
}
