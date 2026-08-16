import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/auth/password-reset/confirm` — set a new password with a reset token.
 *
 * A thin adapter (`05-system-architecture.md` §Two entry points): parse with the shared Zod
 * schema, resolve the actor, call the service, map the `Result`. No logic here — the server
 * action in `app/actions/` calls the same service with the same schema, so a rule enforced
 * in one surface is enforced in both.
 *
 * Succeeding here revokes every session the account had (`12` §Sessions and revocation).
 *
 * Imports are dynamic: a static one would pull `env` and Prisma into the build-time module
 * graph (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ resetPasswordSchema }, { resetPassword }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/dto'),
      import('@/modules/iam/application/auth-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await resetPassword(actor, parsed.data))
}
