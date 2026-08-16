import { respond } from '@/shared/http/respond'

/**
 * `GET /api/v1/admin/audit` — the audit log, filtered and cursor-paginated.
 *
 * A thin adapter over the same service the server action calls, parsing with the same Zod
 * schema (`05-system-architecture.md` §Two entry points). Admin-only, asserted by the
 * service.
 *
 * Read-only, because the table is append-only for everyone including admins (`17` §Audit log). Every filter lands on an index from `04` §Indexes; `entityId` without `entityType` is refused rather than answered by a sequential scan.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const [{ listAuditEntries, listAuditEntriesSchema }, { resolveActor }, { err, validation }] =
    await Promise.all([
      import('@/modules/audit/application/audit-service'),
      import('@/shared/context/actor'),
      import('@/shared/result'),
    ])

  const query = new URL(request.url).searchParams
  const value = (name: string) => query.get(name) ?? undefined
  const limit = query.get('limit')

  const parsed = listAuditEntriesSchema.safeParse({
    entityType: value('entityType'),
    entityId: value('entityId'),
    actorUserId: value('actorUserId'),
    companyId: value('companyId'),
    action: value('action'),
    from: value('from'),
    to: value('to'),
    cursor: value('cursor'),
    ...(limit === null ? {} : { limit: Number(limit) }),
  })
  if (!parsed.success) return respond(err(validation(parsed.error.issues)))

  const actor = await resolveActor(request)
  return respond(await listAuditEntries(actor, parsed.data))
}
