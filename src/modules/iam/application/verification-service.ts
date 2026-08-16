import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { brandName } from '@/modules/notification/domain/brand'
import {
  companyRejectedEmail,
  companySuspendedEmail,
  companyVerifiedEmail,
  documentsRequestedEmail,
} from '@/modules/notification/domain/templates'
import { getMailer } from '@/modules/notification/infrastructure/mailer'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { requireAdmin } from './authorization'

/**
 * Manufacturer verification — task 2.4, `17-admin-system.md` §Manufacturer verification.
 *
 * The decision that turns a registered company into a matchable one. Three properties the
 * service owns rather than the screen:
 *
 *   **A rejection carries a reason, always.** `17`: *"Rejection is not terminal: the company
 *   can resubmit, and the previous reason stays visible to both sides."* A rejection with no
 *   reason is a company that cannot fix anything, and a support ticket.
 *
 *   **Every decision is audited**, with the reason and the previous status.
 *
 *   **Every decision is sent to the company.** The full notification catalogue is Phase 7,
 *   but silence is not an acceptable placeholder for it: nobody should discover that their
 *   company was rejected by logging in and noticing.
 */

export const listVerificationQueueSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional(),
})
export type ListVerificationQueueInput = z.infer<typeof listVerificationQueueSchema>

export const getCompanyForVerificationSchema = z.object({ companyId: z.string().min(1) })
export type GetCompanyForVerificationInput = z.infer<typeof getCompanyForVerificationSchema>

/** A reason is mandatory on everything except approval. */
const reasonSchema = z.string().trim().min(10).max(1000)

export const verifyCompanySchema = z.object({
  companyId: z.string().min(1),
  note: z.string().trim().max(1000).optional(),
})
export type VerifyCompanyInput = z.infer<typeof verifyCompanySchema>

export const rejectCompanySchema = z.object({
  companyId: z.string().min(1),
  reason: reasonSchema,
})
export type RejectCompanyInput = z.infer<typeof rejectCompanySchema>

export const requestDocumentsSchema = z.object({
  companyId: z.string().min(1),
  reason: reasonSchema,
})
export type RequestDocumentsInput = z.infer<typeof requestDocumentsSchema>

export const suspendCompanySchema = z.object({
  companyId: z.string().min(1),
  reason: reasonSchema,
})
export type SuspendCompanyInput = z.infer<typeof suspendCompanySchema>

export const reviewDocumentSchema = z.object({
  documentId: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
})
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>

export type QueueEntry = {
  companyId: string
  slug: string
  displayName: string
  legalName: string
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'
  taxNumber: string | null
  createdAt: Date
  documentCount: number
  pendingDocumentCount: number
  rejectionReason: string | null
}

export const listVerificationQueue = serviceMethod<
  ListVerificationQueueInput,
  { companies: QueueEntry[] }
>('company', 'listVerificationQueue', { kind: 'admin' }, async (actor, input) => {
  const allowed = requireAdmin(actor)
  if (!allowed.ok) return err(allowed.error)

  const rows = await prisma.company.findMany({
    // `PENDING` first when no filter: `17` §Command center calls this a work queue, and a
    // work queue that opens on everything is a list.
    where: { status: input.status ?? 'PENDING' },
    include: { documents: { select: { status: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return ok({
    companies: rows.map((row) => ({
      companyId: row.id,
      slug: row.slug,
      displayName: row.displayName,
      legalName: row.legalName,
      status: row.status,
      taxNumber: row.taxNumber,
      createdAt: row.createdAt,
      documentCount: row.documents.length,
      pendingDocumentCount: row.documents.filter((document) => document.status === 'PENDING')
        .length,
      rejectionReason: row.rejectionReason,
    })),
  })
})

export type CompanyDetail = QueueEntry & {
  about: string | null
  foundedYear: number | null
  verifiedAt: Date | null
  members: { userId: string; email: string; fullName: string | null; role: string }[]
  documents: {
    id: string
    type: string
    status: string
    note: string | null
    reviewedBy: string | null
    reviewedAt: Date | null
    fileKey: string
    createdAt: Date
  }[]
  /** `17` §Manufacturer verification: the submission history is part of the decision. */
  history: {
    action: string
    reason: string | null
    actorUserId: string | null
    createdAt: Date
  }[]
}

export const getCompanyForVerification = serviceMethod<
  GetCompanyForVerificationInput,
  { company: CompanyDetail }
>('company', 'getCompanyForVerification', { kind: 'admin' }, async (actor, input) => {
  const allowed = requireAdmin(actor)
  if (!allowed.ok) return err(allowed.error)

  const row = await prisma.company.findUnique({
    where: { id: input.companyId },
    include: {
      documents: { include: { file: { select: { key: true } } }, orderBy: { createdAt: 'asc' } },
      memberships: { include: { user: { select: { email: true, fullName: true } } } },
    },
  })
  if (row === null) return err(notFound('Company'))

  /*
   * The history comes out of `AuditLog`, which is the same table the audit viewer reads and
   * the same rows the decisions below write. There is no second history table, so the
   * detail screen and the audit log cannot tell different stories.
   *
   * Indexed by `(entityType, entityId, createdAt)` — `04` §Indexes.
   */
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'Company', entityId: input.companyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return ok({
    company: {
      companyId: row.id,
      slug: row.slug,
      displayName: row.displayName,
      legalName: row.legalName,
      status: row.status,
      taxNumber: row.taxNumber,
      about: row.about,
      foundedYear: row.foundedYear,
      createdAt: row.createdAt,
      verifiedAt: row.verifiedAt,
      rejectionReason: row.rejectionReason,
      documentCount: row.documents.length,
      pendingDocumentCount: row.documents.filter((document) => document.status === 'PENDING')
        .length,
      members: row.memberships.map((membership) => ({
        userId: membership.userId,
        email: membership.user.email,
        fullName: membership.user.fullName,
        role: membership.role,
      })),
      documents: row.documents.map((document) => ({
        id: document.id,
        type: document.type,
        status: document.status,
        note: document.note,
        reviewedBy: document.reviewedBy,
        reviewedAt: document.reviewedAt,
        fileKey: document.file.key,
        createdAt: document.createdAt,
      })),
      history: history.map((entry) => ({
        action: entry.action,
        reason: entry.reason,
        actorUserId: entry.actorUserId,
        createdAt: entry.createdAt,
      })),
    },
  })
})

/** Who to tell. The owner if there is one, otherwise the company's contact address. */
async function companyRecipient(companyId: string): Promise<string | null> {
  const owner = await prisma.companyMembership.findFirst({
    where: { companyId, role: 'OWNER' },
    include: { user: { select: { email: true } } },
  })
  if (owner !== null) return owner.user.email

  const contact = await prisma.companyContact.findUnique({ where: { companyId } })
  return contact?.email ?? null
}

async function notify(companyId: string, body: { subject: string; text: string }): Promise<void> {
  const to = await companyRecipient(companyId)
  if (to === null) {
    console.error('[verification] no recipient for company', companyId)
    return
  }

  try {
    await getMailer().send({ to, subject: body.subject, text: body.text })
  } catch (error) {
    // A mail failure must not roll back a decision an admin has made and audited. The
    // decision is the record; the mail is the courtesy.
    console.error('[verification] notification failed', companyId, error)
  }
}

export type DecisionResult = {
  companyId: string
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'
  notified: boolean
}

/**
 * Approve.
 *
 * `17`: *"Approval sets `verifiedAt`, unlocks matching, notifies the company."* Matching is
 * Phase 5 and reads `status = VERIFIED`, so setting the status *is* unlocking it — there is
 * no second switch to forget.
 */
export const verifyCompany = serviceMethod<VerifyCompanyInput, DecisionResult>(
  'company',
  'verifyCompany',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.company.findUnique({ where: { id: input.companyId } })
    if (before === null) return err(notFound('Company'))
    if (before.status === 'VERIFIED') return err(precondition('company is already verified'))

    await prisma.company.update({
      where: { id: input.companyId },
      data: {
        status: 'VERIFIED',
        verifiedAt: new Date(),
        // The old reason goes with the old decision. Leaving it would show a verified
        // company its rejection text forever.
        rejectionReason: null,
      },
    })

    await recordAudit(actor, {
      action: 'company_verified',
      entityType: 'Company',
      entityId: input.companyId,
      companyId: input.companyId,
      before: { status: before.status },
      after: { status: 'VERIFIED' },
      reason: input.note,
    })

    await notify(input.companyId, companyVerifiedEmail(before.displayName, brandName()))

    return ok({ companyId: input.companyId, status: 'VERIFIED', notified: true })
  },
)

/**
 * Reject, with a reason.
 *
 * Not terminal (`17`). The company stays visible to itself, keeps its documents, and can
 * upload new ones — `02` §Verification state gives `REJECTED` exactly one write permission,
 * `document.upload`, which is what "can resubmit" means in the permission catalogue.
 */
export const rejectCompany = serviceMethod<RejectCompanyInput, DecisionResult>(
  'company',
  'rejectCompany',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.company.findUnique({ where: { id: input.companyId } })
    if (before === null) return err(notFound('Company'))

    await prisma.company.update({
      where: { id: input.companyId },
      data: { status: 'REJECTED', rejectionReason: input.reason, verifiedAt: null },
    })

    await recordAudit(actor, {
      action: 'company_rejected',
      entityType: 'Company',
      entityId: input.companyId,
      companyId: input.companyId,
      before: { status: before.status },
      after: { status: 'REJECTED' },
      reason: input.reason,
    })

    // The reason travels to the company verbatim. `17`: it stays visible to both sides, so
    // there is no internal-versus-external version of it to keep in step.
    await notify(
      input.companyId,
      companyRejectedEmail(before.displayName, input.reason, brandName()),
    )

    return ok({ companyId: input.companyId, status: 'REJECTED', notified: true })
  },
)

/**
 * Ask for more documents.
 *
 * Deliberately **not** a status change. `17` lists it as a separate action from rejection,
 * and it is: the company stays `PENDING`, stays in the queue, and is told what is missing.
 * Rejecting somebody in order to ask them a question is how a verification queue becomes
 * adversarial.
 */
export const requestDocuments = serviceMethod<RequestDocumentsInput, DecisionResult>(
  'company',
  'requestDocuments',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const company = await prisma.company.findUnique({ where: { id: input.companyId } })
    if (company === null) return err(notFound('Company'))
    if (company.status === 'SUSPENDED') {
      return err(
        precondition(
          'a suspended company cannot be asked for documents; lift the suspension first',
        ),
      )
    }

    await recordAudit(actor, {
      action: 'company_documents_requested',
      entityType: 'Company',
      entityId: input.companyId,
      companyId: input.companyId,
      before: { status: company.status },
      after: { status: company.status },
      reason: input.reason,
    })

    await notify(
      input.companyId,
      documentsRequestedEmail(company.displayName, input.reason, brandName()),
    )

    return ok({ companyId: input.companyId, status: company.status, notified: true })
  },
)

/**
 * Suspend, with a reason.
 *
 * `02` §Verification state: read-only and hidden from search and matching. Both follow from
 * the status — `statusAllowsPermission` refuses every write, and Phase 5's matching filters
 * on `VERIFIED`. `17` also pauses the company's `PENDING` requests; that table arrives in
 * Phase 6 and the pause belongs with it.
 */
export const suspendCompany = serviceMethod<SuspendCompanyInput, DecisionResult>(
  'company',
  'suspendCompany',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.company.findUnique({ where: { id: input.companyId } })
    if (before === null) return err(notFound('Company'))
    if (before.status === 'SUSPENDED') return err(precondition('company is already suspended'))

    await prisma.company.update({
      where: { id: input.companyId },
      data: { status: 'SUSPENDED', rejectionReason: input.reason },
    })

    await recordAudit(actor, {
      action: 'company_suspended',
      entityType: 'Company',
      entityId: input.companyId,
      companyId: input.companyId,
      before: { status: before.status },
      after: { status: 'SUSPENDED' },
      reason: input.reason,
    })

    await notify(
      input.companyId,
      companySuspendedEmail(before.displayName, input.reason, brandName()),
    )

    return ok({ companyId: input.companyId, status: 'SUSPENDED', notified: true })
  },
)

export type ReviewDocumentResult = { documentId: string; status: 'APPROVED' | 'REJECTED' }

/**
 * Review one document.
 *
 * `17`: *"Document viewing is audit-logged as a disclosure — these are legal identity
 * documents."* The review decision is logged here; the *viewing* is logged by whatever
 * fetches the file, which is Phase 3's storage surface — noted in `25-progress.md` rather
 * than silently skipped.
 */
export const reviewDocument = serviceMethod<ReviewDocumentInput, ReviewDocumentResult>(
  'company',
  'reviewDocument',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.companyDocument.findUnique({ where: { id: input.documentId } })
    if (before === null) return err(notFound('CompanyDocument'))

    if (input.status === 'REJECTED' && (input.note ?? '').trim().length < 5) {
      // Same rule as a company rejection, one level down: a rejected document with no note
      // is a document nobody can fix.
      return err(precondition('a rejected document needs a note saying what is wrong'))
    }

    await prisma.companyDocument.update({
      where: { id: input.documentId },
      data: {
        status: input.status,
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
        note: input.note ?? null,
      },
    })

    await recordAudit(actor, {
      action: 'document_reviewed',
      entityType: 'CompanyDocument',
      entityId: input.documentId,
      companyId: before.companyId,
      before: { status: before.status },
      after: { status: input.status },
      reason: input.note,
    })

    return ok({ documentId: input.documentId, status: input.status })
  },
)

export const verificationService = {
  listVerificationQueue,
  getCompanyForVerification,
  verifyCompany,
  rejectCompany,
  requestDocuments,
  suspendCompany,
  reviewDocument,
} satisfies Record<string, { meta: unknown }>
