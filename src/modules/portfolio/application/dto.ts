import { z } from 'zod'

/**
 * The portfolio contract (`14`), extracted from `portfolio-service.ts` in Phase 11.2 —
 * one schema per use case, shared by every adapter and the mobile client. Runtime-pure,
 * pinned by `dto-purity.test.ts`.
 */

export const listPortfolioSchema = z.object({ companyId: z.string().min(1) })
export type ListPortfolioInput = z.infer<typeof listPortfolioSchema>

export const createPortfolioItemSchema = z.object({
  companyId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional(),
  productId: z.string().min(1).optional(),
  cityId: z.string().min(1).optional(),
  completedAt: z.iso.date().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
})
export type CreatePortfolioItemInput = z.infer<typeof createPortfolioItemSchema>

export const updatePortfolioItemSchema = z.object({
  companyId: z.string().min(1),
  itemId: z.string().min(1),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  productId: z.string().min(1).nullable().optional(),
  cityId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})
export type UpdatePortfolioItemInput = z.infer<typeof updatePortfolioItemSchema>

export const deletePortfolioItemSchema = z.object({
  companyId: z.string().min(1),
  itemId: z.string().min(1),
})
export type DeletePortfolioItemInput = z.infer<typeof deletePortfolioItemSchema>

export const attachPhotoSchema = z.object({
  companyId: z.string().min(1),
  itemId: z.string().min(1),
  fileId: z.string().min(1),
  sortOrder: z.number().int().min(0).max(999).default(0),
})
export type AttachPhotoInput = z.infer<typeof attachPhotoSchema>

export type PortfolioPhotoView = {
  photoId: string
  fileId: string
  sortOrder: number
  scanStatus: string
  /** Public URL — a portfolio photo is CDN-served, unsigned (`14` §Access control). */
  url: string | null
  variants: { name: string; url: string; width: number }[]
}

export type PortfolioItemView = {
  itemId: string
  title: string
  description: string | null
  productId: string | null
  cityId: string | null
  completedAt: Date | null
  sortOrder: number
  photos: PortfolioPhotoView[]
}
