import { respond } from '@/shared/http/respond'

/**
 * `POST /api/v1/projects/{id}/matches` — run matching (`06`, `09` §Pipeline), and
 * `GET` — read the run that was stored.
 *
 * The read is the half that mattered and was missing. `09` §Pipeline stores a `MatchRun`
 * *"so returning to the page does not recompute it"*, and until Phase 10.2 the only way to
 * reach a stored run was a Server Component. A client that could only POST would recompute
 * the pipeline on every screen visit — the exact cost the stored run exists to avoid, and a
 * different price band each time a price book changed underneath.
 *
 * **Both return `MatchRunView`, and that type is the boundary** (`ADR-006`): band bounds,
 * never line items. `PriceCalculation` carries `netKurus` and a per-line `breakdown` in the
 * same row; `getMatchRun` selects `breakdown` to derive one boolean and returns neither.
 * `api-leak.test.ts` asserts the shape of what leaves this route.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ runMatchSchema, runMatch }, { resolveActor }, { err, validation }] = await Promise.all([
    import('@/modules/matching/application/match-service'),
    import('@/shared/context/actor'),
    import('@/shared/result'),
  ])

  const { projectId } = await params
  const parsed = runMatchSchema.safeParse({ projectId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await runMatch(await resolveActor(request), parsed.data))
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const [{ getMatchRunSchema, getMatchRun }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/matching/application/match-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const { projectId } = await params
  const parsed = getMatchRunSchema.safeParse({ projectId })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  return respond(await getMatchRun(await resolveActor(request), parsed.data))
}
