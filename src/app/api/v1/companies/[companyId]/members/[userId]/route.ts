import { respond } from '@/shared/http/respond'

/**
 * `PATCH` — change a role. `DELETE` — remove a member.
 *
 * A thin adapter (`05-system-architecture.md` §Two entry points): parse with the shared Zod
 * schema, resolve the actor, call the service, map the `Result`. No logic here — the server
 * action in `app/actions/` calls the same service with the same schema, so a rule enforced
 * in one surface is enforced in both.
 *
 * Both take effect on the **next request**: `resolveActor` reads the membership every time and no role is written into a token, which is the reason `12` §Tokens leaves `companyId` out of the JWT.
 *
 * Imports are dynamic: a static one would pull `env` and Prisma into the build-time module
 * graph (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ companyId: string; userId: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const [{ changeMemberRoleSchema }, { changeMemberRole }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/dto'),
      import('@/modules/iam/application/company-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, userId } = await context.params
  const body = await request.json().catch(() => null)
  const parsed = changeMemberRoleSchema.safeParse({ ...(body ?? {}), companyId, userId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await changeMemberRole(actor, parsed.data))
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const [{ removeMember }, { resolveActor }] = await Promise.all([
    import('@/modules/iam/application/company-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId, userId } = await context.params
  const actor = await resolveActor(request, { companyId })
  return respond(await removeMember(actor, { companyId, userId }))
}
