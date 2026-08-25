import 'server-only'

import {} from 'zod'

import { requireAdmin } from '@/modules/iam/application/authorization'
import { prisma } from '@/shared/db'
import { err, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

/**
 * The audit viewer — task 2.5, `17-admin-system.md` §Audit log.
 *
 * *"Read-only for everyone, including admins; append-only in the database."* There is no
 * update and no delete here, and there never will be: retention is a Phase 9 sweep that runs
 * as a job, not an action somebody can take from a screen.
 *
 * ## Filters follow the indexes, not the other way round
 *
 * `04` §Indexes gives `AuditLog` three:
 *
 *   `(entityType, entityId, createdAt)`   — "what happened to this thing"
 *   `(actorUserId, createdAt)`            — "what did this person do"
 *   `(companyId, createdAt)`              — "what happened around this company"
 *
 * Every filter below lands on one of them, with `createdAt` as the range and the sort. The
 * one filter people always want next — free text over `before`/`after` — is deliberately
 * absent: it is a sequential scan over JSON on the fastest-growing table in the system, and
 * adding it would mean adding an index in the same change (`04` §Conventions). `action` is
 * offered only *alongside* an indexed column, so it narrows a range rather than defining one.
 */

// The contract lives in ./dto (extracted in 11.2) — diffPayloads included, because the
// meaning of "changed" is part of the contract.
export * from './dto'

import {
  diffPayloads,
  type ListAuditEntriesInput,
  type ListAuditEntriesResult,
  type ListAuditFacetsInput,
} from './dto'

export const listAuditEntries = serviceMethod<ListAuditEntriesInput, ListAuditEntriesResult>(
  'audit',
  'listAuditEntries',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const where = {
      ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
      ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
      ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
      ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
      ...(input.action === undefined ? {} : { action: input.action }),
      ...(input.from === undefined && input.to === undefined
        ? {}
        : {
            createdAt: {
              ...(input.from === undefined ? {} : { gte: new Date(input.from) }),
              ...(input.to === undefined ? {} : { lte: new Date(input.to) }),
            },
          }),
    }

    const rows = await prisma.auditLog.findMany({
      where,
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
    })

    const page = rows.slice(0, input.limit)
    const nextCursor = rows.length > input.limit ? (page[page.length - 1]?.id ?? null) : null

    return ok({
      entries: page.map((row) => {
        const changes = diffPayloads(row.before, row.after)
        return {
          id: row.id,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          actorUserId: row.actorUserId,
          actorEmail: row.actor?.email ?? null,
          actorRole: row.actorRole,
          companyId: row.companyId,
          reason: row.reason,
          ip: row.ip,
          userAgent: row.userAgent,
          createdAt: row.createdAt,
          changes,
          noChange: changes.length === 0 && (row.before !== null || row.after !== null),
        }
      }),
      nextCursor,
    })
  },
)

/**
 * The distinct values behind the filter dropdowns.
 *
 * Two `groupBy` queries rather than a hardcoded list, because the list of actions is the
 * `AuditAction` union and a screen that hardcoded it would drift the first time somebody
 * added one. Both are small: the cardinality is the number of action kinds, not the number
 * of rows.
 */
export const listAuditFacets = serviceMethod<
  ListAuditFacetsInput,
  { actions: string[]; entityTypes: string[] }
>('audit', 'listAuditFacets', { kind: 'admin' }, async (actor, input) => {
  void input
  const allowed = requireAdmin(actor)
  if (!allowed.ok) return err(allowed.error)

  const [actions, entityTypes] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
    prisma.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
  ])

  return ok({
    actions: actions.map((row) => row.action),
    entityTypes: entityTypes.map((row) => row.entityType),
  })
})

export const auditService = { listAuditEntries, listAuditFacets } satisfies Record<
  string,
  { meta: unknown }
>
