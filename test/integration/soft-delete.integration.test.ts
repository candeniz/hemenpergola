import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withSoftDelete } from '@/shared/db'

import { getDatabaseUrl, getPrisma } from './setup'

/**
 * `04-data-model.md` §Conventions: soft delete applies to `Company`, `User` and `Project`
 * only. Everything else deletes hard.
 *
 * The extension is applied to a client bound to the container here rather than importing
 * the application's singleton, which reads `DATABASE_URL` at module load and would point at
 * the developer's database.
 */
let filtered: ReturnType<typeof withSoftDelete>
let raw: PrismaClient

beforeAll(async () => {
  raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) })
  filtered = withSoftDelete(raw)
  await raw.$connect()
})

afterAll(async () => {
  await raw.$disconnect()
})

/** Each test cleans up after itself: these run outside `withRollback` because the extension
 *  needs its own client, and two clients cannot share one uncommitted transaction. */
async function cleanup(ids: { companies?: string[]; users?: string[] }) {
  if (ids.companies?.length) {
    await getPrisma().company.deleteMany({ where: { id: { in: ids.companies } } })
  }
  if (ids.users?.length) {
    await getPrisma().user.deleteMany({ where: { id: { in: ids.users } } })
  }
}

describe('soft delete extension', () => {
  it('hides a soft-deleted Company from reads', async () => {
    const company = await raw.company.create({
      data: { slug: 'sd-hidden', legalName: 'Hidden A.Ş.', displayName: 'Hidden' },
    })

    try {
      expect(await filtered.company.findUnique({ where: { id: company.id } })).not.toBeNull()

      await raw.company.update({
        where: { id: company.id },
        data: { deletedAt: new Date() },
      })

      // Filtered client: gone. Unfiltered: still there — the row was never removed.
      expect(await filtered.company.findUnique({ where: { id: company.id } })).toBeNull()
      expect(await filtered.company.findMany({ where: { slug: 'sd-hidden' } })).toEqual([])
      expect(await filtered.company.count({ where: { slug: 'sd-hidden' } })).toBe(0)
      expect(await raw.company.findUnique({ where: { id: company.id } })).not.toBeNull()
    } finally {
      await cleanup({ companies: [company.id] })
    }
  })

  it('hides a soft-deleted User', async () => {
    const user = await raw.user.create({ data: { email: 'sd-user@example.com' } })

    try {
      await raw.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } })
      expect(await filtered.user.findUnique({ where: { id: user.id } })).toBeNull()
      expect(await raw.user.findUnique({ where: { id: user.id } })).not.toBeNull()
    } finally {
      await cleanup({ users: [user.id] })
    }
  })

  it('leaves models without soft delete untouched', async () => {
    // AuditLog has no deletedAt. If the extension filtered every model it would either
    // error here or silently return nothing — both worse than deleting hard.
    const entry = await raw.auditLog.create({
      data: {
        actorRole: 'ADMIN',
        entityType: 'Company',
        entityId: 'cmp_probe',
        action: 'probe',
        ip: '127.0.0.1',
        userAgent: 'test',
      },
    })

    try {
      expect(await filtered.auditLog.findUnique({ where: { id: entry.id } })).not.toBeNull()
    } finally {
      await getPrisma().auditLog.delete({ where: { id: entry.id } })
    }
  })

  it('does not override a caller who asks for deleted rows explicitly', async () => {
    // The spread order puts the caller's `where` last, so an admin view can still ask.
    const company = await raw.company.create({
      data: {
        slug: 'sd-explicit',
        legalName: 'Explicit A.Ş.',
        displayName: 'Explicit',
        deletedAt: new Date(),
      },
    })

    try {
      const found = await filtered.company.findFirst({
        where: { slug: 'sd-explicit', deletedAt: { not: null } },
      })
      expect(found?.id).toBe(company.id)
    } finally {
      await cleanup({ companies: [company.id] })
    }
  })
})
