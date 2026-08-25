import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/companies/{companyId}/documents` — attach a verification document
 * (`06` §Manufacturer portal, `12` §Verification).
 *
 * The `fileId` comes from §Files; the `type` says what the document claims to be (trade
 * registry, tax plate…). A `PENDING` company can call this — being unverified is the whole
 * reason to upload — and reading the document back later is `fileUrl`'s five-minute signed
 * URL with its audit entry, because a company document is a disclosure to whoever views it.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ attachDocumentSchema, attachDocument }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/company-profile-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = attachDocumentSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await attachDocument(actor, parsed.data))
}
