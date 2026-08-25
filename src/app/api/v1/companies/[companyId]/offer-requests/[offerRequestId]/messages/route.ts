import { respond } from '@/shared/http/respond'

/**
 * The manufacturer's half of the thread — `GET` to read, `POST` to write (`06`, `15`).
 *
 * The mirror of `/offer-requests/{id}/messages`, and separate from it on purpose: these are
 * `listThreadAsCompany` and `sendMessageAsCompany`, which carry `MESSAGE_SEND` rather than
 * customer ownership. Two paths keep the authorisation decision in the service, where the
 * matrix can see it, instead of in a branch that inspects the caller.
 *
 * `ADR-028` applies identically here — no thread before `ACCEPTED` — and so does `15`
 * §Contact-detail leakage, which is the service's rule about what may be typed into a
 * message before disclosure.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [{ listThreadSchema, listThreadAsCompany }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/messaging/application/message-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, offerRequestId } = await params
  const after = new URL(request.url).searchParams.get('after') ?? undefined

  const parsed = listThreadSchema.safeParse({ offerRequestId, after })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await listThreadAsCompany(actor, parsed.data))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string; offerRequestId: string }> },
): Promise<Response> {
  const [{ sendMessageSchema, sendMessageAsCompany }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/messaging/application/message-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { companyId, offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = sendMessageSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request, { companyId })
  return respond(await sendMessageAsCompany(actor, parsed.data))
}
