import { z } from 'zod'

/**
 * The KVKK-rights contract (`19` §Access, §Erasure), extracted from
 * `privacy-service.ts` in Phase 11.2. Runtime-pure, pinned by `dto-purity.test.ts`.
 */

export const requestDataExportSchema = z.object({})

export type DataExportReceipt = { expiresAt: Date }

export const requestAccountErasureSchema = z.object({
  /** Typed confirmation — the account's own email. A deliberate speed bump, not a factor. */
  confirmEmail: z.string().email(),
})
export type RequestAccountErasureInput = z.infer<typeof requestAccountErasureSchema>

export const confirmAccountErasureSchema = z.object({ token: z.string().min(16) })
export type ConfirmAccountErasureInput = z.infer<typeof confirmAccountErasureSchema>

export const downloadDataExportSchema = z.object({
  token: z.string().min(16),
  /** The same package in either shape — the token's target is the JSON key. */
  format: z.enum(['json', 'pdf']).default('json'),
})
export type DownloadDataExportInput = z.infer<typeof downloadDataExportSchema>
