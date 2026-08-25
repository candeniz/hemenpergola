import { respond } from '@/shared/http/respond'

/**
 * The customer's half of the thread — `GET` to read, `POST` to write (`06`, `15`).
 *
 * **Polling, not a socket** (`ADR-009`): `after=<messageId>` is a cursor, and a steady poll
 * returns an empty list. That is the shape a mobile client wants — no connection to hold
 * open on a phone that sleeps — and it is why `15` chose it.
 *
 * **The thread does not exist before `ACCEPTED`** (`ADR-028`). Not "is empty", not "is
 * disabled": there is no channel, and the service answers `NOT_FOUND`. A customer and a
 * manufacturer who have not been introduced have no way to exchange contact details around
 * the disclosure, which is the whole reason for the rule.
 *
 * The company's half is a sibling path under `/companies/{companyId}/…` rather than this
 * one branching on who is calling: `listThreadAsCustomer` and `listThreadAsCompany` are
 * different service methods with different authorisation kinds, and a route that picked
 * between them would be making an authorisation decision in `app/`.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [{ listThreadSchema, listThreadAsCustomer }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/messaging/application/message-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { offerRequestId } = await params
  const after = new URL(request.url).searchParams.get('after') ?? undefined

  const parsed = listThreadSchema.safeParse({ offerRequestId, after })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await listThreadAsCustomer(await resolveActor(request), parsed.data))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ offerRequestId: string }> },
): Promise<Response> {
  const [{ sendMessageSchema, sendMessageAsCustomer }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/messaging/application/message-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { offerRequestId } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

  const parsed = sendMessageSchema.safeParse({ ...(body ?? {}), offerRequestId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await sendMessageAsCustomer(await resolveActor(request), parsed.data))
}
