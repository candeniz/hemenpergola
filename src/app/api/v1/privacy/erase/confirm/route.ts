import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/privacy/erase/confirm` — the emailed token comes back and the
 * anonymisation runs (`ADR-011`: erasure is anonymisation, never a hard delete).
 *
 * The token is single-use and consumed race-safely, so a replayed link or two concurrent
 * confirms cannot anonymise twice — the second answers `used`. `POST`, never a `GET` the
 * email links to directly: a mail client or link scanner that prefetches URLs must not be
 * able to erase an account, so the emailed link opens a page with a button, and the button
 * calls this.
 *
 * Dynamic imports only (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [
    { confirmAccountErasureSchema, confirmAccountErasure },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/privacy/application/privacy-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = confirmAccountErasureSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await confirmAccountErasure(await resolveActor(request), parsed.data))
}
