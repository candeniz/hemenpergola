import { z } from 'zod'

/**
 * The review contract (`16`), extracted from `review-service.ts` in Phase 11.2 — one
 * schema per use case, shared by every adapter and the mobile client. Runtime-pure,
 * pinned by `dto-purity.test.ts`.
 */

const rating = z.number().int().min(1).max(5)

export const submitReviewSchema = z.object({
  offerRequestId: z.string().min(1),
  ratingOverall: rating,
  ratingQuality: rating,
  ratingCommunication: rating,
  ratingTimeliness: rating,
  title: z.string().trim().max(100).optional(),
  body: z.string().trim().min(50).max(2000),
})
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>

export const moderateReviewSchema = z
  .object({
    reviewId: z.string().min(1),
    decision: z.enum(['PUBLISHED', 'REJECTED']),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((input) => input.decision !== 'REJECTED' || (input.reason ?? '').length > 0, {
    message: 'Rejection requires a reason — 16 §Moderation notifies the author with it.',
    path: ['reason'],
  })
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>

export const respondToReviewSchema = z.object({
  reviewId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
})
export type RespondToReviewInput = z.infer<typeof respondToReviewSchema>

export type ReviewView = {
  id: string
  ratingOverall: number
  ratingQuality: number
  ratingCommunication: number
  ratingTimeliness: number
  title: string | null
  body: string
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED'
  rejectionReason: string | null
  publishedAt: Date | null
  createdAt: Date
  response: { body: string; createdAt: Date } | null
}
