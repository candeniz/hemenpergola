import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies` — register a manufacturer company.
 *
 * A thin adapter (`05-system-architecture.md` §Two entry points): parse with the shared Zod
 * schema, resolve the actor, call the service, map the `Result`. No logic here — the server
 * action in `app/actions/` calls the same service with the same schema, so a rule enforced
 * in one surface is enforced in both.
 *
 * The creator becomes `OWNER` and the company starts `PENDING`; verification is a human decision in Phase 3.
 *
 * Imports are dynamic: a static one would pull `env` and Prisma into the build-time module
 * graph (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

/**
 *  — the companies the caller belongs to.
 *
 * The API half of the portal's company switcher. Scope is resolved from the route in the UI
 * ( §Context resolution), so a scripted caller needs the same list the switcher renders
 * in order to know which id to put in a path.
 *
 * Derived entirely from the caller's own memberships, so there is nothing here they could not
 * already enumerate.
 */
export async function GET(request: Request): Promise<Response> {
  const [{ listMyCompanies }, { resolveActor }] = await Promise.all([
    import('@/modules/iam/application/my-companies-service'),
    import('@/shared/context/actor'),
  ])

  const actor = await resolveActor(request)
  return respond(await listMyCompanies(actor, {}))
}

export async function POST(request: Request): Promise<Response> {
  const [{ createCompanySchema }, { createCompany }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/dto'),
      import('@/modules/iam/application/company-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = createCompanySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await createCompany(actor, parsed.data))
}
