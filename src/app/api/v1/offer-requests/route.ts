import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/offer-requests` — the customer sends a project to up to five manufacturers
 * (`06`, `11` §Transition table row 1), and
 * `GET ?projectId=` — the requests belonging to one project.
 *
 * **This is the consent boundary.** `createOfferRequestsSchema` types `consent.accepted` as
 * `z.literal(true)`, so a request that has not been consented to is not a request this
 * endpoint can be asked to make — the invalid shape is unrepresentable rather than checked,
 * and `06` §Errors' `consent.accepted !== true → 422` falls out of the parse. The
 * `Consent` row, the disclosure, the audit entry and the notification are the service's
 * (`CLAUDE.md` non-negotiable 8); none of them are optional and none of them are here.
 *
 * The five-company cap and `VERIFIED`-only rule are guards in the same schema and service,
 * so a client cannot widen the fan-out by talking to the API instead of the form.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [
    { createOfferRequestsSchema, createOfferRequests },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = createOfferRequestsSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await createOfferRequests(await resolveActor(request), parsed.data))
}

export async function GET(request: Request): Promise<Response> {
  const [
    { listRequestsForProjectSchema, listRequestsForProject },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/offer/application/offer-request-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const projectId = new URL(request.url).searchParams.get('projectId')
  const parsed = listRequestsForProjectSchema.safeParse({ projectId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await listRequestsForProject(await resolveActor(request), parsed.data))
}
