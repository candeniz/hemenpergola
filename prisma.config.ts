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
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
