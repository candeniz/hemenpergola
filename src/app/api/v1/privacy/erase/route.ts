import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/privacy/erase` — **ask** to erase; the anonymisation itself runs at
 * `/erase/confirm`, and only with the emailed token (`19` §Erasure, Q30).
 *
 * This endpoint shipped for one turn in Phase 10.2 as the single-step form, with a
 * docblock claiming the typed `confirmEmail` "holds for every caller". It does hold — and
 * it authorises nothing: the caller is already the account, and `GET /me` returns the very
 * address being typed, so over HTTP the irreversible operation was two requests with one
 * credential. The typed email is a thinking tool that stops a stray click; it is not a
 * second factor. The verification is the email loop — proof of control of the inbox, the
 * password-reset trust model — which is what `19` meant by the word all along.
 *
 * Rate-limited on the `privacy` surface (`06` §Rate limits): every call is one email, and
 * an irreversible surface must not be the unmetered one.
 *
 * Dynamic imports only (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [
    { requestAccountErasureSchema, requestAccountErasure },
    { resolveActor },
    { err, validation },
  ] = await Promise.all([
    import('@/modules/privacy/application/privacy-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = requestAccountErasureSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await requestAccountErasure(await resolveActor(request), parsed.data))
}
