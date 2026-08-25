import { respond } from '@/shared/http/respond'

/**
 * `PUT /api/v1/companies/{companyId}/slug` — rename the public URL (`06`, `18` §Slugs).
 *
 * Separate from the profile PATCH because it is a different kind of write: it changes a
 * public address that search engines and shared links already hold. The service writes the
 * `SlugRedirect` row in the same transaction, so the old URL 308s to the new one instead
 * of dying — the discipline task 8.5 built and `public-directory.spec.ts` proves.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ updateCompanySlugSchema, updateCompanySlug }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/iam/application/company-profile-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = updateCompanySlugSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await updateCompanySlug(actor, parsed.data))
}
