import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/admin/verification/documents/review` — approve or reject one document.
 *
 * A thin adapter over the same service the server action calls, parsing with the same Zod
 * schema (`05-system-architecture.md` §Two entry points). Admin-only, asserted by the
 * service.
 *
 * A rejected document needs a note; without one the company has nothing to fix.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ reviewDocumentSchema, reviewDocument }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/verification-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const parsed = reviewDocumentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await reviewDocument(actor, parsed.data))
}
