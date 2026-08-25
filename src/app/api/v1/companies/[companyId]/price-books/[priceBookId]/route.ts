import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/price-books/{id}` — one book in full, for its owner
 * (`06` §Manufacturer portal, `08`).
 *
 * The one place the API returns line-level pricing on purpose: this is the manufacturer
 * reading their own book, which `ADR-006` never restricted — the ban is on line items
 * crossing to the *customer*. The editor itself stays on the web (`ADR-030`'s scope
 * table); reading is not editing, and a script that audits its own books is legitimate.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string; priceBookId: string }> },
): Promise<Response> {
  const [{ getPriceBookSchema, getPriceBook }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/pricing/application/price-book-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, priceBookId } = await params
  const parsed = getPriceBookSchema.safeParse({ companyId, priceBookId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await getPriceBook(actor, parsed.data))
}
