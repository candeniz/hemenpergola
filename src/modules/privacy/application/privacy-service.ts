import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { issueAuthToken } from '@/modules/iam/infrastructure/token-service'
import { brandName } from '@/modules/notification/domain/brand'
import { getMailer } from '@/modules/notification/infrastructure/mailer'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import { getStorage } from '@/shared/storage'

/**
 * KVKK rights — task 9.1, `19` §Access and §Erasure.
 *
 * **Erasure is anonymisation, never a hard delete.** Deleting the `User` row would
 * cascade through commercial records a manufacturer is entitled to keep (their accepted
 * requests, their offers, the reviews on their profile) — `19` rejects that explicitly.
 * Instead the account's personal fields are cleared, the email becomes
 * `deleted-{hash}@anonymised.local`, sessions and tokens die, notifications (a store of
 * personal payloads) are removed, and every project's free-text note is cleared. What
 * SURVIVES, by design: `Consent` and `ContactDisclosure` (legal-hold evidence), offers
 * and won engagements (commercial records), reviews (ids intact, author never public),
 * message transcripts (`15`: part of the engagement record), and the audit trail.
 *
 * **Export carries the subject's data and nobody else's** — the PENDING-DTO question
 * again, at export time: offer totals come without line items (`ADR-006`), messages
 * include only the ones the subject WROTE, and the manufacturer appears as a display
 * name, which is public directory data. Delivery: JSON to private storage, a signed
 * 30-day link by email (target: within 72 h; it completes in seconds). PDF rendering is
 * behind this same package shape and is tracked on the launch checklist — a Turkish
 * text-capable embeddable font has to be chosen before a PDF is honest.
 */

export const requestDataExportSchema = z.object({})

export type DataExportReceipt = { expiresAt: Date }

async function buildExportPackage(userId: string): Promise<Record<string, unknown>> {
  const [user, consents, projects, requests, reviews, sentMessages] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        fullName: true,
        phone: true,
        locale: true,
        createdAt: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    }),
    prisma.consent.findMany({
      where: { userId },
      select: { type: true, textVersion: true, grantedAt: true, revokedAt: true },
    }),
    prisma.project.findMany({
      where: { customerId: userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        widthMm: true,
        depthMm: true,
        heightMm: true,
        areaM2: true,
        quantity: true,
        note: true,
        city: { select: { name: true } },
        product: { select: { translations: { where: { locale: 'tr' }, select: { name: true } } } },
      },
    }),
    prisma.offerRequest.findMany({
      where: { customerId: userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        respondedAt: true,
        contactDisclosedAt: true,
        declineReason: true,
        company: { select: { displayName: true } },
        // Offer summaries WITHOUT line items — ADR-006 holds at export too.
        offers: {
          select: {
            number: true,
            status: true,
            netKurus: true,
            taxKurus: true,
            grossKurus: true,
            validUntil: true,
          },
        },
      },
    }),
    prisma.review.findMany({
      where: { customerId: userId },
      select: {
        ratingOverall: true,
        ratingQuality: true,
        ratingCommunication: true,
        ratingTimeliness: true,
        title: true,
        body: true,
        status: true,
        createdAt: true,
      },
    }),
    // Only what the subject WROTE. The other side's words are the other side's data;
    // their existence is visible to the subject in the app, but an export is a copy that
    // leaves our custody.
    prisma.message.findMany({
      where: { senderUserId: userId },
      select: { body: true, sentAt: true },
      orderBy: { sentAt: 'asc' },
    }),
  ])

  return {
    exportedAt: new Date().toISOString(),
    format: 'hemen-pergola/data-export.v1',
    profile: user,
    consents,
    projects: projects.map((project) => ({
      id: project.id,
      status: project.status,
      createdAt: project.createdAt,
      product: project.product?.translations[0]?.name ?? null,
      city: project.city?.name ?? null,
      dimensions: {
        widthMm: project.widthMm,
        depthMm: project.depthMm,
        heightMm: project.heightMm,
        areaM2: project.areaM2,
        quantity: project.quantity,
      },
      note: project.note,
    })),
    offerRequests: requests.map((request) => ({
      id: request.id,
      company: request.company.displayName,
      status: request.status,
      createdAt: request.createdAt,
      respondedAt: request.respondedAt,
      contactDisclosedAt: request.contactDisclosedAt,
      declineReason: request.declineReason,
      offers: request.offers,
    })),
    reviews,
    messagesSent: sentMessages,
  }
}

export const requestDataExport = serviceMethod<Record<string, never>, DataExportReceipt>(
  'privacy',
  'requestDataExport',
  {
    kind: 'customer-owned',
    describe: 'a user exports only their own data',
    scopedBy: ['userId'],
  },
  async (actor) => {
    if (actor.userId === null) return err(notFound('User'))

    const pkg = await buildExportPackage(actor.userId)
    const key = `private/exports/${actor.userId}/${Date.now()}.json`

    await getStorage().putObject({
      key,
      body: new TextEncoder().encode(JSON.stringify(pkg, null, 2)),
      mime: 'application/json',
    })

    const issued = await issueAuthToken(actor.userId, 'DATA_EXPORT', key)

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { email: true },
    })
    await getMailer().send({
      to: user.email,
      subject: 'Kişisel veri dışa aktarımınız hazır',
      text: [
        'Merhaba,',
        '',
        `${brandName()} hesabınızdaki kişisel verilerin dışa aktarımı hazırlandı. Aşağıdaki bağlantı 30 gün geçerlidir:`,
        '',
        `/api/v1/privacy/export?token=${issued.token}`,
        '',
        'Bu talebi siz yapmadıysanız lütfen bize ulaşın.',
      ].join('\n'),
    })

    await recordAudit(actor, {
      action: 'data_exported',
      entityType: 'User',
      entityId: actor.userId,
    })

    return ok({ expiresAt: issued.expiresAt })
  },
)

export const anonymiseAccountSchema = z.object({
  /** Typed confirmation — the account's own email, so a stray click cannot erase. */
  confirmEmail: z.string().email(),
})
export type AnonymiseAccountInput = z.infer<typeof anonymiseAccountSchema>

export const anonymiseAccount = serviceMethod<AnonymiseAccountInput, { anonymisedEmail: string }>(
  'privacy',
  'anonymiseAccount',
  {
    kind: 'customer-owned',
    describe: 'a user erases only their own account, and erasure is anonymisation',
    scopedBy: ['userId'],
  },
  async (actor, input) => {
    if (actor.userId === null) return err(notFound('User'))

    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, email: true, status: true },
    })
    if (user === null) return err(notFound('User'))
    if (user.status === 'DELETED') return err(precondition('Hesap zaten anonimleştirilmiş.'))
    if (user.email.toLowerCase() !== input.confirmEmail.toLowerCase()) {
      return err(precondition('Onay e-postası hesapla eşleşmiyor.'))
    }

    const anonymisedEmail = `deleted-${createHash('sha256')
      .update(user.id)
      .digest('hex')
      .slice(0, 16)}@anonymised.local`

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          email: anonymisedEmail,
          fullName: null,
          phone: null,
          passwordHash: null,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          status: 'DELETED',
          deletedAt: new Date(),
        },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.authToken.deleteMany({ where: { userId: user.id } }),
      prisma.notificationPreference.deleteMany({ where: { userId: user.id } }),
      // Notifications are a store of personal payloads (names, addresses in bodies) —
      // they go. The DISCLOSURE evidence is ContactDisclosure + Consent, which stay.
      prisma.notification.deleteMany({ where: { userId: user.id } }),
      // The projects' free-text notes carried personal context (ADR-026); the projects
      // themselves — dimensions, product, city — are the commercial record and stay.
      prisma.project.updateMany({ where: { customerId: user.id }, data: { note: null } }),
    ])

    await recordAudit(actor, {
      action: 'account_anonymised',
      entityType: 'User',
      entityId: user.id,
    })

    return ok({ anonymisedEmail })
  },
)

export const downloadDataExportSchema = z.object({ token: z.string().min(16) })

/**
 * Resolve an export link — anonymous BY the token: possession of the 256-bit value is the
 * authorisation (the same trust model as the email-verification link). Verified, not
 * consumed: the link is multi-use for its 30 days, because a download that dies at 90%
 * must be retryable without a support ticket.
 */
export const downloadDataExport = serviceMethod<
  { token: string },
  { fileName: string; body: Uint8Array }
>(
  'privacy',
  'downloadDataExport',
  {
    kind: 'anonymous',
    why: 'the emailed 256-bit token IS the authorisation, like the verification link',
  },
  async (_actor, input) => {
    const { hashToken } = await import('@/modules/iam/infrastructure/token-service')

    const row = await prisma.authToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    })
    if (row === null || row.type !== 'DATA_EXPORT' || row.target === null) {
      return err(notFound('DataExport'))
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return err(precondition('Bağlantının süresi doldu.'))
    }

    const body = await getStorage().getObject(row.target)
    return ok({ fileName: 'hemen-pergola-verileriniz.json', body })
  },
)
