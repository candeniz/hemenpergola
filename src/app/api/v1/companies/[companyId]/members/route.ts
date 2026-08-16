import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/[companyId]/members` — the roster. `POST` — invite.
 *
 * A thin adapter (`05-system-architecture.md` §Two entry points): parse with the shared Zod
 * schema, resolve the actor, call the service, map the `Result`. No logic here — the server
 * action in `app/actions/` calls the same service with the same schema, so a rule enforced
 * in one surface is enforced in both.
 *
 * The `companyId` comes from the path and is what `resolveActor` loads the membership for. The service scopes to `actor.companyId`, so a payload cannot name a different company than the one the permission was checked against.
 *
 * Imports are dynamic: a static one would pull `env` and Prisma into the build-time module
 * graph (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ companyId: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const [{ listMembers }, { resolveActor }] = await Promise.all([
    import('@/modules/iam/application/company-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await context.params
  const actor = await resolveActor(request, { companyId })
  return respond(await listMembers(actor, { companyId }))
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const [{ inviteMemberSchema }, { inviteMember }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/dto'),
      import('@/modules/iam/application/company-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await context.params
  const body = await request.json().catch(() => null)
  const parsed = inviteMemberSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await inviteMember(actor, parsed.data))
}
