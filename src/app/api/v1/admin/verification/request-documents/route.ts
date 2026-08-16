import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/verification/request-documents` — ask for more, without deciding.
 *
 * A thin adapter over the same service the server action calls, parsing with the same Zod
 * schema (`05-system-architecture.md` §Two entry points). Admin-only, asserted by the
 * service.
 *
 * Deliberately not a status change: the company stays `PENDING` and stays in the queue. Rejecting somebody in order to ask them a question is how a queue becomes adversarial.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ requestDocumentsSchema, requestDocuments }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/verification-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = requestDocumentsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await requestDocuments(actor, parsed.data))
}
