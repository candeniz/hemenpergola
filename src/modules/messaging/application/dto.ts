import { z } from 'zod'

import type { OfferRequestStatus } from '@/modules/offer/domain/state-machine'

/**
 * The messaging contract — one Zod schema per use case, shared by the server action, the
 * route handler, the tests and the mobile client (`CLAUDE.md` §Conventions,
 * `05` §Two entry points). Extracted from `message-service.ts` in Phase 11.2: a schema
 * living beside `server-only` and Prisma is unimportable in a React Native runtime, and
 * `@contracts/messaging` points here. Runtime-pure, pinned by `dto-purity.test.ts`.
 */

export const sendMessageSchema = z.object({
  offerRequestId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
})
export type SendMessageInput = z.infer<typeof sendMessageSchema>

export const listThreadSchema = z.object({
  offerRequestId: z.string().min(1),
  /** Cursor: only messages after this message id. The steady poll returns nothing. */
  after: z.string().optional(),
})
export type ListThreadInput = z.infer<typeof listThreadSchema>

export type MessageView = {
  id: string
  /** Which side sent it — never the raw userId, the reader does not need it. */
  sender: 'customer' | 'company'
  body: string
  sentAt: Date
  readAt: Date | null
}

export type ThreadView = {
  offerRequestId: string
  requestStatus: OfferRequestStatus
  canSend: boolean
  messages: MessageView[]
}
