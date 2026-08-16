import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { loadMembership } from '@/modules/iam/infrastructure/identify'
import type { ActorContext } from '@/shared/context/actor'
import { prisma } from '@/shared/db'
import { enqueue, JOB } from '@/shared/jobs'
import { conflict, err, forbidden, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import { getStorage } from '@/shared/storage'

import { checkUpload, storageKey, UPLOAD_POLICY, type OwnerType } from '../domain/upload-policy'

/**
 * Uploads — `14-file-storage-and-media.md` §Upload flow, §Limits, §Access control.
 *
 * Three properties this service owns:
 *
 *   **Validation happens before the URL is issued**, not after the bytes arrive. `14` is
 *   explicit, and the reason is that after the bytes arrive the storage bill is already
 *   paid.
 *
 *   **The access class is a property of the key**, so a public object and a private one
 *   cannot be confused by a wrong `where` clause.
 *
 *   **Issuing a read URL for a company document is a disclosure and is audit-logged.** `17`
 *   §Manufacturer verification calls document *viewing* a disclosure — these are legal
 *   identity documents — and Phase 2 could only log the decision, because the surface that
 *   serves the file did not exist yet. It does now.
 */

export const presignUploadSchema = z.object({
  ownerType: z.enum([
    'PROJECT',
    'COMPANY_DOCUMENT',
    'PORTFOLIO',
    'COMPANY_LOGO',
    'COMPANY_COVER',
    'CMS',
    'OFFER_ATTACHMENT',
  ]),
  ownerId: z.string().min(1),
  mime: z.string().min(3).max(120),
  sizeBytes: z.number().int().positive(),
})
export type PresignUploadInput = z.infer<typeof presignUploadSchema>

export const completeUploadSchema = z.object({ fileId: z.string().min(1) })
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>

export const fileUrlSchema = z.object({ fileId: z.string().min(1) })
export type FileUrlInput = z.infer<typeof fileUrlSchema>

export type PresignResult = {
  fileId: string
  uploadUrl: string
  key: string
  expiresIn: number
}

/**
 * Who may attach a file to this owner.
 *
 * Ownership is resolved from the owner row rather than trusted from the payload: a caller
 * who can name a `companyId` must still be a member of it. Project and CMS owners arrive
 * with their phases and are refused until then rather than left open.
 */
async function mayUploadFor(
  actor: ActorContext,
  ownerType: OwnerType,
  ownerId: string,
): Promise<boolean> {
  if (actor.userId === null) return false
  if (actor.globalRole === 'ADMIN') return true

  switch (ownerType) {
    case 'COMPANY_DOCUMENT':
    case 'COMPANY_LOGO':
    case 'COMPANY_COVER': {
      const membership = await loadMembership(actor.userId, ownerId)
      return membership !== null
    }
    case 'PORTFOLIO': {
      // The owner is a `PortfolioItem`, so the company comes from the item.
      const item = await prisma.portfolioItem.findUnique({
        where: { id: ownerId },
        select: { companyId: true },
      })
      if (item === null) return false
      return (await loadMembership(actor.userId, item.companyId)) !== null
    }
    default:
      // `PROJECT`, `CMS` and `OFFER_ATTACHMENT` belong to phases that are not built. Refusing
      // is the safe default; allowing "for later" is how an unowned upload path ships.
      return false
  }
}

export const presignUpload = serviceMethod<PresignUploadInput, PresignResult>(
  'media',
  'presignUpload',
  {
    kind: 'owner',
    describe: 'the owner row is loaded and its company membership checked before a URL exists',
  },
  async (actor, input) => {
    if (!(await mayUploadFor(actor, input.ownerType, input.ownerId))) {
      return err(forbidden('media:upload'))
    }

    const existingCount = await prisma.file.count({
      where: { ownerType: input.ownerType, ownerId: input.ownerId },
    })

    const problem = checkUpload(input.ownerType, {
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      existingCount,
    })

    if (problem !== null) {
      switch (problem.kind) {
        case 'mime-not-allowed':
          return err(
            precondition(
              `${problem.mime} is not accepted here; allowed: ${problem.allowed.join(', ')}`,
            ),
          )
        case 'too-large':
          return err(
            precondition(
              `file is ${Math.round(problem.sizeBytes / 1024)} KB; the limit is ${Math.round(problem.maxBytes / 1024)} KB`,
            ),
          )
        case 'too-many':
          return err(conflict(`already at the limit of ${problem.maxCount} files`))
      }
    }

    /*
     * The row is created first, `PENDING`, and the key is derived from its id. The
     * alternative — key first, row after the upload — leaves objects in the bucket with no
     * row, and `14` §Retention says an object is never deleted without a corresponding
     * `File` transition, which is what makes the orphan sweep safe to run.
     */
    const file = await prisma.file.create({
      data: {
        key: 'pending',
        bucket: 'pending',
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        uploadedBy: actor.userId,
        virusScanStatus: 'PENDING',
      },
    })

    const key = storageKey({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      fileId: file.id,
      mime: input.mime,
    })

    const storage = getStorage()
    const presigned = await storage.presignUpload({
      key,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
    })

    const { env } = await import('@/shared/config/env')
    await prisma.file.update({
      where: { id: file.id },
      data: { key, bucket: env.S3_BUCKET },
    })

    return ok({
      fileId: file.id,
      uploadUrl: presigned.uploadUrl,
      key,
      expiresIn: presigned.expiresIn,
    })
  },
)

export type CompleteResult = { fileId: string; queued: boolean }

/**
 * The client has uploaded; hand the file to `media.process`.
 *
 * Nothing is trusted from this call except "the bytes may be there now" — dimensions, the
 * real MIME and the scan status are all decided by the job, from the object itself.
 */
export const completeUpload = serviceMethod<CompleteUploadInput, CompleteResult>(
  'media',
  'completeUpload',
  { kind: 'owner', describe: 'the File row, scoped by the uploader or their company' },
  async (actor, input) => {
    const file = await prisma.file.findUnique({ where: { id: input.fileId } })
    if (file === null) return err(notFound('File'))

    if (!(await mayUploadFor(actor, file.ownerType as OwnerType, file.ownerId))) {
      return err(forbidden('media:upload'))
    }

    const jobId = await enqueue(
      JOB.mediaProcess,
      { fileId: file.id },
      // One job per file while one is queued. The handler is idempotent anyway — see
      // `worker.ts` — because a completed job stops deduplicating a new one.
      { singletonKey: `media:${file.id}` },
    )

    return ok({ fileId: file.id, queued: jobId !== null })
  },
)

export type FileUrlResult = {
  url: string
  accessClass: 'public' | 'semi-private' | 'private'
  expiresIn: number | null
}

/**
 * A URL for reading one file.
 *
 * **This is the disclosure boundary.** For a company document it produces a five-minute
 * signed URL, only for a member of the owning company or an admin, and it writes an audit
 * entry — the carried-over debt from Phase 2, where the verification *decision* was logged
 * and the *access* was not because there was no surface serving the bytes.
 */
export const fileUrl = serviceMethod<FileUrlInput, FileUrlResult>(
  'media',
  'fileUrl',
  { kind: 'owner', describe: 'the File row, via its owner company; admins bypass' },
  async (actor, input) => {
    if (actor.userId === null) return err(forbidden('media:read'))

    const file = await prisma.file.findUnique({ where: { id: input.fileId } })
    if (file === null) return err(notFound('File'))

    const policy = UPLOAD_POLICY[file.ownerType as OwnerType]

    /*
     * `14` §Virus scanning: files are not served to anyone but the uploader until `CLEAN`.
     * An `INFECTED` file has had its object deleted, so there is nothing to serve at all.
     */
    if (file.virusScanStatus === 'INFECTED')
      return err(precondition('file was rejected by the scanner'))
    if (file.virusScanStatus !== 'CLEAN' && file.uploadedBy !== actor.userId) {
      return err(precondition('file is still being scanned'))
    }

    if (policy.accessClass !== 'public') {
      const permitted = await mayReadPrivate(actor, file.ownerType as OwnerType, file.ownerId)
      if (!permitted) return err(forbidden('media:read'))
    }

    const url = await getStorage().readUrl(file.key, policy.accessClass)

    if (file.ownerType === 'COMPANY_DOCUMENT') {
      /*
       * `17` §Manufacturer verification: *"Document viewing is audit-logged as a disclosure
       * — these are legal identity documents."* Logged on issuance rather than on fetch,
       * because the fetch goes straight to storage and never reaches us; the URL is the
       * thing we hand over, so the URL is the thing to record.
       */
      await recordAudit(actor, {
        action: 'document_viewed',
        entityType: 'CompanyDocument',
        entityId: file.ownerId,
        companyId: file.ownerId,
        after: { fileId: file.id, key: file.key },
        reason: 'signed URL issued',
      })
    }

    return ok({
      url,
      accessClass: policy.accessClass,
      expiresIn: policy.accessClass === 'public' ? null : SIGNED_TTL[policy.accessClass],
    })
  },
)

const SIGNED_TTL = { 'semi-private': 15 * 60, private: 5 * 60 } as const

async function mayReadPrivate(
  actor: ActorContext,
  ownerType: OwnerType,
  ownerId: string,
): Promise<boolean> {
  if (actor.globalRole === 'ADMIN') return true
  if (actor.userId === null) return false

  if (ownerType === 'COMPANY_DOCUMENT') {
    return (await loadMembership(actor.userId, ownerId)) !== null
  }

  // Project photos become readable to a manufacturer when their request is `ACCEPTED`,
  // which is Phase 6. Until that table exists the honest answer is no.
  return false
}

export const fileService = { presignUpload, completeUpload, fileUrl } satisfies Record<
  string,
  { meta: unknown }
>
