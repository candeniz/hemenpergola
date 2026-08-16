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

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(IMAGE)
    .withDatabase('pergola_test')
    .withUsername('pergola')
    .withPassword('pergola')
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'full_page_writes=off'])
    .withEnvironment({ POSTGRES_INITDB_ARGS: '--locale=C --encoding=UTF8' })
    .start()

  const databaseUrl = container.getConnectionUri()

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
