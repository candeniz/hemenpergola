import { z } from 'zod'

/**
 * The audit-viewer contract (`17` §Audit log), extracted from `audit-service.ts` in Phase
 * 11.2. `diffPayloads` travels with its types: the diff is part of the contract's meaning
 * ("what changed"), it is pure, and screen and export must agree on it. Runtime-pure,
 * pinned by `dto-purity.test.ts`.
 */

export const listAuditEntriesSchema = z
  .object({
    entityType: z.string().trim().min(1).max(60).optional(),
    entityId: z.string().trim().min(1).max(60).optional(),
    actorUserId: z.string().trim().min(1).max(60).optional(),
    companyId: z.string().trim().min(1).max(60).optional(),
    /** Narrows an indexed range; never the only filter. */
    action: z.string().trim().min(1).max(60).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    /** Cursor pagination — `06` §Pagination: offset drifts under concurrent writes. */
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .refine((value) => value.entityId === undefined || value.entityType !== undefined, {
    message: 'entityId needs entityType — the index is (entityType, entityId, createdAt)',
    path: ['entityType'],
  })
export type ListAuditEntriesInput = z.infer<typeof listAuditEntriesSchema>

/**
 * One changed field, as a reader sees it.
 *
 * `17` asks for an audit log, and a raw JSON dump is not one: nobody diffs two objects by
 * eye, and the thing that actually changed is usually one key out of eight. The diff is
 * computed here so both the screen and any future export agree on what "changed" means.
 */
export type FieldChange = {
  field: string
  before: string | null
  after: string | null
  kind: 'added' | 'removed' | 'changed'
}

export type AuditEntryView = {
  id: string
  action: string
  entityType: string
  entityId: string
  actorUserId: string | null
  actorEmail: string | null
  actorRole: string
  companyId: string | null
  reason: string | null
  ip: string
  userAgent: string
  createdAt: Date
  changes: FieldChange[]
  /** True when the entry has payloads but nothing differs — a write that changed nothing. */
  noChange: boolean
}

const render = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function diffPayloads(before: unknown, after: unknown): FieldChange[] {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

  const beforeRecord = isRecord(before) ? before : {}
  const afterRecord = isRecord(after) ? after : {}

  const keys = [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])].sort()
  const changes: FieldChange[] = []

  for (const key of keys) {
    const from = render(beforeRecord[key])
    const to = render(afterRecord[key])
    if (from === to) continue

    changes.push({
      field: key,
      before: from,
      after: to,
      kind: from === null ? 'added' : to === null ? 'removed' : 'changed',
    })
  }

  return changes
}

export type ListAuditEntriesResult = {
  entries: AuditEntryView[]
  nextCursor: string | null
}

export const listAuditFacetsSchema = z.object({})
export type ListAuditFacetsInput = z.infer<typeof listAuditFacetsSchema>
