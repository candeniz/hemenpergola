import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/auth/login` — a thin adapter (`05-system-architecture.md` §Two entry
 * points). It parses with the shared Zod schema, builds an `ActorContext`, calls the
 * service, and maps the `Result`. No logic lives here.
 *
 * Imports are dynamic because a static one would pull `env` and Prisma into the build-time
 * module graph (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ loginSchema }, { login }, { resolveActor }, { err, validation }] = await Promise.all([
    import('@/modules/iam/application/dto'),
    import('@/modules/iam/application/auth-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await login(actor, parsed.data))
}
