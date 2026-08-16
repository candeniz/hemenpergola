import { describe, expect, it } from 'vitest'

import {
  confirmPhoneVerification,
  register,
  startPhoneVerification,
  verifyEmail,
} from '@/modules/iam/application/auth-service'
import {
  acceptInvitation,
  changeMemberRole,
  createCompany,
  inviteMember,
  listMembers,
  removeMember,
} from '@/modules/iam/application/company-service'
import { startPhoneVerificationSchema } from '@/modules/iam/application/dto'
import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { loadMembership } from '@/modules/iam/infrastructure/identify'
import { issueAuthToken } from '@/modules/iam/infrastructure/token-service'
import { setMailer, type Email } from '@/modules/notification/infrastructure/mailer'
import { setSmsSender, type Sms } from '@/modules/notification/infrastructure/sms-sender'
import { anonymousActor, resolveActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Company registration and membership — `26-execution-plan.md` row 1.6, and the half of the
 * Phase 1 gate that says *a manufacturer company is created and reaches `PENDING`*.
 */

const mails: Email[] = []
setMailer({
  name: 'recording',
  async send(email) {
    mails.push(email)
  },
})

const texts: Sms[] = []
setSmsSender({
  name: 'recording',
  async send(message) {
    texts.push(message)
  },
})

let seq = 0
const nextIp = () => `198.51.100.${(seq += 1) % 250}`

/** A user with both channels verified — `company:create` is gated on `email+phone`. */
async function verifiedUser(email: string, phone: string): Promise<ActorContext> {
  mails.length = 0
  const registered = await register(anonymousActor({ ip: nextIp() }), {
    email,
    password: 'membership-test-password',
    fullName: 'Membership Test',
    locale: 'tr',
  })
  if (!registered.ok) throw new Error(`register: ${JSON.stringify(registered.error)}`)

  const token = new URL(
    mails.find((mail) => mail.to === email)?.text.match(/https?:\/\/\S+/)?.[0] ?? '',
  ).searchParams.get('token')
  const verified = await verifyEmail(anonymousActor({ ip: nextIp() }), { token: token ?? '' })
  if (!verified.ok) throw new Error('verifyEmail failed')

  const actor = anonymousActor({ userId: registered.value.userId, globalRole: 'CUSTOMER' })

  texts.length = 0
  await startPhoneVerification(actor, startPhoneVerificationSchema.parse({ phone }))
  const code = texts[texts.length - 1]?.text.match(/\d{6}/)?.[0] ?? ''
  const confirmed = await confirmPhoneVerification(actor, { code })
  if (!confirmed.ok) throw new Error('confirmPhoneVerification failed')

  return actor
}

/**
 * The actor as the *next request* would build it: identity from the session, membership read
 * fresh from the database for the company in the path.
 *
 * Every membership assertion below goes through this rather than mutating an actor object,
 * because the claim under test is precisely that the next request sees the new state.
 */
async function nextRequestActor(actor: ActorContext, companyId: string): Promise<ActorContext> {
  return resolveActor(
    { headers: { get: () => null } },
    { companyId },
    {
      identify: async () => ({
        userId: actor.userId ?? '',
        globalRole: actor.globalRole ?? 'CUSTOMER',
      }),
      loadMembership,
    },
  )
}

describe('creating a company', () => {
  it('makes the creator OWNER and the company PENDING', async () => {
    // The Phase 1 gate, in one test.
    const actor = await verifiedUser('owner-create@example.com', '0555 900 00 01')

    const result = await createCompany(actor, {
      legalName: 'Öz Pergola Sistemleri Sanayi ve Ticaret A.Ş.',
      displayName: 'Öz Pergola',
      taxNumber: '1234567890',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.status).toBe('PENDING')
    expect(result.value.role).toBe('OWNER')
    // Turkish folded, not stripped: "Öz Pergola" must not become "-z-pergola".
    expect(result.value.slug).toBe('oz-pergola')

    const company = await getPrisma().company.findUnique({ where: { id: result.value.companyId } })
    expect(company?.status).toBe('PENDING')
    expect(company?.verifiedAt).toBeNull()

    const membership = await getPrisma().companyMembership.findFirst({
      where: { companyId: result.value.companyId },
    })
    expect(membership?.role).toBe('OWNER')
    expect(membership?.acceptedAt).not.toBeNull()
  }, 180_000)

  it('leaves a PENDING company able to onboard and nothing else', async () => {
    /*
     * `PENDING` is not a formality. `02` §Verification state lets a pending company do only
     * the work that gets it verified; if it could publish a price book the verification step
     * would be decorative.
     */
    const actor = await verifiedUser('owner-pending@example.com', '0555 900 00 02')
    const created = await createCompany(actor, {
      legalName: 'Pending Yapı A.Ş.',
      displayName: 'Pending Yapı',
    })
    if (!created.ok) throw new Error('createCompany failed')

    const request = await nextRequestActor(actor, created.value.companyId)

    expect(request.companyRole).toBe('OWNER')
    expect(request.companyStatus).toBe('PENDING')

    expect(authorize(request, PERMISSIONS.DOCUMENT_UPLOAD).ok).toBe(true)
    expect(authorize(request, PERMISSIONS.PRICE_BOOK_READ).ok).toBe(true)

    const blocked = authorize(request, PERMISSIONS.PRICE_BOOK_PUBLISH)
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    // PRECONDITION, not FORBIDDEN: "your company is pending" is actionable, "you are not
    // allowed" is not, and the two must not read the same (`05` §Errors).
    expect(blocked.error.kind).toBe('PRECONDITION')
  }, 180_000)

  it('refuses an unverified user, naming the channel that is missing', async () => {
    const registered = await register(anonymousActor({ ip: nextIp() }), {
      email: 'unverified-founder@example.com',
      password: 'membership-test-password',
      fullName: 'Unverified',
      locale: 'tr',
    })
    if (!registered.ok) throw new Error('register failed')

    const result = await createCompany(
      anonymousActor({ userId: registered.value.userId, globalRole: 'CUSTOMER' }),
      { legalName: 'Nope Ltd.', displayName: 'Nope' },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('PRECONDITION')
    if (result.error.kind !== 'PRECONDITION') return
    expect(result.error.reason).toBe('verification_required:email')
  }, 120_000)

  it('gives a second company with the same name a distinct slug', async () => {
    const first = await verifiedUser('slug-one@example.com', '0555 900 00 03')
    const second = await verifiedUser('slug-two@example.com', '0555 900 00 04')

    const a = await createCompany(first, { legalName: 'Aynı İsim A.Ş.', displayName: 'Aynı İsim' })
    const b = await createCompany(second, { legalName: 'Aynı İsim Ltd.', displayName: 'Aynı İsim' })

    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.value.slug).toBe('ayni-isim')
    expect(b.value.slug).toBe('ayni-isim-2')
  }, 240_000)
})

describe('one OWNER per company', () => {
  it('surfaces the partial unique index as CONFLICT, not a 500', async () => {
    /*
     * The index is `CompanyMembership_one_owner_per_company`, created by hand in migration 1
     * because Prisma cannot express a partial unique index. A raw constraint violation
     * escaping as an exception would give the user a 500 for a situation the system
     * understands perfectly well.
     */
    const actor = await verifiedUser('owner-conflict@example.com', '0555 900 00 05')
    const created = await createCompany(actor, {
      legalName: 'Conflict A.Ş.',
      displayName: 'Conflict',
    })
    if (!created.ok) throw new Error('createCompany failed')

    const other = await verifiedUser('owner-conflict-2@example.com', '0555 900 00 06')

    // Straight at the table, which is what a race between two ownership transfers reaches.
    await expect(
      getPrisma().companyMembership.create({
        data: {
          companyId: created.value.companyId,
          userId: other.userId ?? '',
          role: 'OWNER',
        },
      }),
    ).rejects.toThrow()

    // And through the service, which maps it.
    await getPrisma().companyMembership.create({
      data: { companyId: created.value.companyId, userId: other.userId ?? '', role: 'VIEWER' },
    })

    const request = await nextRequestActor(actor, created.value.companyId)
    const promote = await changeMemberRole(request, {
      companyId: created.value.companyId,
      userId: other.userId ?? '',
      role: 'OWNER',
    })

    // A transfer succeeds — the previous owner is demoted in the same transaction, so there
    // is never a moment with two.
    expect(promote.ok).toBe(true)

    const owners = await getPrisma().companyMembership.findMany({
      where: { companyId: created.value.companyId, role: 'OWNER' },
    })
    expect(owners).toHaveLength(1)
    expect(owners[0]?.userId).toBe(other.userId)
  }, 240_000)
})

describe('invitations', () => {
  it('invites, mails a link, and joins on acceptance', async () => {
    const owner = await verifiedUser('invite-owner@example.com', '0555 900 00 07')
    const created = await createCompany(owner, {
      legalName: 'Davet A.Ş.',
      displayName: 'Davet',
    })
    if (!created.ok) throw new Error('createCompany failed')

    const request = await nextRequestActor(owner, created.value.companyId)
    mails.length = 0

    const invited = await inviteMember(request, {
      companyId: created.value.companyId,
      email: 'newcomer@example.com',
      role: 'SALES',
    })
    expect(invited.ok).toBe(true)

    const mail = mails.find((message) => message.to === 'newcomer@example.com')
    expect(mail?.subject).toContain('Davet')
    const token = new URL(mail?.text.match(/https?:\/\/\S+/)?.[0] ?? '').searchParams.get('token')

    const invitee = await getPrisma().user.findUnique({ where: { email: 'newcomer@example.com' } })
    expect(invitee).not.toBeNull()

    const membershipBefore = await getPrisma().companyMembership.findFirst({
      where: { companyId: created.value.companyId, userId: invitee?.id },
    })
    expect(membershipBefore?.acceptedAt).toBeNull()

    const accepted = await acceptInvitation(
      anonymousActor({ userId: invitee?.id ?? '', globalRole: 'CUSTOMER' }),
      { token: token ?? '' },
    )
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.value.role).toBe('SALES')

    const membershipAfter = await getPrisma().companyMembership.findFirst({
      where: { companyId: created.value.companyId, userId: invitee?.id },
    })
    expect(membershipAfter?.acceptedAt).not.toBeNull()
  }, 240_000)

  it('refuses somebody else’s invitation link', async () => {
    const owner = await verifiedUser('invite-owner-2@example.com', '0555 900 00 08')
    const created = await createCompany(owner, { legalName: 'Steal A.Ş.', displayName: 'Steal' })
    if (!created.ok) throw new Error('createCompany failed')

    const request = await nextRequestActor(owner, created.value.companyId)
    mails.length = 0
    await inviteMember(request, {
      companyId: created.value.companyId,
      email: 'intended@example.com',
      role: 'VIEWER',
    })

    const token = new URL(
      mails.find((m) => m.to === 'intended@example.com')?.text.match(/https?:\/\/\S+/)?.[0] ?? '',
    ).searchParams.get('token')

    const stranger = await verifiedUser('opportunist@example.com', '0555 900 00 09')
    const stolen = await acceptInvitation(stranger, { token: token ?? '' })

    expect(stolen.ok).toBe(false)
    if (stolen.ok) return
    expect(stolen.error.kind).toBe('FORBIDDEN')
  }, 300_000)

  it('reports a duplicate invitation as CONFLICT', async () => {
    const owner = await verifiedUser('invite-owner-3@example.com', '0555 900 00 10')
    const created = await createCompany(owner, { legalName: 'Twice A.Ş.', displayName: 'Twice' })
    if (!created.ok) throw new Error('createCompany failed')

    const request = await nextRequestActor(owner, created.value.companyId)
    const payload = {
      companyId: created.value.companyId,
      email: 'duplicate@example.com',
      role: 'VIEWER' as const,
    }

    expect((await inviteMember(request, payload)).ok).toBe(true)

    const again = await inviteMember(request, payload)
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.error.kind).toBe('CONFLICT')
  }, 240_000)
})

describe('an ADMIN cannot touch OWNER', () => {
  it('refuses to grant it and refuses to take it', async () => {
    // `02`'s table, footnote 1. Granting would be self-promotion by proxy; taking would be
    // a coup.
    const owner = await verifiedUser('admin-limits-owner@example.com', '0555 900 00 11')
    const created = await createCompany(owner, { legalName: 'Limits A.Ş.', displayName: 'Limits' })
    if (!created.ok) throw new Error('createCompany failed')
    const companyId = created.value.companyId

    const admin = await verifiedUser('admin-limits-admin@example.com', '0555 900 00 12')
    await getPrisma().companyMembership.create({
      data: { companyId, userId: admin.userId ?? '', role: 'ADMIN', acceptedAt: new Date() },
    })

    const adminRequest = await nextRequestActor(admin, companyId)
    expect(adminRequest.companyRole).toBe('ADMIN')

    // Grant OWNER to themselves.
    const grab = await changeMemberRole(adminRequest, {
      companyId,
      userId: admin.userId ?? '',
      role: 'OWNER',
    })
    expect(grab.ok).toBe(false)

    // Demote the owner.
    const demote = await changeMemberRole(adminRequest, {
      companyId,
      userId: owner.userId ?? '',
      role: 'VIEWER',
    })
    expect(demote.ok).toBe(false)

    // Remove the owner.
    const remove = await removeMember(adminRequest, { companyId, userId: owner.userId ?? '' })
    expect(remove.ok).toBe(false)

    // Nothing moved.
    const owners = await getPrisma().companyMembership.findMany({
      where: { companyId, role: 'OWNER' },
    })
    expect(owners).toHaveLength(1)
    expect(owners[0]?.userId).toBe(owner.userId)
  }, 300_000)

  it('lets an ADMIN manage the roles below it', async () => {
    const owner = await verifiedUser('admin-can-owner@example.com', '0555 900 00 13')
    const created = await createCompany(owner, { legalName: 'Can A.Ş.', displayName: 'Can' })
    if (!created.ok) throw new Error('createCompany failed')
    const companyId = created.value.companyId

    const admin = await verifiedUser('admin-can-admin@example.com', '0555 900 00 14')
    const junior = await verifiedUser('admin-can-junior@example.com', '0555 900 00 15')

    await getPrisma().companyMembership.createMany({
      data: [
        { companyId, userId: admin.userId ?? '', role: 'ADMIN', acceptedAt: new Date() },
        { companyId, userId: junior.userId ?? '', role: 'VIEWER', acceptedAt: new Date() },
      ],
    })

    const adminRequest = await nextRequestActor(admin, companyId)

    const promoted = await changeMemberRole(adminRequest, {
      companyId,
      userId: junior.userId ?? '',
      role: 'SALES',
    })
    expect(promoted.ok).toBe(true)

    const removed = await removeMember(adminRequest, { companyId, userId: junior.userId ?? '' })
    expect(removed.ok).toBe(true)
  }, 300_000)
})

describe('a role change takes effect on the next request', () => {
  it('does not wait for a token to expire', async () => {
    /*
     * The claim `12` §Tokens is built around, and the reason `companyId` is not a JWT claim.
     * An access token lives fifteen minutes; a demotion that waits fifteen minutes is a
     * demotion that did not happen when it was made.
     *
     * `nextRequestActor` goes through `resolveActor` and the real `loadMembership`, so what
     * is measured here is the actual request path and not a rebuilt object.
     */
    const owner = await verifiedUser('revocation-owner@example.com', '0555 900 00 16')
    const created = await createCompany(owner, { legalName: 'Revoke A.Ş.', displayName: 'Revoke' })
    if (!created.ok) throw new Error('createCompany failed')
    const companyId = created.value.companyId

    const member = await verifiedUser('revocation-member@example.com', '0555 900 00 17')
    await getPrisma().companyMembership.create({
      data: { companyId, userId: member.userId ?? '', role: 'ADMIN', acceptedAt: new Date() },
    })

    const before = await nextRequestActor(member, companyId)
    expect(before.companyRole).toBe('ADMIN')
    expect(authorize(before, PERMISSIONS.MEMBER_INVITE).ok).toBe(true)

    // The owner demotes them. No token is reissued; nothing is invalidated.
    const ownerRequest = await nextRequestActor(owner, companyId)
    expect(
      (
        await changeMemberRole(ownerRequest, {
          companyId,
          userId: member.userId ?? '',
          role: 'VIEWER',
        })
      ).ok,
    ).toBe(true)

    const after = await nextRequestActor(member, companyId)
    expect(after.companyRole).toBe('VIEWER')
    expect(authorize(after, PERMISSIONS.MEMBER_INVITE).ok).toBe(false)
  }, 300_000)

  it('drops the membership entirely when the member is removed', async () => {
    const owner = await verifiedUser('removal-owner@example.com', '0555 900 00 18')
    const created = await createCompany(owner, { legalName: 'Remove A.Ş.', displayName: 'Remove' })
    if (!created.ok) throw new Error('createCompany failed')
    const companyId = created.value.companyId

    const member = await verifiedUser('removal-member@example.com', '0555 900 00 19')
    await getPrisma().companyMembership.create({
      data: { companyId, userId: member.userId ?? '', role: 'SALES', acceptedAt: new Date() },
    })

    expect((await nextRequestActor(member, companyId)).companyRole).toBe('SALES')

    const ownerRequest = await nextRequestActor(owner, companyId)
    expect((await removeMember(ownerRequest, { companyId, userId: member.userId ?? '' })).ok).toBe(
      true,
    )

    const after = await nextRequestActor(member, companyId)
    expect(after.companyRole).toBeNull()
    expect(after.companyStatus).toBeNull()

    // And every company-scoped permission is gone with it.
    expect(authorize(after, PERMISSIONS.OFFER_REQUEST_READ).ok).toBe(false)
    expect(
      (await listMembers(after, { companyId })).ok,
      'a removed member cannot read the roster',
    ).toBe(false)
  }, 300_000)
})

describe('a SUSPENDED company is read-only, immediately', () => {
  it('keeps every member able to read and nobody able to write', async () => {
    /*
     * Suspension is an admin action taken because something is wrong. If it took effect at
     * the next login it would be advisory, and the window between the decision and the
     * effect is exactly when the damage happens.
     */
    const owner = await verifiedUser('suspend-owner@example.com', '0555 900 00 20')
    const created = await createCompany(owner, {
      legalName: 'Suspend A.Ş.',
      displayName: 'Suspend',
    })
    if (!created.ok) throw new Error('createCompany failed')
    const companyId = created.value.companyId

    const sales = await verifiedUser('suspend-sales@example.com', '0555 900 00 21')
    await getPrisma().companyMembership.create({
      data: { companyId, userId: sales.userId ?? '', role: 'SALES', acceptedAt: new Date() },
    })

    await getPrisma().company.update({ where: { id: companyId }, data: { status: 'SUSPENDED' } })

    for (const actor of [owner, sales]) {
      const request = await nextRequestActor(actor, companyId)
      expect(request.companyStatus).toBe('SUSPENDED')

      // Reads survive — a suspended company still has to see its own data to respond to
      // whatever caused the suspension.
      expect(authorize(request, PERMISSIONS.OFFER_REQUEST_READ).ok).toBe(true)
      expect(authorize(request, PERMISSIONS.ANALYTICS_READ).ok).toBe(true)

      // Writes do not.
      for (const permission of [
        PERMISSIONS.OFFER_SEND,
        PERMISSIONS.MESSAGE_SEND,
        PERMISSIONS.PRICE_BOOK_WRITE,
        PERMISSIONS.PRODUCT_MANAGE,
      ]) {
        const denied = authorize(request, permission)
        expect(denied.ok, `${permission} for ${request.companyRole}`).toBe(false)
      }
    }

    // Even the OWNER cannot invite while suspended.
    const ownerRequest = await nextRequestActor(owner, companyId)
    const invited = await inviteMember(ownerRequest, {
      companyId,
      email: 'during-suspension@example.com',
      role: 'VIEWER',
    })
    expect(invited.ok).toBe(false)
    if (invited.ok) return
    expect(invited.error.kind).toBe('PRECONDITION')
  }, 300_000)
})

describe('the roster', () => {
  it('is visible to a member and invisible to everyone else', async () => {
    const owner = await verifiedUser('roster-owner@example.com', '0555 900 00 22')
    const created = await createCompany(owner, { legalName: 'Roster A.Ş.', displayName: 'Roster' })
    if (!created.ok) throw new Error('createCompany failed')
    const companyId = created.value.companyId

    const ownerRequest = await nextRequestActor(owner, companyId)
    const roster = await listMembers(ownerRequest, { companyId })

    expect(roster.ok).toBe(true)
    if (!roster.ok) return
    expect(roster.value.members).toHaveLength(1)
    expect(roster.value.members[0]?.role).toBe('OWNER')

    const outsider = await verifiedUser('roster-outsider@example.com', '0555 900 00 23')
    const outsiderRequest = await nextRequestActor(outsider, companyId)

    const denied = await listMembers(outsiderRequest, { companyId })
    expect(denied.ok).toBe(false)
    if (denied.ok) return
    expect(denied.error.kind).toBe('FORBIDDEN')
  }, 300_000)

  it('cannot be read for one company using a membership in another', async () => {
    /*
     * The confused-deputy shape: check the permission against the company you belong to,
     * act on the company named in the payload. The service scopes to `actor.companyId`,
     * which `resolveActor` took from the path.
     */
    const attacker = await verifiedUser('deputy-attacker@example.com', '0555 900 00 24')
    const mine = await createCompany(attacker, { legalName: 'Mine A.Ş.', displayName: 'Mine' })
    if (!mine.ok) throw new Error('createCompany failed')

    const victim = await verifiedUser('deputy-victim@example.com', '0555 900 00 25')
    const theirs = await createCompany(victim, { legalName: 'Theirs A.Ş.', displayName: 'Theirs' })
    if (!theirs.ok) throw new Error('createCompany failed')

    // Resolved against the company the attacker owns; payload names the other one.
    const request = await nextRequestActor(attacker, mine.value.companyId)
    const result = await listMembers(request, { companyId: theirs.value.companyId })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The roster returned is the attacker's own, not the victim's.
    expect(result.value.members.map((member) => member.email)).toEqual([
      'deputy-attacker@example.com',
    ])
  }, 300_000)
})

describe('invitation tokens', () => {
  it('are single-use', async () => {
    const owner = await verifiedUser('token-owner@example.com', '0555 900 00 26')
    const created = await createCompany(owner, { legalName: 'Token A.Ş.', displayName: 'Token' })
    if (!created.ok) throw new Error('createCompany failed')

    const invitee = await getPrisma().user.create({ data: { email: 'once@example.com' } })
    await getPrisma().companyMembership.create({
      data: { companyId: created.value.companyId, userId: invitee.id, role: 'VIEWER' },
    })

    const issued = await issueAuthToken(invitee.id, 'EMAIL_VERIFICATION', invitee.email)
    const actor = anonymousActor({ userId: invitee.id, globalRole: 'CUSTOMER' })

    expect((await acceptInvitation(actor, { token: issued.token })).ok).toBe(true)
    expect((await acceptInvitation(actor, { token: issued.token })).ok).toBe(false)
  }, 180_000)
})
