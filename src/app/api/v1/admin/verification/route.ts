import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/verification` — the verification queue.
 *
 * A thin adapter over the same service the server action calls, parsing with the same Zod
 * schema (`05-system-architecture.md` §Two entry points). Admin-only, asserted by the
 * service.
 *
 * Defaults to `PENDING`: `17` §Command center calls this a work queue, and a work queue that opens on everything is a list.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [
    { listVerificationQueue, listVerificationQueueSchema },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/iam/application/verification-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const status = new URL(request.url).searchParams.get('status')
  const parsed = listVerificationQueueSchema.safeParse(status === null ? {} : { status })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await listVerificationQueue(actor, parsed.data))
}
