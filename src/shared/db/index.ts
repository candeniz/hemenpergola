import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '@prisma/client'

import { env } from '@/shared/config/env'

/**
 * Prisma 7 connects through a driver adapter rather than a URL in the schema. The
 * connection string comes from the typed env, so the database address is validated at
 * startup with everything else (23-deployment-and-environments.md §Configuration).
 */
/**
 * How many Postgres connections one process may hold.
 *
 * `pg` defaults to 10, and 10 is too few for a Next server under any real concurrency: a
 * server action that hashes a password holds its connection for the length of an Argon2
 * verification, and a handful of simultaneous logins is enough to starve every other request
 * in the process. The symptom is not a slow page — it is
 * `Timed out fetching a new connection from the connection pool` surfacing as a 500 and an
 * error boundary, which reads as "the app is broken" rather than "the pool is small".
 *
 * Phase 3's end-to-end suite is what surfaced it: three specs running in parallel against
 * one server produced exactly that, intermittently, on pages that pass in isolation.
 *
 * 20 per process against `23` §Runtime's N web instances plus 1–2 workers is comfortable for
 * a Postgres whose default `max_connections` is 100. It is deliberately a small multiple
 * rather than a large one: the fix for sustained load is a pooler in front of the database,
 * not a bigger pool in every process.
 */
const POOL_SIZE = 20

export function createAdapter(connectionString: string = env.DATABASE_URL): PrismaPg {
  return new PrismaPg({ connectionString, max: POOL_SIZE })
}

/**
 * The Prisma client. One instance per process; in development Next replaces modules on
 * every edit, so the instance is parked on `globalThis` to avoid exhausting connections.
 *
 * `05-system-architecture.md`: only `modules/<name>/infrastructure` may import this. `app/` may
 * not — enforced by the boundary lint rule (task 0.8).
 */

/**
 * Soft delete lives on exactly three models (`04-data-model.md` §Conventions): `Company`,
 * `User` and `Project`. Everything else deletes hard, and an extension that filtered every
 * model would quietly hide rows that were never meant to be hidden.
 */
const SOFT_DELETE_MODELS = ['Company', 'User', 'Project'] as const
type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number]

function isSoftDeleteModel(model: string | undefined): model is SoftDeleteModel {
  return model !== undefined && (SOFT_DELETE_MODELS as readonly string[]).includes(model)
}

/**
 * Filters `deletedAt: null` into every read on the three soft-deleted models.
 *
 * Deliberately not applied to `create`, `update` or `delete`: an update targeting a
 * soft-deleted row is a bug the caller should see, not a silent no-op. And admin flows that
 * legitimately need deleted rows use `prismaUnfiltered` rather than a magic escape flag,
 * so reaching for them is visible in review.
 */
export function withSoftDelete(client: PrismaClient) {
  return client.$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const READS = [
            'findFirst',
            'findFirstOrThrow',
            'findMany',
            'findUnique',
            'findUniqueOrThrow',
            'count',
            'aggregate',
          ]

          if (!isSoftDeleteModel(model) || !READS.includes(operation)) {
            return query(args)
          }

          const typed = args as { where?: Record<string, unknown> }

          return query({
            ...args,
            where: { deletedAt: null, ...typed.where },
          })
        },
      },
    },
  })
}

function createClient() {
  return withSoftDelete(
    new PrismaClient({
      adapter: createAdapter(),
      log: env.APP_ENV === 'local' ? ['warn', 'error'] : ['error'],
    }),
  )
}

type ExtendedPrismaClient = ReturnType<typeof createClient>

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient
  prismaUnfiltered?: PrismaClient
}

export const prisma: ExtendedPrismaClient = globalForPrisma.prisma ?? createClient()

/**
 * The same connection without the soft-delete filter. For admin views that must show
 * deleted rows, for the retention sweep, and for tests that assert a row was soft-deleted
 * rather than removed (`19-security-and-kvkk.md` §Retention).
 */
export const prismaUnfiltered: PrismaClient =
  globalForPrisma.prismaUnfiltered ?? new PrismaClient({ adapter: createAdapter() })

if (env.APP_ENV === 'local') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaUnfiltered = prismaUnfiltered
}

/**
 * Transaction helper. `05-system-architecture.md`: application services are the only place
 * a transaction is opened, and side effects that must not be rolled back — notifications —
 * are enqueued *after* commit, never inside.
 */
/**
 * Inferred from the extended client rather than taken from `Prisma.TransactionClient`:
 * `$extends` changes the client's shape, so the two are not the same type and the stock
 * one silently loses the extension inside a transaction.
 */
export type TransactionClient = Parameters<
  Parameters<ExtendedPrismaClient['$transaction']>[0] extends (client: infer C) => unknown
    ? (client: C) => unknown
    : never
>[0]

export async function transaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number
    timeout?: number
    isolationLevel?: Prisma.TransactionIsolationLevel
  },
): Promise<T> {
  return prisma.$transaction(fn, options)
}

export { Prisma }
