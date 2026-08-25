import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/portfolio` — the company's own portfolio, with photo
 * scan states, and `POST` — create an item (`06`, `14`).
 *
 * This is the OWNER's view, not the public one: it includes unscanned photos and items with
 * no photo yet, because the person managing a portfolio needs to see what is not visible
 * yet and why. The public read is `GET /manufacturers/{slug}` territory and shows only what
 * has cleared scanning.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ listPortfolio }, { resolveActor }] = await Promise.all([
    import('@/modules/portfolio/application/portfolio-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await listPortfolio(actor, { companyId }))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [
    { createPortfolioItemSchema, createPortfolioItem },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/portfolio/application/portfolio-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = createPortfolioItemSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await createPortfolioItem(actor, parsed.data))
}
