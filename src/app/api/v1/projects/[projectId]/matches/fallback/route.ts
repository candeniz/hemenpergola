import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/projects/{id}/matches/fallback` — `09` §Zero-result handling, steps 1 and 2.
 *
 * A separate path from `GET .../matches` because it is a separate fact. The stored run says
 * how many manufacturers matched, and `resultCount: 0` is a true answer that a client must
 * be able to receive. This computes the two consolations — the same test with the radius
 * widened by one step, and companies that cover the area but do not offer the product — and
 * `09` is explicit that they are **not persisted as matches**: writing them into `MatchRun`
 * would make `resultCount: 0` a lie.
 *
 * So a client asks for it when the run is empty, rather than the run quietly returning
 * something else. Step 3, the supply-gap watch, is a write and lives next door.
 *
 * `nearby` carries names and no bands, which is `09`'s own rule and not this file's.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ zeroResultFallbackSchema, zeroResultFallback }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/matching/application/match-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { projectId } = await params
  const parsed = zeroResultFallbackSchema.safeParse({ projectId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await zeroResultFallback(await resolveActor(request), parsed.data))
}
