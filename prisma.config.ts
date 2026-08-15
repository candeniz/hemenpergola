import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 moved connection URLs out of `schema.prisma` and into this file. The schema now
 * declares only the provider and the extensions, which is the better split: the shape of
 * the data is committed, the address of the database is environment.
 *
 * This runs in the CLI, outside Next and outside `src/shared/config/env.ts` — hence
 * `dotenv/config` and `env()` rather than the typed loader. The application itself still
 * reads `DATABASE_URL` through the typed env at startup
 * (23-deployment-and-environments.md §Configuration).
 */

/**
 * The shadow database `prisma migrate diff --from-migrations` replays migrations into.
 * Prisma 7 removed `--shadow-database-url` from the CLI, so it is configured here.
 *
 * Deliberately **not** in `23` §Configuration's variable list and not in the typed env:
 * this is tooling, used by two commands on a developer machine and in CI, and the
 * application never opens this connection. The default derives from `DATABASE_URL` so the
 * release gate works with no extra setup.
 */
function shadowDatabaseUrl(): string {
  const explicit = process.env.SHADOW_DATABASE_URL
  if (explicit !== undefined && explicit.length > 0) return explicit

  const primary = process.env.DATABASE_URL ?? ''
  // `postgresql://user:pass@host:5432/pergola?schema=public` → `…/pergola_shadow?schema=public`
  return primary.replace(/\/([^/?]+)(\?|$)/, '/$1_shadow$2')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: shadowDatabaseUrl(),
  },
})
