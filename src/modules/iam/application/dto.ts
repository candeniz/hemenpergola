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
