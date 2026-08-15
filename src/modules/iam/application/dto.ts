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
