import 'server-only'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { brandName } from '@/modules/notification/domain/brand'
import { invitationEmail } from '@/modules/notification/domain/templates'
import { env } from '@/shared/config/env'
import { prisma } from '@/shared/db'
import {
  conflict,
  err,
  forbidden,
  notFound,
  ok,
  precondition,
  type DomainError,
  type Result,
} from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { canAssignRole, canRevokeRole, PERMISSIONS, type CompanyRole } from '../domain/permissions'
import { checkVerificationGate } from '../domain/verification-gates'
import { getMailer } from '@/modules/notification/infrastructure/mailer'
import { issueAuthToken, consumeAuthToken } from '../infrastructure/token-service'

import { authorize } from './authorization'
import type {
  AcceptInvitationInput,
  ChangeMemberRoleInput,
  CreateCompanyInput,
  InviteMemberInput,
  ListMembersInput,
  RemoveMemberInput,
} from './dto'

/**
 * Company registration and membership — `26-execution-plan.md` row 1.6,
 * `02-user-roles-and-permissions.md` §Company-scoped roles.
 *
 * Everything here obeys two rules that are easy to state and easy to lose:
 *
 *  1. **The permission check is the first statement** and it goes through `authorize`, which
 *     is where role ∩ status lives. No method re-implements half of it.
 *  2. **Membership is read per request.** Nothing in this file writes a role into a token or
 *     a cache, which is what makes a role change and a removal take effect on the very next
 *     request rather than at token expiry. `membership-revocation` in the integration suite
 *     is the test that would notice if that ever stopped being true.
 */

const INVITATION_TTL_NOTE = '24 hours — the same window as an email verification link.'

/** A slug that reads like the company, and is unique. */
function slugify(displayName: string): string {
  const folded = displayName
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

  const base = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return base.length >= 2 ? base : 'firma'
}

export type CreateCompanyResult = {
  companyId: string
  slug: string
  /** Always `PENDING` — see below. */
  status: 'PENDING'
  role: 'OWNER'
}

/**
 * Create a company.
 *
 * The creator becomes `OWNER` and the company starts `PENDING` (`02` §Verification state).
 * `PENDING` is not a formality: `statusAllowsPermission` lets a pending company do only
 * `onboarding` work — upload documents, complete its profile — and nothing operational.
 * Verification is a human decision in Phase 3.
 *
 * There is no permission to check, because there is no company yet to be a member of. What
 * *is* checked is the verification gate: `company:create` requires a verified email and
 * phone, because a company is a commercial identity and the platform has to be able to reach
 * whoever created it.
 */
export const createCompany = serviceMethod<CreateCompanyInput, CreateCompanyResult>(
  'company',
  'createCompany',
  // `authenticated`, not `permission`: there is no company yet, so there is no membership that
  // could hold one. The gate below is what actually constrains this.
  { kind: 'authenticated' },
  async (actor, input) => {
    if (actor.userId === null) return err(forbidden('auth:session'))

    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { emailVerifiedAt: true, phoneVerifiedAt: true },
    })
    if (user === null) return err(forbidden('auth:session'))

    const gate = checkVerificationGate('company:create', user)
    if (!gate.allowed) {
      // PRECONDITION, not FORBIDDEN: "verify your phone" is something the user can act on,
      // and it must not read the same as "you are not allowed" (`05` §Errors).
      return err(precondition(`verification_required:${gate.missing}`))
    }

    const slug = await uniqueSlug(slugify(input.displayName))

    try {
      const company = await prisma.$transaction(async (tx) => {
        const created = await tx.company.create({
          data: {
            slug,
            legalName: input.legalName,
            displayName: input.displayName,
            taxNumber: input.taxNumber ?? null,
            // Explicit, though it is also the column default. This is the line somebody will
            // look for when they ask why a new company cannot publish a price book.
            status: 'PENDING',
            ...(input.phone === undefined && input.cityId === undefined
              ? {}
              : {
                  contact: {
                    create: {
                      phone: input.phone ?? null,
                      ...(input.cityId === undefined ? {} : { cityId: input.cityId }),
                    },
                  },
                }),
          },
        })

        await tx.companyMembership.create({
          data: {
            companyId: created.id,
            userId: actor.userId as string,
            role: 'OWNER',
            acceptedAt: new Date(),
          },
        })

        return created
      })

      await recordAudit(actor, {
        action: 'company_created',
        entityType: 'Company',
        entityId: company.id,
        companyId: company.id,
        after: { slug: company.slug, status: company.status },
      })

      return ok({ companyId: company.id, slug: company.slug, status: 'PENDING', role: 'OWNER' })
    } catch (error) {
      return err(fromPrismaConstraint(error, 'Company'))
    }
  },
)

async function uniqueSlug(base: string): Promise<string> {
  const taken = await prisma.company.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  })
  const set = new Set(taken.map((row) => row.slug))
  if (!set.has(base)) return base

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`
    if (!set.has(candidate)) return candidate
  }
  // Unreachable in practice; a random suffix beats throwing on the thousandth "Pergola".
  return `${base}-${Math.floor(Date.now() % 100000)}`
}

/**
 * Turn a database constraint violation into the error it actually is.
 *
 * The one that matters here is `CompanyMembership_companyId_owner_key`, the partial unique
 * index that enforces "exactly one OWNER per company" (`02` §Company-scoped roles). A race
 * between two ownership transfers hits it, and if that surfaces as an unhandled exception the
 * user gets a 500 for a situation the system understands perfectly well. `CONFLICT` → 409,
 * with a message the screen can render.
 */
function fromPrismaConstraint(error: unknown, entity: string): DomainError {
  const code = (error as { code?: string } | null)?.code
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target
  const targetText = Array.isArray(target) ? target.join(',') : String(target ?? '')

  if (code === 'P2002') {
    if (targetText.includes('owner') || targetText.includes('role')) {
      return conflict('company already has an OWNER')
    }
    if (targetText.includes('userId') || targetText.includes('companyId')) {
      return conflict('already a member of this company')
    }
    if (targetText.includes('slug')) return conflict('slug already taken')
    if (targetText.includes('taxNumber')) return conflict('tax number already registered')
    return conflict(`${entity} already exists`)
  }

  // Not a constraint we recognise: rethrow, because swallowing it would turn a real bug into
  // a 409 that nobody investigates.
  throw error
}

export type MemberSummary = {
  userId: string
  email: string
  fullName: string | null
  role: CompanyRole
  invitedAt: Date
  acceptedAt: Date | null
}

export const listMembers = serviceMethod<ListMembersInput, { members: MemberSummary[] }>(
  'company',
  'listMembers',
  // `MEMBER_READ`, not `MEMBER_INVITE`: seeing who is in the company you work for is a read
  // every member needs, and gating it behind the ability to invite would leave SALES unable
  // to see the colleague they are handing a lead to (`ADR-016`).
  { kind: 'permission', permission: PERMISSIONS.MEMBER_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.MEMBER_READ)
    if (!allowed.ok) return err(allowed.error)

    const rows = await prisma.companyMembership.findMany({
      // Scoped to the company the actor was resolved against, not the one in the payload.
      where: { companyId: scopedCompanyId(actor.companyId, input.companyId) },
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { invitedAt: 'asc' },
    })

    return ok({
      members: rows.map((row) => ({
        userId: row.userId,
        email: row.user.email,
        fullName: row.user.fullName,
        role: row.role as CompanyRole,
        invitedAt: row.invitedAt,
        acceptedAt: row.acceptedAt,
      })),
    })
  },
)

/**
 * The company the actor was *resolved* against wins over the one in the payload.
 *
 * `resolveActor` reads `companyId` from the route and loads the membership for it; the role
 * in `actor` is only meaningful for that company. Trusting a `companyId` from the body would
 * mean checking a permission against one company and acting on another — the classic
 * confused-deputy shape.
 */
function scopedCompanyId(resolved: string | null, requested: string): string {
  return resolved ?? requested
}

export type InviteMemberResult = { invited: true; email: string }

export const inviteMember = serviceMethod<InviteMemberInput, InviteMemberResult>(
  'company',
  'inviteMember',
  { kind: 'permission', permission: PERMISSIONS.MEMBER_INVITE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.MEMBER_INVITE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = scopedCompanyId(actor.companyId, input.companyId)

    // `OWNER` is not in the invite schema at all — you transfer ownership, you do not invite
    // a second owner — but the role rule is checked here too rather than trusted to the DTO.
    if (!canAssignRole((actor.companyRole ?? 'VIEWER') as CompanyRole, input.role)) {
      return err(forbidden(PERMISSIONS.MEMBER_CHANGE_ROLE))
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { displayName: true },
    })
    if (company === null) return err(notFound('Company'))

    /*
     * The invitee may not have an account yet. One is created in a pending state — no
     * password — so the membership row can exist and the invitation link can be tied to a
     * user id. Signing in still requires a password, which they set on acceptance.
     */
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {},
      create: { email: input.email, locale: 'tr' },
    })

    try {
      await prisma.companyMembership.create({
        data: { companyId, userId: user.id, role: input.role, invitedAt: new Date() },
      })
    } catch (error) {
      return err(fromPrismaConstraint(error, 'CompanyMembership'))
    }

    const issued = await issueAuthToken(user.id, 'EMAIL_VERIFICATION', input.email)
    const link = new URL(`/davet?token=${issued.token}`, env.AUTH_URL).toString()

    try {
      const body = invitationEmail(link, company.displayName, brandName())
      await getMailer().send({ to: input.email, subject: body.subject, text: body.text })
    } catch (mailError) {
      console.error('[mail] invitation send failed', mailError)
    }

    await recordAudit(actor, {
      action: 'member_invited',
      entityType: 'CompanyMembership',
      entityId: user.id,
      companyId,
      after: { role: input.role, ttl: INVITATION_TTL_NOTE },
    })

    return ok({ invited: true as const, email: input.email })
  },
)

export type AcceptInvitationResult = { companyId: string; role: CompanyRole }

/**
 * Accept an invitation.
 *
 * `authenticated`, not `permission`: the invitee holds no permission in the company yet —
 * accepting is what gives them one. The token is the authority, and it is single-use.
 */
export const acceptInvitation = serviceMethod<AcceptInvitationInput, AcceptInvitationResult>(
  'company',
  'acceptInvitation',
  { kind: 'authenticated' },
  async (actor, input) => {
    if (actor.userId === null) return err(forbidden('auth:session'))

    const outcome = await consumeAuthToken(input.token, 'EMAIL_VERIFICATION')
    if (outcome.status !== 'valid') return err(forbidden('company:invitation'))
    if (outcome.userId !== actor.userId) {
      // Someone else's invitation link, opened while signed in as a different account.
      return err(forbidden('company:invitation'))
    }

    const membership = await prisma.companyMembership.findFirst({
      where: { userId: actor.userId, acceptedAt: null },
      orderBy: { invitedAt: 'desc' },
    })
    if (membership === null) return err(notFound('CompanyMembership'))

    await prisma.$transaction([
      prisma.companyMembership.update({
        where: { id: membership.id },
        data: { acceptedAt: new Date() },
      }),
      // Following the link proves the address receives mail, which is the same evidence
      // email verification collects.
      prisma.user.update({
        where: { id: actor.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ])

    await recordAudit(actor, {
      action: 'member_joined',
      entityType: 'CompanyMembership',
      entityId: membership.id,
      companyId: membership.companyId,
      after: { role: membership.role },
    })

    return ok({ companyId: membership.companyId, role: membership.role as CompanyRole })
  },
)

export type ChangeMemberRoleResult = { userId: string; role: CompanyRole }

/**
 * Change a member's role.
 *
 * Two rules, both from `02`'s table and its first footnote:
 *
 *  - `ADMIN` can neither grant nor take `OWNER`. Granting it would be self-promotion by
 *    proxy; taking it would be a coup.
 *  - There is exactly one `OWNER`, so granting it is a *transfer*: the current owner becomes
 *    `ADMIN` in the same transaction. Doing it in two statements would leave a window with
 *    two owners, which the partial unique index rejects — correctly, but as a 409 in the
 *    middle of an operation that was supposed to succeed.
 */
export const changeMemberRole = serviceMethod<ChangeMemberRoleInput, ChangeMemberRoleResult>(
  'company',
  'changeMemberRole',
  { kind: 'permission', permission: PERMISSIONS.MEMBER_CHANGE_ROLE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.MEMBER_CHANGE_ROLE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = scopedCompanyId(actor.companyId, input.companyId)
    const actorRole = (actor.companyRole ?? 'VIEWER') as CompanyRole

    const target = await prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId: input.userId, companyId } },
    })
    if (target === null) return err(notFound('CompanyMembership'))

    const targetRole = target.role as CompanyRole

    // Both directions: the role being granted, and the role being taken away.
    if (!canAssignRole(actorRole, input.role) || !canRevokeRole(actorRole, targetRole)) {
      return err(forbidden(PERMISSIONS.MEMBER_CHANGE_ROLE))
    }

    if (targetRole === input.role) return ok({ userId: input.userId, role: targetRole })

    try {
      if (input.role === 'OWNER') {
        await prisma.$transaction(async (tx) => {
          const current = await tx.companyMembership.findFirst({
            where: { companyId, role: 'OWNER' },
          })
          if (current !== null) {
            await tx.companyMembership.update({
              where: { id: current.id },
              data: { role: 'ADMIN' },
            })
          }
          await tx.companyMembership.update({
            where: { id: target.id },
            data: { role: 'OWNER' },
          })
        })
      } else {
        await prisma.companyMembership.update({
          where: { id: target.id },
          data: { role: input.role },
        })
      }
    } catch (error) {
      return err(fromPrismaConstraint(error, 'CompanyMembership'))
    }

    await recordAudit(actor, {
      action: 'member_role_changed',
      entityType: 'CompanyMembership',
      entityId: target.id,
      companyId,
      before: { role: targetRole },
      after: { role: input.role },
    })

    return ok({ userId: input.userId, role: input.role })
  },
)

export type RemoveMemberResult = { removed: true }

export const removeMember = serviceMethod<RemoveMemberInput, RemoveMemberResult>(
  'company',
  'removeMember',
  { kind: 'permission', permission: PERMISSIONS.MEMBER_REMOVE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.MEMBER_REMOVE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = scopedCompanyId(actor.companyId, input.companyId)
    const actorRole = (actor.companyRole ?? 'VIEWER') as CompanyRole

    const target = await prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId: input.userId, companyId } },
    })
    if (target === null) return err(notFound('CompanyMembership'))

    if (target.role === 'OWNER') {
      // Removing the owner would leave a company nobody can administer. Transfer first.
      return err(precondition('transfer ownership before removing the OWNER'))
    }
    if (!canRevokeRole(actorRole, target.role as CompanyRole)) {
      return err(forbidden(PERMISSIONS.MEMBER_REMOVE))
    }

    // Deleted, not flagged. `resolveActor` loads the membership on every request, so the row
    // disappearing *is* the revocation — there is no cache and no token to wait out.
    await prisma.companyMembership.delete({ where: { id: target.id } })

    await recordAudit(actor, {
      action: 'member_removed',
      entityType: 'CompanyMembership',
      entityId: target.id,
      companyId,
      before: { userId: input.userId, role: target.role },
    })

    return ok({ removed: true as const })
  },
)

export const companyService = {
  createCompany,
  listMembers,
  inviteMember,
  acceptInvitation,
  changeMemberRole,
  removeMember,
} satisfies Record<string, { meta: unknown }>

export type CompanyService = typeof companyService

/** Re-exported so tests can assert on the branch without reaching into Prisma internals. */
export type { Result }
