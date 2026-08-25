import { z } from 'zod'

import { isStep } from '../domain/steps'
import type { ReadinessResult } from '../domain/readiness'

/**
 * The project contract (`10`), extracted from `project-service.ts` in Phase 11.2 — one
 * schema per use case, shared by every adapter and the mobile client. Runtime-pure,
 * pinned by `dto-purity.test.ts`.
 */

const projectRef = z.object({ projectId: z.string().min(1) })

export const createProjectSchema = z.object({
  productId: z.string().min(1),
  title: z.string().max(200).optional(),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const getProjectSchema = projectRef
export type GetProjectInput = z.infer<typeof getProjectSchema>

export const patchStepSchema = z.object({
  projectId: z.string().min(1),
  step: z.string().refine(isStep, 'unknown step'),
  /** Validated a second time against the step's own schema — see `patchStep`. */
  data: z.unknown(),
})
export type PatchStepInput = z.infer<typeof patchStepSchema>

export const validateProjectSchema = projectRef
export type ValidateProjectInput = z.infer<typeof validateProjectSchema>

export const claimProjectSchema = projectRef
export type ClaimProjectInput = z.infer<typeof claimProjectSchema>

export const listProjectsSchema = z.object({})
export type ListProjectsInput = z.infer<typeof listProjectsSchema>

export const duplicateProjectSchema = projectRef
export type DuplicateProjectInput = z.infer<typeof duplicateProjectSchema>

export const addAttachmentSchema = z.object({
  projectId: z.string().min(1),
  fileId: z.string().min(1),
})
export type AddAttachmentInput = z.infer<typeof addAttachmentSchema>

export const removeAttachmentSchema = z.object({
  projectId: z.string().min(1),
  attachmentId: z.string().min(1),
})
export type RemoveAttachmentInput = z.infer<typeof removeAttachmentSchema>

export type ProjectView = {
  projectId: string
  status: 'DRAFT' | 'READY' | 'SUBMITTED' | 'CLOSED'
  productId: string
  title: string | null
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
  /** Derived; there is no input that writes it (`10` §Field specifics). */
  areaM2: number | null
  quantity: number
  projectType: string | null
  installationType: string | null
  cityId: string | null
  districtId: string | null
  addressNote: string | null
  pointPrecision: 'EXACT' | 'DISTRICT' | 'CITY' | null
  timing: string | null
  note: string | null
  values: {
    attributeId: string
    optionId: string | null
    numberValue: number | null
    boolValue: boolean | null
    textValue: string | null
  }[]
  /** Task 4.6. `PHOTO` and `DOCUMENT` both — `10` §Field specifics, `14` §Limits. */
  attachments: {
    attachmentId: string
    fileId: string
    kind: 'PHOTO' | 'DOCUMENT'
    mime: string
    sizeBytes: number
    /** `14` §Virus scanning: nothing is served to anyone but the uploader until `CLEAN`. */
    virusScanStatus: 'PENDING' | 'CLEAN' | 'INFECTED' | 'FAILED'
    sortOrder: number
  }[]
}

export type ValidateResult = ReadinessResult & { status: string }

export type ClaimResult = {
  projectId: string
  /** `false` when the project was already this customer's — see the idempotency note. */
  claimed: boolean
}

export type ProjectSummary = {
  projectId: string
  status: 'DRAFT' | 'READY' | 'SUBMITTED' | 'CLOSED'
  productId: string
  title: string | null
  areaM2: number | null
  cityId: string | null
  attachmentCount: number
  updatedAt: string
}

export type ListProjectsResult = { projects: ProjectSummary[] }
