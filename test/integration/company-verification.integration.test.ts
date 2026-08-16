import { beforeAll, describe, expect, it } from 'vitest'

import { authorize } from '@/modules/iam/application/authorization'
import {
  getCompanyForVerification,
  listVerificationQueue,
  rejectCompany,
  requestDocuments,
  reviewDocument,
  suspendCompany,
  verifyCompany,
} from '@/modules/iam/application/verification-service'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { setMailer, type Email } from '@/modules/notification/infrastructure/mailer'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Manufacturer verification — task 2.4, `17-admin-system.md` §Manufacturer verification and
 * `02-user-roles-and-permissions.md` §Verification state.
 *
 * Named `company-verification` because `verification.integration.test.ts` is Phase 1's
 * *email* verification. Two different things called verification is a fact about the domain,
 * not a naming accident, so both names say which one they mean.
 */

const admin: ActorContext = anonymousActor({
  userId: 'usr_verify_admin',
  globalRole: 'ADMIN',
  ip: '203.0.113.30',
  userAgent: 'integration-suite',
})

const outsider: ActorContext = anonymousActor({ userId: 'usr_outsider', globalRole: 'CUSTOMER' })

const mails: Email[] = []
setMailer({
  name: 'recording',
  async send(email) {
    mails.push(email)
  },
})

let sequence = 0

beforeAll(async () => {
  await getPrisma().user.upsert({
    where: { id: 'usr_verify_admin' },
    create: { id: 'usr_verify_admin', email: 'verify-admin@example.com', globalRole: 'ADMIN' },
    update: {},
  })
}, 60_000)

/** A pending company with an owner who can be emailed, and one uploaded document. */
async function pendingCompany(label: string) {
  sequence += 1
  const slug = `${label.toLowerCase()}-${sequence}`

  const owner = await getPrisma().user.create({
    data: { email: `owner-${slug}@example.com`, fullName: 'Firma Sahibi' },
  })

  const company = await getPrisma().company.create({
    data: {
      slug,
      legalName: `${label} Sanayi ve Ticaret A.Ş.`,
      displayName: label,
      status: 'PENDING',
      taxNumber: `${1000000000 + sequence}`,
      memberships: { create: { userId: owner.id, role: 'OWNER', acceptedAt: new Date() } },
    },
  })

  const file = await getPrisma().file.create({
    data: {
      key: `docs/${slug}/vergi-levhasi.pdf`,
      bucket: 'pergola-local',
      mime: 'application/pdf',
      sizeBytes: 12_345,
      ownerType: 'COMPANY_DOCUMENT',
      ownerId: company.id,
    },
  })

  const document = await getPrisma().companyDocument.create({
    data: { companyId: company.id, type: 'VERGI_LEVHASI', fileId: file.id, status: 'PENDING' },
  })

  return { company, owner, document }
}

describe('the queue', () => {
  it('opens on PENDING rather than on everything', async () => {
    // `17` §Command center: a work queue. A queue that opens on every company is a list, and
    // an admin then has to filter before they can start.
    const { company } = await pendingCompany('Kuyruk')

    const result = await listVerificationQueue(admin, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.companies.map((entry) => entry.companyId)).toContain(company.id)
    expect(result.value.companies.every((entry) => entry.status === 'PENDING')).toBe(true)
  }, 60_000)

  it('counts the documents still waiting on a reviewer', async () => {
    const { company } = await pendingCompany('Belgeli')

    const result = await listVerificationQueue(admin, {})
    if (!result.ok) return

    const entry = result.value.companies.find((row) => row.companyId === company.id)
    expect(entry?.documentCount).toBe(1)
    expect(entry?.pendingDocumentCount).toBe(1)
  }, 60_000)

  it('refuses a caller who is not a platform admin', async () => {
    const result = await listVerificationQueue(outsider, {})

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('FORBIDDEN')
  }, 30_000)
})

describe('approval', () => {
  it('sets VERIFIED and verifiedAt, and tells the company', async () => {
    const { company, owner } = await pendingCompany('Onaylanan')
    mails.length = 0

    const result = await verifyCompany(admin, { companyId: company.id })
    expect(result.ok).toBe(true)

    const after = await getPrisma().company.findUnique({ where: { id: company.id } })
    expect(after?.status).toBe('VERIFIED')
    expect(after?.verifiedAt).not.toBeNull()

    const mail = mails.find((message) => message.to === owner.email)
    expect(mail?.subject).toContain('doğrulandı')
  }, 60_000)

  it('clears a previous rejection reason', async () => {
    // Leaving it would show a verified company its old rejection text forever.
    const { company } = await pendingCompany('Sonradan')
    await rejectCompany(admin, { companyId: company.id, reason: 'Vergi levhası okunamıyor.' })

    await verifyCompany(admin, { companyId: company.id })

    const after = await getPrisma().company.findUnique({ where: { id: company.id } })
    expect(after?.rejectionReason).toBeNull()
  }, 60_000)

  it('refuses to verify an already verified company', async () => {
    const { company } = await pendingCompany('Ikikez')
    await verifyCompany(admin, { companyId: company.id })

    const again = await verifyCompany(admin, { companyId: company.id })
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.error.kind).toBe('PRECONDITION')
  }, 60_000)

  it('unlocks the permissions 02 §Verification state gates on VERIFIED', async () => {
    /*
     * "Unlocks matching" is not a second switch — it follows from the status. This asserts
     * the property that makes that true: the same OWNER goes from refused to allowed on a
     * `write` permission with nothing else changing.
     */
    const { company } = await pendingCompany('Yetki')

    const pending = anonymousActor({
      userId: 'usr_owner_probe',
      globalRole: 'CUSTOMER',
      companyId: company.id,
      companyRole: 'OWNER',
      companyStatus: 'PENDING',
    })

    expect(authorize(pending, PERMISSIONS.PRICE_BOOK_PUBLISH).ok).toBe(false)

    await verifyCompany(admin, { companyId: company.id })

    expect(
      authorize({ ...pending, companyStatus: 'VERIFIED' }, PERMISSIONS.PRICE_BOOK_PUBLISH).ok,
    ).toBe(true)
  }, 60_000)
})

describe('rejection', () => {
  it('needs a reason, and the schema is where that is enforced', async () => {
    const { company } = await pendingCompany('Gerekcesiz')
    const { rejectCompanySchema } = await import('@/modules/iam/application/verification-service')

    expect(rejectCompanySchema.safeParse({ companyId: company.id, reason: '' }).success).toBe(false)
    expect(rejectCompanySchema.safeParse({ companyId: company.id, reason: 'kısa' }).success).toBe(
      false,
    )
    expect(
      rejectCompanySchema.safeParse({ companyId: company.id, reason: 'Vergi levhası okunamıyor.' })
        .success,
    ).toBe(true)
  }, 30_000)

  it('stores the reason and sends it to the company verbatim', async () => {
    const { company, owner } = await pendingCompany('Reddedilen')
    mails.length = 0
    const reason = 'Yüklenen vergi levhası okunamıyor; lütfen net bir tarama gönderin.'

    const result = await rejectCompany(admin, { companyId: company.id, reason })
    expect(result.ok).toBe(true)

    const after = await getPrisma().company.findUnique({ where: { id: company.id } })
    expect(after?.status).toBe('REJECTED')
    expect(after?.rejectionReason).toBe(reason)

    // `17`: the reason stays visible to both sides, so there is no internal-versus-external
    // version of it to keep in step.
    const mail = mails.find((message) => message.to === owner.email)
    expect(mail?.text).toContain(reason)
  }, 60_000)

  it('is not terminal — a REJECTED company may still upload documents', async () => {
    /*
     * `02` §Verification state: *"REJECTED | read-only, may resubmit documents"*. That is
     * exactly one write permission out of twenty-one, and this asserts it is the right one.
     */
    const { company } = await pendingCompany('Yeniden')
    await rejectCompany(admin, { companyId: company.id, reason: 'Belgeler eksik gönderilmiş.' })

    const owner = anonymousActor({
      userId: 'usr_rejected_owner',
      globalRole: 'CUSTOMER',
      companyId: company.id,
      companyRole: 'OWNER',
      companyStatus: 'REJECTED',
    })

    expect(authorize(owner, PERMISSIONS.DOCUMENT_UPLOAD).ok).toBe(true)
    expect(authorize(owner, PERMISSIONS.OFFER_REQUEST_READ).ok).toBe(true)

    for (const permission of [
      PERMISSIONS.PRICE_BOOK_PUBLISH,
      PERMISSIONS.OFFER_SEND,
      PERMISSIONS.PRODUCT_MANAGE,
    ]) {
      expect(authorize(owner, permission).ok, permission).toBe(false)
    }
  }, 60_000)
})

describe('requesting documents', () => {
  it('does not change the status, and says what is missing', async () => {
    // `17` lists this as a separate action from rejection. Rejecting somebody in order to
    // ask them a question is how a verification queue becomes adversarial.
    const { company, owner } = await pendingCompany('Eksik')
    mails.length = 0

    const result = await requestDocuments(admin, {
      companyId: company.id,
      reason: 'Ticaret sicil gazetesinin son sayfası eksik.',
    })
    expect(result.ok).toBe(true)

    const after = await getPrisma().company.findUnique({ where: { id: company.id } })
    expect(after?.status).toBe('PENDING')

    const mail = mails.find((message) => message.to === owner.email)
    expect(mail?.text).toContain('Ticaret sicil gazetesinin son sayfası eksik.')

    // And it is still in the queue, which is the point of not changing the status.
    const queue = await listVerificationQueue(admin, {})
    if (!queue.ok) return
    expect(queue.value.companies.map((entry) => entry.companyId)).toContain(company.id)
  }, 60_000)
})

describe('suspension', () => {
  it('freezes the company and notifies it', async () => {
    const { company, owner } = await pendingCompany('Askida')
    await verifyCompany(admin, { companyId: company.id })
    mails.length = 0

    const result = await suspendCompany(admin, {
      companyId: company.id,
      reason: 'Müşteri şikâyetleri inceleniyor.',
    })
    expect(result.ok).toBe(true)

    const after = await getPrisma().company.findUnique({ where: { id: company.id } })
    expect(after?.status).toBe('SUSPENDED')

    expect(mails.find((message) => message.to === owner.email)?.subject).toContain('askıya')
  }, 60_000)

  it('leaves reads working and every write refused', async () => {
    const { company } = await pendingCompany('Donmus')
    await verifyCompany(admin, { companyId: company.id })
    await suspendCompany(admin, { companyId: company.id, reason: 'İnceleme sürüyor.' })

    const owner = anonymousActor({
      userId: 'usr_suspended_owner',
      globalRole: 'CUSTOMER',
      companyId: company.id,
      companyRole: 'OWNER',
      companyStatus: 'SUSPENDED',
    })

    expect(authorize(owner, PERMISSIONS.OFFER_REQUEST_READ).ok).toBe(true)
    // Unlike REJECTED, a suspended company cannot even upload documents — it is frozen,
    // not waiting.
    expect(authorize(owner, PERMISSIONS.DOCUMENT_UPLOAD).ok).toBe(false)
    expect(authorize(owner, PERMISSIONS.MEMBER_INVITE).ok).toBe(false)
  }, 60_000)

  it('refuses to ask a suspended company for documents', async () => {
    const { company } = await pendingCompany('Askili')
    await suspendCompany(admin, { companyId: company.id, reason: 'İnceleme sürüyor.' })

    const result = await requestDocuments(admin, {
      companyId: company.id,
      reason: 'Bir belge daha gerekiyor.',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('PRECONDITION')
  }, 60_000)
})

describe('document review', () => {
  it('records the reviewer, the time and the note', async () => {
    const { document } = await pendingCompany('Inceleme')

    const result = await reviewDocument(admin, {
      documentId: document.id,
      status: 'APPROVED',
      note: 'Okunaklı ve güncel.',
    })
    expect(result.ok).toBe(true)

    const after = await getPrisma().companyDocument.findUnique({ where: { id: document.id } })
    expect(after?.status).toBe('APPROVED')
    expect(after?.reviewedBy).toBe('usr_verify_admin')
    expect(after?.reviewedAt).not.toBeNull()
    expect(after?.note).toBe('Okunaklı ve güncel.')
  }, 60_000)

  it('refuses to reject a document without saying what is wrong', async () => {
    const { document } = await pendingCompany('Notsuz')

    const result = await reviewDocument(admin, { documentId: document.id, status: 'REJECTED' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('PRECONDITION')
  }, 60_000)
})

describe('every decision is audited, and the detail view reads that same trail', () => {
  it('writes one entry per decision, with the reason and the previous status', async () => {
    const { company } = await pendingCompany('Denetimli')

    await requestDocuments(admin, { companyId: company.id, reason: 'İmza sirküleri eksik.' })
    await rejectCompany(admin, { companyId: company.id, reason: 'İmza sirküleri gelmedi.' })
    await verifyCompany(admin, { companyId: company.id, note: 'Belgeler tamamlandı.' })

    const entries = await getPrisma().auditLog.findMany({
      where: { entityType: 'Company', entityId: company.id },
      orderBy: { createdAt: 'asc' },
    })

    expect(entries.map((entry) => entry.action)).toEqual([
      'company_documents_requested',
      'company_rejected',
      'company_verified',
    ])
    expect(entries.every((entry) => entry.actorUserId === 'usr_verify_admin')).toBe(true)
    expect(entries[1]?.reason).toBe('İmza sirküleri gelmedi.')
    expect((entries[1]?.before as { status?: string } | null)?.status).toBe('PENDING')
    expect((entries[2]?.after as { status?: string } | null)?.status).toBe('VERIFIED')
  }, 120_000)

  it('shows that trail on the detail screen rather than a second history table', async () => {
    // One source. The detail view and the audit viewer cannot tell different stories,
    // because there is only one story.
    const { company } = await pendingCompany('Gecmis')
    await rejectCompany(admin, { companyId: company.id, reason: 'Vergi levhası eksik.' })

    const detail = await getCompanyForVerification(admin, { companyId: company.id })
    expect(detail.ok).toBe(true)
    if (!detail.ok) return

    expect(detail.value.company.history[0]?.action).toBe('company_rejected')
    expect(detail.value.company.history[0]?.reason).toBe('Vergi levhası eksik.')
    expect(detail.value.company.documents).toHaveLength(1)
    expect(detail.value.company.members[0]?.role).toBe('OWNER')
  }, 60_000)
})
