import { z } from 'zod'

import { CONTENT_PAGE_KEYS, contentBlocksSchema, type ContentBlock } from '../domain/blocks'

/**
 * The CMS contract (`18` §Content), extracted from `content-service.ts` in Phase 11.2.
 * Runtime-pure, pinned by `dto-purity.test.ts`.
 */

export { CONTENT_PAGE_KEYS } from '../domain/blocks'

export const upsertContentPageSchema = z.object({
  key: z.enum(CONTENT_PAGE_KEYS),
  locale: z.enum(['tr', 'en']),
  title: z.string().trim().min(1).max(200),
  blocks: contentBlocksSchema,
})
export type UpsertContentPageInput = z.infer<typeof upsertContentPageSchema>

export type ContentPageView = {
  key: string
  locale: string
  title: string
  blocks: ContentBlock[]
  updatedAt: Date
}
