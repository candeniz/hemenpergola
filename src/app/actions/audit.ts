'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type { ListAuditEntriesResult } from '@/modules/audit/application/audit-service'

/**
 * Audit-viewer actions (task 2.5). **Read only** — `17` §Audit log makes the table
 * append-only for everyone, admins included, so there is nothing here to write with.
 */

async function adminActor() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })
}

export async function listAuditEntriesAction(
  input: unknown = {},
): Promise<ActionResult<ListAuditEntriesResult>> {
  const [{ listAuditEntries, listAuditEntriesSchema }, { err, validation }] = await Promise.all([
    import('@/modules/audit/application/audit-service'),
    import('@/shared/result'),
  ])

  const parsed = listAuditEntriesSchema.safeParse(input)
  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await listAuditEntries(await adminActor(), parsed.data))
}

export async function listAuditFacetsAction(): Promise<
  ActionResult<{ actions: string[]; entityTypes: string[] }>
> {
  const { listAuditFacets } = await import('@/modules/audit/application/audit-service')
  return actionResult(await listAuditFacets(await adminActor(), {}))
}
