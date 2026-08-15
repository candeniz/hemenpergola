import { respond } from '@/shared/http/respond'

/** `POST /api/v1/auth/register` — see the login route for the adapter shape. */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ registerSchema }, { register }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/dto'),
      import('@/modules/iam/application/auth-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = registerSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await register(actor, parsed.data))
}
