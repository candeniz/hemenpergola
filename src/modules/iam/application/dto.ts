import { z } from 'zod'

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../domain/password'

/**
 * One Zod schema per use case, shared by the server action, the route handler and the tests
 * (`CLAUDE.md` §Conventions, `05-system-architecture.md` §Two entry points).
 *
 * Shared literally, not "kept in sync": both adapters import these, so a change reaches
 * both or neither.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .refine((value) => value.includes('@'), { message: 'must be an email address' })

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  locale: z.enum(['tr', 'en']).default('tr'),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: emailSchema,
  // Not `passwordSchema`: the login form must accept a password that no longer meets the
  // current policy, or tightening the policy locks out every existing user.
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})
export type LoginInput = z.infer<typeof loginSchema>

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})
export type RefreshInput = z.infer<typeof refreshSchema>

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  /** Log out everywhere, not just this device. */
  allDevices: z.boolean().default(false),
})
export type LogoutInput = z.infer<typeof logoutSchema>

/**
 * A Turkish mobile number in E.164. Stored normalised, because "0555 123 45 67",
 * "+90 555 123 45 67" and "905551234567" are one number and an OTP sent to the wrong
 * formatting of it is simply lost.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .transform((value) => {
    if (value.startsWith('+90')) return value
    if (value.startsWith('90') && value.length === 12) return `+${value}`
    if (value.startsWith('0')) return `+90${value.slice(1)}`
    return `+90${value}`
  })
  .refine((value) => /^\+905\d{9}$/.test(value), {
    message: 'must be a Turkish mobile number',
  })

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
})
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(200),
})
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>

export const resendEmailVerificationSchema = z.object({
  email: emailSchema,
})
export type ResendEmailVerificationInput = z.infer<typeof resendEmailVerificationSchema>

export const startPhoneVerificationSchema = z.object({
  phone: phoneSchema,
})
export type StartPhoneVerificationInput = z.infer<typeof startPhoneVerificationSchema>

export const confirmPhoneVerificationSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: 'six digits' }),
})
export type ConfirmPhoneVerificationInput = z.infer<typeof confirmPhoneVerificationSchema>

export const listSessionsSchema = z.object({})
export type ListSessionsInput = z.infer<typeof listSessionsSchema>

export const revokeSessionSchema = z.object({
  /** A refresh-token family id. Omitted with `allOthers` to end every other session. */
  familyId: z.string().min(1).max(64).optional(),
  allOthers: z.boolean().default(false),
  /** The session making the request, so "all others" can spare it. */
  currentRefreshToken: z.string().min(1).optional(),
})
export type RevokeSessionInput = z.infer<typeof revokeSessionSchema>

/* ── Company (`26-execution-plan.md` row 1.6) ─────────────────────────────────────── */

export const createCompanySchema = z.object({
  legalName: z.string().trim().min(3).max(200),
  displayName: z.string().trim().min(2).max(120),
  taxNumber: z
    .string()
    .trim()
    .regex(/^\d{10,11}$/, { message: 'ten or eleven digits' })
    .optional(),
  phone: phoneSchema.optional(),
  cityId: z.string().min(1).optional(),
})
export type CreateCompanyInput = z.infer<typeof createCompanySchema>

export const inviteMemberSchema = z.object({
  companyId: z.string().min(1),
  email: emailSchema,
  role: z.enum(['ADMIN', 'SALES', 'VIEWER']),
})
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>

export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(200),
})
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>

export const changeMemberRoleSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'SALES', 'VIEWER']),
})
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>

export const removeMemberSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
})
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>

export const listMembersSchema = z.object({
  companyId: z.string().min(1),
})
export type ListMembersInput = z.infer<typeof listMembersSchema>

/* ── Phase 11.2 extraction — result types and the remaining service-file schemas ──
 *
 * The schemas above were here from Phase 1; these joined when mobile became the fourth
 * consumer and anything living beside `server-only` stopped being importable. Types that
 * borrow from impure files (`SessionSummary`, `CompanyRole`) come in via `import type`,
 * which is erased — the runtime-purity pin in `dto-purity.test.ts` allows exactly that.
 */
import type { CompanyRole } from '../domain/permissions'

/**
 * One signed-in session family (`12` §Sessions and revocation). Defined HERE and imported
 * by `token-service` rather than the other way round: even a type-only import of an
 * infrastructure file makes mobile's tsc parse that file, and its `@/` imports do not
 * resolve outside the web tsconfig. Infrastructure depending on the contract is the right
 * direction anyway.
 */
export type SessionSummary = {
  familyId: string
  ip: string | null
  userAgent: string | null
  startedAt: Date
  lastUsedAt: Date
  current: boolean
}

export type AuthTokens = {
  /**
   * Who signed in. Their own id, returned to them.
   *
   * Added in Phase 4 for `ADR-022`: `loginAction` opens a browser session row and needs the
   * user it belongs to. Decoding the access token to recover it would mean the action
   * verifying a token it had just minted, and a client needs to know who it is signed in as
   * regardless.
   */
  userId: string
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * What signing in returns — tokens **plus a web session** (`ADR-022`). A separate type
 * from `AuthTokens` because `refresh` returns that one and must **not** open a browser
 * session; sharing the type would have made the session optional, and an optional session
 * is one a caller forgets to set.
 */
export type LoginResult = AuthTokens & {
  webSession: { token: string; expires: Date }
}

export type RegisterResult = {
  userId: string
  /** Never the token itself — the caller sends it by email, it does not go in the response. */
  emailVerificationSent: boolean
}

export type LogoutResult = { revokedFamilies: number }
export type RequestPasswordResetResult = { sent: true }
export type ResetPasswordResult = { revokedSessions: number }
export type VerifyEmailResult = { verified: true }
export type StartPhoneVerificationResult = { sent: true; expiresAt: Date }
export type ConfirmPhoneVerificationResult = { verified: true }
export type ListSessionsResult = { sessions: SessionSummary[] }
export type RevokeSessionResult = { revoked: number }

/* company-service results */

export type CreateCompanyResult = {
  companyId: string
  slug: string
  /** Always `PENDING` — see the service. */
  status: 'PENDING'
  role: 'OWNER'
}

export type MemberSummary = {
  userId: string
  email: string
  fullName: string | null
  role: CompanyRole
  invitedAt: Date
  acceptedAt: Date | null
}

export type InviteMemberResult = { invited: true; email: string }
export type AcceptInvitationResult = { companyId: string; role: CompanyRole }
export type ChangeMemberRoleResult = { userId: string; role: CompanyRole }
export type RemoveMemberResult = { removed: true }

/* my-companies */

export const listMyCompaniesSchema = z.object({})
export type ListMyCompaniesInput = z.infer<typeof listMyCompaniesSchema>

export type MyCompany = {
  companyId: string
  displayName: string
  slug: string
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'
  role: string
}

/* company profile */

const phoneish = z
  .string()
  .trim()
  .max(24)
  .regex(/^[0-9+()\s-]*$/, 'digits and separators only')

export const updateCompanyProfileSchema = z.object({
  companyId: z.string().min(1),
  displayName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().min(3).max(200).optional(),
  taxNumber: z
    .string()
    .trim()
    .regex(/^\d{10,11}$/, 'ten or eleven digits')
    .optional(),
  about: z.string().trim().max(4000).optional(),
  foundedYear: z.number().int().min(1900).max(2100).optional(),
  employeeRange: z.string().trim().max(40).optional(),
  /** `Company.slug` is deliberately absent — see `updateCompanySlug`. */
})
export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>

export const updateCompanyContactSchema = z.object({
  companyId: z.string().min(1),
  phone: phoneish.optional(),
  email: z.email().optional(),
  website: z.url().optional(),
  addressLine: z.string().trim().max(300).optional(),
  cityId: z.string().min(1).optional(),
  districtId: z.string().min(1).optional(),
  /** Coordinates, when the manufacturer knows them. `ADR-019`: the precision escape hatch. */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})
export type UpdateCompanyContactInput = z.infer<typeof updateCompanyContactSchema>

export const updateCompanySlugSchema = z.object({
  companyId: z.string().min(1),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase, digits and single hyphens only')
    .min(2)
    .max(60),
})
export type UpdateCompanySlugInput = z.infer<typeof updateCompanySlugSchema>

export const getCompanyProfileSchema = z.object({ companyId: z.string().min(1) })
export type GetCompanyProfileInput = z.infer<typeof getCompanyProfileSchema>

export const attachDocumentSchema = z.object({
  companyId: z.string().min(1),
  fileId: z.string().min(1),
  type: z.string().trim().min(2).max(60),
})
export type AttachDocumentInput = z.infer<typeof attachDocumentSchema>

export type CompanyProfileView = {
  companyId: string
  slug: string
  slugLocked: boolean
  displayName: string
  legalName: string
  taxNumber: string | null
  about: string | null
  foundedYear: number | null
  employeeRange: string | null
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'
  contact: {
    phone: string | null
    email: string | null
    website: string | null
    addressLine: string | null
    cityId: string | null
    districtId: string | null
    latitude: number | null
    longitude: number | null
  } | null
  documents: {
    id: string
    type: string
    status: string
    note: string | null
    fileId: string
    createdAt: Date
  }[]
}

/* verification */

export const listVerificationQueueSchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional(),
})
export type ListVerificationQueueInput = z.infer<typeof listVerificationQueueSchema>

export const getCompanyForVerificationSchema = z.object({ companyId: z.string().min(1) })
export type GetCompanyForVerificationInput = z.infer<typeof getCompanyForVerificationSchema>

/** A reason is mandatory on everything except approval. */
const reasonSchema = z.string().trim().min(10).max(1000)

export const verifyCompanySchema = z.object({
  companyId: z.string().min(1),
  note: z.string().trim().max(1000).optional(),
})
export type VerifyCompanyInput = z.infer<typeof verifyCompanySchema>

export const rejectCompanySchema = z.object({
  companyId: z.string().min(1),
  reason: reasonSchema,
})
export type RejectCompanyInput = z.infer<typeof rejectCompanySchema>

export const requestDocumentsSchema = z.object({
  companyId: z.string().min(1),
  reason: reasonSchema,
})
export type RequestDocumentsInput = z.infer<typeof requestDocumentsSchema>

export const suspendCompanySchema = z.object({
  companyId: z.string().min(1),
  reason: reasonSchema,
})
export type SuspendCompanyInput = z.infer<typeof suspendCompanySchema>

export const reviewDocumentSchema = z.object({
  documentId: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
})
export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>

export type QueueEntry = {
  companyId: string
  slug: string
  displayName: string
  legalName: string
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'
  taxNumber: string | null
  createdAt: Date
  documentCount: number
  pendingDocumentCount: number
  rejectionReason: string | null
}

export type CompanyDetail = QueueEntry & {
  about: string | null
  foundedYear: number | null
  verifiedAt: Date | null
  members: { userId: string; email: string; fullName: string | null; role: string }[]
  documents: {
    id: string
    type: string
    status: string
    note: string | null
    reviewedBy: string | null
    reviewedAt: Date | null
    fileKey: string
    createdAt: Date
  }[]
  /** `17` §Manufacturer verification: the submission history is part of the decision. */
  history: {
    action: string
    reason: string | null
    actorUserId: string | null
    createdAt: Date
  }[]
}
