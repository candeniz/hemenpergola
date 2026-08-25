import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/projects/{id}/matches/supply-gap` — `09` §Zero-result handling step 3.
 *
 * Subscribe the project to a notification for when a manufacturer starts covering its area.
 * Idempotent in the service — a subscription is not something to hold twice — so a client
 * that retries a timed-out request gets `{ watching: true }` and no second row.
 *
 * This is also the telemetry Q5 reads: `26` §Decision calendar says launch cities are
 * chosen from zero-result data *"rather than by preference"*, and this is where a zero
 * result becomes a durable fact instead of a page a visitor closed.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ watchSupplyGapSchema, watchSupplyGap }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/matching/application/match-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { projectId } = await params
  const parsed = watchSupplyGapSchema.safeParse({ projectId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await watchSupplyGap(await resolveActor(request), parsed.data))
}
