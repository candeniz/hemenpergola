import 'server-only'

import { z } from 'zod'

import { prisma } from '@/shared/db'
import { err, forbidden, ok } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

/**
 * The companies the signed-in user belongs to — what the portal's company switcher renders.
 *
 * `12-authentication-authorization.md` §Context resolution puts company scope **in the
 * route**, not in the session: `/panel/[companyId]/...`. The reason is the two-tabs case —
 * one person, two companies, two tabs — where session-held scope means whichever tab was
 * touched last decides what the other one is looking at. A route-derived scope has no such
 * failure, and this switcher is that rule's user interface: it is how you change scope, and
 * changing it is a navigation.
 *
 * No permission check beyond "you are signed in": the answer is derived entirely from the
 * caller's own memberships, so there is nothing here they could not already enumerate.
 */

export const listMyCompaniesSchema = z.object({})
export type ListMyCompaniesInput = z.infer<typeof listMyCompaniesSchema>

export type MyCompany = {
  companyId: string
  displayName: string
  slug: string
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'
  role: string
}

export const listMyCompanies = serviceMethod<ListMyCompaniesInput, { companies: MyCompany[] }>(
  'company',
  'listMyCompanies',
  {
    kind: 'owner',
    describe: 'the caller’s own memberships; the user id is the whole of the where clause',
  },
  async (actor, input) => {
    void input
    if (actor.userId === null) return err(forbidden('company:member.read'))

    const memberships = await prisma.companyMembership.findMany({
      where: { userId: actor.userId, company: { deletedAt: null } },
      include: { company: true },
      // Turkish collation is on the column, so this orders correctly for İ and ı.
      orderBy: { company: { displayName: 'asc' } },
    })

    return ok({
      companies: memberships.map((membership) => ({
        companyId: membership.companyId,
        displayName: membership.company.displayName,
        slug: membership.company.slug,
        status: membership.company.status,
        role: membership.role,
      })),
    })
  },
)

export const myCompaniesService = { listMyCompanies } satisfies Record<string, { meta: unknown }>
