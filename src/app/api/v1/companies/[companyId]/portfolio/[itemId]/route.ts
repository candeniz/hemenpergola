import { respond } from '@/shared/http/respond'

/**
 * One portfolio item — `PATCH` to edit, `DELETE` to remove (`06`, `14`).
 *
 * `productId` and `cityId` are `nullable` in the patch schema and that is a real
 * distinction: `null` clears the association, absence leaves it alone. A client that
 * PATCHes `{title}` must not accidentally strip the item off its city page.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; itemId: string }> },
): Promise<Response> {
  const [
    { updatePortfolioItemSchema, updatePortfolioItem },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/portfolio/application/portfolio-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { companyId, itemId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = updatePortfolioItemSchema.safeParse({ ...(body ?? {}), companyId, itemId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await updatePortfolioItem(actor, parsed.data))
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ companyId: string; itemId: string }> },
): Promise<Response> {
  const [
    { deletePortfolioItemSchema, deletePortfolioItem },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/portfolio/application/portfolio-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { companyId, itemId } = await params
  const parsed = deletePortfolioItemSchema.safeParse({ companyId, itemId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await deletePortfolioItem(actor, parsed.data))
}
