import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/privacy/erase` — `19` §Erasure, the right to be forgotten.
 *
 * **Erasure is anonymisation** (`ADR-011`, `19` §Erasure): consents, contact disclosures,
 * offers on won engagements, message transcripts and the audit trail survive as legal-hold
 * evidence, while the identifying columns on `User` are replaced. Deleting the rows would
 * destroy the evidence that the disclosure was consented to, which is the opposite of what
 * KVKK asks for.
 *
 * The confirmation is **not** decoration and it is not enforced here: `anonymiseAccountSchema`
 * requires `confirmEmail` and the service rejects a mismatch with `PRECONDITION`, so the
 * guard holds for every caller — this route, the server action, and the mobile client that
 * arrives in Phase 11. A single unconfirmed call cannot erase an account from any of them.
 *
 * Dynamic imports only (non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const [{ anonymiseAccountSchema, anonymiseAccount }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/privacy/application/privacy-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = anonymiseAccountSchema.safeParse(body ?? {})
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await anonymiseAccount(await resolveActor(request), parsed.data))
}
