import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/auth/phone/start` — send a six-digit OTP.
 *
 * A thin adapter (`05-system-architecture.md` §Two entry points): parse with the shared Zod
 * schema, resolve the actor, call the service, map the `Result`. No logic here — the server
 * action in `app/actions/` calls the same service with the same schema, so a rule enforced
 * in one surface is enforced in both.
 *
 * Rate limited to one code per 60 seconds; the wait comes back in `Retry-After`.
 *
 * Imports are dynamic: a static one would pull `env` and Prisma into the build-time module
 * graph (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [
    { startPhoneVerificationSchema },
    { startPhoneVerification },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/iam/application/dto'),
    import('@/modules/iam/application/auth-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const parsed = startPhoneVerificationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await startPhoneVerification(actor, parsed.data))
}
