import { beforeAll, describe, expect, it } from 'vitest'

import {
  diffPayloads,
  listAuditEntries,
  listAuditEntriesSchema,
  listAuditFacets,
} from '@/modules/audit/application/audit-service'
import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * The audit viewer — task 2.5, `17-admin-system.md` §Audit log.
 *
 * The claim worth testing is not "the list returns rows". It is that **every filter the
 * screen offers lands on an index `04` §Indexes actually declares**, and that the one filter
 * that does not — an entity id with no entity type — is refused rather than answered by a
 * sequential scan over the fastest-growing table in the system.
 */

const admin: ActorContext = anonymousActor({
  userId: 'usr_audit_admin',
  globalRole: 'ADMIN',
  ip: '203.0.113.40',
  userAgent: 'integration-suite',
})

const outsider: ActorContext = anonymousActor({ userId: 'usr_reader', globalRole: 'CUSTOMER' })

beforeAll(async () => {
  await getPrisma().user.upsert({
    where: { id: 'usr_audit_admin' },
    create: { id: 'usr_audit_admin', email: 'audit-admin@example.com', globalRole: 'ADMIN' },
    update: {},
  })

  const company = await getPrisma().company.create({
    data: { slug: 'audit-fixture', legalName: 'Audit Fixture A.Ş.', displayName: 'Audit Fixture' },
  })

  for (let i = 0; i < 5; i += 1) {
    await recordAudit(admin, {
      action: 'catalog_updated',
      entityType: 'Product',
      entityId: `prd_audit_${i}`,
      companyId: company.id,
      before: { isActive: true, sortOrder: i },
      after: { isActive: false, sortOrder: i + 1 },
      reason: `probe ${i}`,
    })
  }
}, 120_000)

describe('diffPayloads · a change a person can read', () => {
  it('reports only the fields that moved', () => {
    // `17` asks for an audit log. Two JSON blobs side by side is a data export, and the
    // thing that changed is usually one key out of eight.
    const changes = diffPayloads(
      { status: 'PENDING', slug: 'acme', sortOrder: 3 },
      { status: 'VERIFIED', slug: 'acme', sortOrder: 3 },
    )

    expect(changes).toEqual([
      { field: 'status', before: 'PENDING', after: 'VERIFIED', kind: 'changed' },
    ])
  })

  it('distinguishes added, removed and changed', () => {
    const changes = diffPayloads({ a: 1, b: 2 }, { b: 3, c: 4 })

    expect(changes).toEqual([
      { field: 'a', before: '1', after: null, kind: 'removed' },
      { field: 'b', before: '2', after: '3', kind: 'changed' },
      { field: 'c', before: null, after: '4', kind: 'added' },
    ])
  })

  it('survives a null payload and renders a nested value', () => {
    // `catalog_created` writes `{ slugs: { tr, en } }`, so nested objects are not
    // hypothetical. They are stringified rather than expanded: one more level of nesting in
    // a timeline row is a tree nobody reads.
    expect(diffPayloads(null, { slugs: { tr: 'a', en: 'b' } })).toEqual([
      { field: 'slugs', before: null, after: '{"tr":"a","en":"b"}', kind: 'added' },
    ])
    expect(diffPayloads(null, null)).toEqual([])
  })
})

describe('filters follow the indexes', () => {
  it('filters by entityType and entityId — (entityType, entityId, createdAt)', async () => {
    const result = await listAuditEntries(admin, {
      entityType: 'Product',
      entityId: 'prd_audit_2',
      limit: 50,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entries).toHaveLength(1)
    expect(result.value.entries[0]?.reason).toBe('probe 2')
  }, 60_000)

  it('filters by actor — (actorUserId, createdAt)', async () => {
    const result = await listAuditEntries(admin, { actorUserId: 'usr_audit_admin', limit: 50 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entries.length).toBeGreaterThanOrEqual(5)
    expect(result.value.entries.every((entry) => entry.actorUserId === 'usr_audit_admin')).toBe(
      true,
    )
  }, 60_000)

  it('refuses an entityId with no entityType', () => {
    /*
     * The index is `(entityType, entityId, createdAt)`, so an id alone cannot use it. `04`
     * §Conventions: a filter the index does not support means adding the index in the same
     * change — and the honest answer here is that this filter is not worth an index, because
     * nobody searches audit rows by a bare id they cannot type from memory.
     *
     * Checked against the **schema**, which is what both adapters parse with, because a
     * half-specified filter is a malformed query rather than a domain conflict — `VALIDATION`
     * (422), not `PRECONDITION`. Calling the service directly with an unparsed object skips
     * it, exactly as it would skip any other shape rule.
     */
    expect(listAuditEntriesSchema.safeParse({ entityId: 'prd_audit_2' }).success).toBe(false)
    expect(
      listAuditEntriesSchema.safeParse({ entityType: 'Product', entityId: 'prd_audit_2' }).success,
    ).toBe(true)
    expect(listAuditEntriesSchema.safeParse({ entityType: 'Product' }).success).toBe(true)
  })

  it('narrows an indexed range with action rather than defining one with it', async () => {
    // `action` is not indexed and is not offered alone by the screen; combined with an
    // indexed column it filters inside a range the index already produced.
    const result = await listAuditEntries(admin, {
      actorUserId: 'usr_audit_admin',
      action: 'catalog_updated',
      limit: 50,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.entries.every((entry) => entry.action === 'catalog_updated')).toBe(true)
  }, 60_000)

  it('every declared index is actually on the table', async () => {
    // The filters above are only cheap if these exist. Asserted against the database rather
    // than the schema file, because the migration is what ships.
    const rows = await getPrisma().$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'AuditLog'
    `
    const definitions = rows.map((row) => row.indexdef.replace(/\s+/g, ' '))

    const covering = (...columns: string[]) =>
      definitions.some((definition) => columns.every((column) => definition.includes(column)))

    expect(covering('entityType', 'entityId', 'createdAt')).toBe(true)
    expect(covering('actorUserId', 'createdAt')).toBe(true)
    expect(covering('companyId', 'createdAt')).toBe(true)
  }, 60_000)
})

describe('paging', () => {
  it('pages by cursor rather than offset', async () => {
    // `06` §Pagination: offset drifts under concurrent writes, and an audit log is the one
    // table that is always being written to while somebody reads it.
    const first = await listAuditEntries(admin, { actorUserId: 'usr_audit_admin', limit: 2 })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    expect(first.value.entries).toHaveLength(2)
    expect(first.value.nextCursor).not.toBeNull()

    const second = await listAuditEntries(admin, {
      actorUserId: 'usr_audit_admin',
      limit: 2,
      cursor: first.value.nextCursor ?? undefined,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    const firstIds = first.value.entries.map((entry) => entry.id)
    const secondIds = second.value.entries.map((entry) => entry.id)
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false)
  }, 60_000)

  it('returns a null cursor on the last page', async () => {
    const result = await listAuditEntries(admin, {
      entityType: 'Product',
      entityId: 'prd_audit_0',
      limit: 50,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.nextCursor).toBeNull()
  }, 60_000)
})

describe('read-only, and admin-only', () => {
  it('refuses a caller who is not a platform admin', async () => {
    const entries = await listAuditEntries(outsider, { limit: 10 })
    const facets = await listAuditFacets(outsider, {})

    expect(entries.ok).toBe(false)
    expect(facets.ok).toBe(false)
    if (entries.ok) return
    expect(entries.error.kind).toBe('FORBIDDEN')
  }, 30_000)

  it('offers facets from the data rather than a hardcoded list', async () => {
    // The action list is the `AuditAction` union, and a screen that hardcoded it would drift
    // the first time somebody added one.
    const result = await listAuditFacets(admin, {})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.actions).toContain('catalog_updated')
    expect(result.value.entityTypes).toContain('Product')
  }, 60_000)

  it('renders a change list rather than a JSON dump', async () => {
    const result = await listAuditEntries(admin, {
      entityType: 'Product',
      entityId: 'prd_audit_3',
      limit: 1,
    })
    if (!result.ok) return

    const entry = result.value.entries[0]
    expect(entry?.changes).toEqual([
      { field: 'isActive', before: 'true', after: 'false', kind: 'changed' },
      { field: 'sortOrder', before: '3', after: '4', kind: 'changed' },
    ])
    expect(entry?.noChange).toBe(false)
  }, 60_000)
})
