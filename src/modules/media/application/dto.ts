import { z } from 'zod'

/**
 * The file contract — presign → complete → url, shared by every adapter and the mobile
 * client (`06` §Files). Extracted from `file-service.ts` in Phase 11.2; runtime-pure,
 * pinned by `dto-purity.test.ts`.
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

export type CompleteResult = { fileId: string; queued: boolean }

export type FileUrlResult = {
  url: string
  accessClass: 'public' | 'semi-private' | 'private'
  expiresIn: number | null
}
