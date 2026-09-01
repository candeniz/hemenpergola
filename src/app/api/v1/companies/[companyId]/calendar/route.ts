import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/companies/{companyId}/calendar?year=&month=` — one month of the
 * manufacturer's calendar (task 14.1, `06`).
 *
 * The window is a year and a month rather than a date range on purpose: the range the
 * service queries is the **six-week grid**, and only `offer/domain/calendar.ts` knows where
 * that starts. A caller passing `from`/`to` would be reimplementing the grid and would
 * eventually disagree with the one it is filling.
 *
 * Both parameters are optional and the **service** resolves them to the current month in
 * `Europe/Istanbul`, returning what it chose. This handler does not compute "now": at 00:30
 * Istanbul the UTC month is still the previous one, and `app/` may not import the domain
 * module that knows the difference (`CLAUDE.md` non-negotiable 2).
 *
 * Ownership and the no-contact-data rule are the service's (`ADR-006`, `19` §Disclosure);
 * this file adds nothing to either.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const [{ listCalendarSchema, listCalendar }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/offer/application/appointment-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId } = await params
  const url = new URL(request.url)

  const parsed = listCalendarSchema.safeParse({
    ...(url.searchParams.has('year') ? { year: url.searchParams.get('year') } : {}),
    ...(url.searchParams.has('month') ? { month: url.searchParams.get('month') } : {}),
  })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await listCalendar(actor, parsed.data))
}
