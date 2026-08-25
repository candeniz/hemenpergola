import 'server-only'

import { createHash } from 'node:crypto'

import {} from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { issueAuthToken } from '@/modules/iam/infrastructure/token-service'
import { brandName } from '@/modules/notification/domain/brand'
import { getMailer } from '@/modules/notification/infrastructure/mailer'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition, rateLimited } from '@/shared/result'
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

// The contract lives in ./dto (CLAUDE.md §Conventions, extracted in 11.2).
export * from './dto'

import {
  type ConfirmAccountErasureInput,
  type DataExportReceipt,
  type RequestAccountErasureInput,
} from './dto'

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

    // Each call is one email to the account holder — metered like the erasure request
    // (`06` §Rate limits, the `privacy` surface added with 29 B3).
    const { consumeRateLimit } = await import('@/shared/rate-limit')
    const budget = await consumeRateLimit('privacy', 'user', actor.userId)
    if (!budget.allowed) return err(rateLimited(budget.retryAfterSeconds))

    const pkg = await buildExportPackage(actor.userId)
    const stamp = Date.now()
    const key = `private/exports/${actor.userId}/${stamp}.json`

    await getStorage().putObject({
      key,
      body: new TextEncoder().encode(JSON.stringify(pkg, null, 2)),
      mime: 'application/json',
    })

    // 19 §Access asks for "JSON + PDF": the JSON is the complete machine-readable copy,
    // the PDF the readable summary. Both from the SAME package object, so they cannot
    // disagree; both behind the same token.
    const { renderExportPdf } = await import('../infrastructure/export-pdf')
    const pdfKey = `private/exports/${actor.userId}/${stamp}.pdf`
    await getStorage().putObject({
      key: pdfKey,
      body: await renderExportPdf(pkg),
      mime: 'application/pdf',
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
        `/api/v1/privacy/export?token=${issued.token}` + ' (JSON)',
        `/api/v1/privacy/export?token=${issued.token}&format=pdf` + ' (PDF)',
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

/*
 * ── Erasure, in two service methods (Q30) ────────────────────────────────────
 *
 * `19` §Data subject rights: *"account deletion request → verification → anonymisation
 * job"*. Until Phase 10.3 the middle word was missing: one call with a typed email
 * performed the anonymisation. The typed email is a **thinking tool** — it slows a person
 * down and stops a stray click — but it is not a second factor: the caller is already the
 * account, and `GET /me` returns the very address being "confirmed". Over HTTP that made
 * the irreversible operation two requests with one credential.
 *
 * Now: `requestAccountErasure` checks the typed email, issues a one-hour single-use
 * `ACCOUNT_ERASURE` token and emails it; `confirmAccountErasure` consumes the token and
 * performs the anonymisation. The email loop is the verification — proof of control of the
 * inbox, the same trust model as the password reset. The old single-step method is gone,
 * because keeping it registered would have kept the bypass.
 */

export const requestAccountErasure = serviceMethod<RequestAccountErasureInput, { expiresAt: Date }>(
  'privacy',
  'requestAccountErasure',
  {
    kind: 'customer-owned',
    describe: 'a user asks to erase only their own account; the emailed token verifies',
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

    // One emailed token per call — metered on the same surface as the export request.
    const { consumeRateLimit } = await import('@/shared/rate-limit')
    const budget = await consumeRateLimit('privacy', 'user', actor.userId)
    if (!budget.allowed) return err(rateLimited(budget.retryAfterSeconds))

    // Issuing invalidates any outstanding erasure token, so "resend" never leaves two
    // live erasure credentials in an inbox.
    const issued = await issueAuthToken(user.id, 'ACCOUNT_ERASURE')

    await getMailer().send({
      to: user.email,
      subject: 'Hesap silme talebiniz — onay gerekiyor',
      text: [
        'Merhaba,',
        '',
        `${brandName()} hesabınız için bir silme talebi aldık. Bu işlem GERİ ALINAMAZ:`,
        'adınız, e-postanız ve telefonunuz kalıcı olarak anonimleştirilir ve hesabınıza',
        'bir daha giriş yapamazsınız.',
        '',
        'Onaylamak için aşağıdaki bağlantıyı bir saat içinde açın:',
        '',
        `/hesap-silme-onay?token=${issued.token}`,
        '',
        'Bu talebi siz yapmadıysanız bu e-postayı yok sayın ve şifrenizi değiştirin —',
        'bağlantı açılmadığı sürece hesabınıza hiçbir şey olmaz.',
      ].join('\n'),
    })

    await recordAudit(actor, {
      action: 'account_erasure_requested',
      entityType: 'User',
      entityId: user.id,
    })

    return ok({ expiresAt: issued.expiresAt })
  },
)

export const confirmAccountErasure = serviceMethod<
  ConfirmAccountErasureInput,
  { anonymisedEmail: string }
>(
  'privacy',
  'confirmAccountErasure',
  {
    kind: 'anonymous',
    why: 'the emailed single-use token IS the authorisation — proof of inbox control, the password-reset trust model; the session may already be gone when the link is opened',
  },
  async (actor, input) => {
    const { consumeAuthToken } = await import('@/modules/iam/infrastructure/token-service')

    // Single-use and race-safe: two concurrent confirms cannot both anonymise, and a
    // replayed link answers `used`, not a second run.
    const outcome = await consumeAuthToken(input.token, 'ACCOUNT_ERASURE')
    if (outcome.status !== 'valid') {
      return outcome.status === 'expired'
        ? err(precondition('Bağlantının süresi doldu. Silme talebini yeniden başlatın.'))
        : err(notFound('ErasureRequest'))
    }

    const user = await prisma.user.findUnique({
      where: { id: outcome.userId },
      select: { id: true, email: true, status: true },
    })
    if (user === null) return err(notFound('User'))
    if (user.status === 'DELETED') return err(precondition('Hesap zaten anonimleştirilmiş.'))

    return performAnonymisation(actor, user)
  },
)

/**
 * The anonymisation itself — shared tail of the confirm path. `actor` is whoever carried
 * the token (usually the account, possibly a session that has already expired); the audit
 * entry records the subject either way.
 */
async function performAnonymisation(
  actor: Parameters<typeof recordAudit>[0],
  user: { id: string; email: string },
) {
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
}

/**
 * Resolve an export link — anonymous BY the token: possession of the 256-bit value is the
 * authorisation (the same trust model as the email-verification link). Verified, not
 * consumed: the link is multi-use for its 30 days, because a download that dies at 90%
 * must be retryable without a support ticket.
 */
export const downloadDataExport = serviceMethod<
  { token: string; format?: 'json' | 'pdf' },
  { fileName: string; body: Uint8Array; mime: string }
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

    const wantsPdf = input.format === 'pdf'
    const key = wantsPdf ? row.target.replace(/.json$/, '.pdf') : row.target
    const body = await getStorage().getObject(key)

    return ok({
      fileName: wantsPdf ? 'hemen-pergola-verileriniz.pdf' : 'hemen-pergola-verileriniz.json',
      body,
      mime: wantsPdf ? 'application/pdf' : 'application/json; charset=utf-8',
    })
  },
)
