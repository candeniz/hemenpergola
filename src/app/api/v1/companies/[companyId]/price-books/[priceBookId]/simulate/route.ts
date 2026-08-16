import { respond } from '@/shared/http/respond'

/**
 * `POST /companies/{id}/price-books/{id}/simulate` — `08-pricing-engine.md` §Simulator,
 * task 3.5.
 *
 * The same pure function against a **draft** book, returning the **full breakdown**. Scoped
 * to the owning company by `price_book.read`, asserted in the service — this handler does not
 * repeat the check, because a check in two places is a check that can disagree with itself.
 *
 * The ids come from the path rather than the body, so a request cannot name one company in
 * its URL and another in its payload; the body's are overwritten before the parse.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; priceBookId: string }> },
): Promise<Response> {
  const [{ simulateSchema, simulatePriceBook }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/pricing/application/simulate-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, priceBookId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = simulateSchema.safeParse({ ...(body ?? {}), companyId, priceBookId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await simulatePriceBook(actor, parsed.data))
}
