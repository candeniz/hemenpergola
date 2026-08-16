import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/auth/sessions` — the devices signed in to this account.
 *
 * A thin adapter (`05-system-architecture.md` §Two entry points): parse with the shared Zod
 * schema, resolve the actor, call the service, map the `Result`. No logic here — the server
 * action in `app/actions/` calls the same service with the same schema, so a rule enforced
 * in one surface is enforced in both.
 *
 * Scoped by `userId` inside the query. There is no parameter that could widen it.
 *
 * Imports are dynamic: a static one would pull `env` and Prisma into the build-time module
 * graph (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listSessions }, { resolveActor }] = await Promise.all([
    import('@/modules/iam/application/auth-service'),
    import('@/shared/context/actor'),
  ])

  const actor = await resolveActor(request)
  return respond(await listSessions(actor, {}))
}
