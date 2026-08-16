import { respond } from '@/shared/http/respond'

/**
 * `POST /companies/{id}/price-books/{id}/save` — replace the whole draft (task 3.3).
 *
 * One call for the whole book rather than a field at a time: a half-saved price book is
 * otherwise a reachable state, and a half-saved book that somebody then publishes is a wrong
 * price. Refused on anything but a `DRAFT`, in the service.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; priceBookId: string }> },
): Promise<Response> {
  const [{ savePriceBookSchema, savePriceBook }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/pricing/application/price-book-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, priceBookId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = savePriceBookSchema.safeParse({ ...(body ?? {}), companyId, priceBookId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await savePriceBook(actor, parsed.data))
}
