import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/auth/logout` — `06` §Auth, specified since Phase 0 and unbuilt until now.
 *
 * This is the **token** logout, and it is a different capability from the web one. The
 * service comment states the split: *"`logout` revokes an API refresh-token family, this
 * [`endWebSession`] deletes a `Session` row […] a mobile client has no cookie."* So the two
 * are not variants of each other and neither substitutes for the other — `endWebSession` is
 * the single entry on `api-surface`'s web-only list precisely because this route exists to
 * carry the other half.
 *
 * `refreshToken` is optional: a client that has already lost its token can still ask, and
 * `allDevices` revokes every family for the account rather than one. Both are answered with
 * `revokedFamilies`, including zero — signing out twice is not an error (`ADR-018`'s
 * idempotence rule for auth writes).
 *
 * Dynamic imports only (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ logoutSchema }, { logout }, { resolveActor }, { err, validation }] = await Promise.all([
    import('@/modules/iam/application/dto'),
    import('@/modules/iam/application/auth-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = logoutSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await logout(await resolveActor(request), parsed.data))
}
