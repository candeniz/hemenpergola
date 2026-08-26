import { respond } from '@/shared/http/respond'

/**
 * The device's push address (12.3): `POST` registers or refreshes it, `DELETE` is
 * sign-out's leg. The token is personal data (`19`) — own rows only in both directions,
 * and a token that changes hands re-parents to whoever is signed in NOW (see the
 * service's docblock for why that is the safe direction).
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [
    { registerPushTokenSchema },
    { registerPushToken },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/notification/application/dto'),
    import('@/modules/notification/application/push-token-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = registerPushTokenSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await registerPushToken(await resolveActor(request), parsed.data))
}

export async function DELETE(request: Request): Promise<Response> {
  const [{ removePushTokenSchema }, { removePushToken }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/notification/application/dto'),
      import('@/modules/notification/application/push-token-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = removePushTokenSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await removePushToken(await resolveActor(request), parsed.data))
}
