import { respond } from '@/shared/http/respond'

/**
 * `POST /companies/{id}/price-books/{id}/publish` — make a draft live (task 3.3).
 *
 * Archives whatever was live first; the partial unique index in migration 5 is what makes
 * "one live book per company" true even when two tabs publish at once.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; priceBookId: string }> },
): Promise<Response> {
  const [{ publishPriceBookSchema, publishPriceBook }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/pricing/application/price-book-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, priceBookId } = await params
  const parsed = publishPriceBookSchema.safeParse({ companyId, priceBookId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await publishPriceBook(actor, parsed.data))
}
