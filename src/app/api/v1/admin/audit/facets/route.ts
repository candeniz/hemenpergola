import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/audit/facets` — the filter values that actually occur (`17` §Audit
 * log), so the viewer's selects offer real actions and entity types instead of a
 * hard-coded list that drifts from the union.
 *
 * Imports are dynamic (`CLAUDE.md` non-negotiable 9).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listAuditFacets }, { resolveActor }] = await Promise.all([
    import('@/modules/audit/application/audit-service'),
    import('@/shared/context/actor'),
  ])

  return respond(await listAuditFacets(await resolveActor(request), {}))
}
