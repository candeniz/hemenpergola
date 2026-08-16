import { respond } from '@/shared/http/respond'

/**
 * `GET /companies/{id}/price-books` — the version history, and
 * `POST` — a new draft, optionally cloned from an existing version (task 3.3).
 *
 * Thin adapters over the same services the portal's server actions call
 * (`05-system-architecture.md` §Two entry points), parsing with the same Zod schemas. The
 * company id comes from the path so a request cannot name one company in its URL and another
 * in its body.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ listPriceBooks }, { resolveActor }] = await Promise.all([
    import('@/modules/pricing/application/price-book-service'),
    import('@/shared/context/actor'),
  ])

  const { companyId } = await params
  const actor = await resolveActor(request, { companyId })
  return respond(await listPriceBooks(actor, { companyId }))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ createDraftSchema, createDraft }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/pricing/application/price-book-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = createDraftSchema.safeParse({ ...(body ?? {}), companyId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await createDraft(actor, parsed.data))
}
