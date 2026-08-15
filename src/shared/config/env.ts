import { z } from 'zod'

/**
 * Typed environment. The variable list is `23-deployment-and-environments.md`
 * §Configuration, verbatim.
 *
 * Two rules this file exists to enforce:
 *
 *  1. A missing or malformed variable **fails startup**. `parseServerEnv` runs when this
 *     module is loaded, and `next.config.ts` imports it, so `next dev`, `next build` and
 *     `next start` all throw before doing any work. There is no silent default and no
 *     escape hatch.
 *  2. No secret is reachable through a `NEXT_PUBLIC_*` variable. That is enforced by the
 *     type system below, not by review: `defineServerVars` types any `NEXT_PUBLIC_`-prefixed
 *     key as `never`, so a schema cannot be assigned to one and `pnpm typecheck` fails.
 *     Client-visible variables live in `env.client.ts` and are declared with
 *     `defineClientVars`, which rejects any key that is *not* `NEXT_PUBLIC_`-prefixed.
 *
 * This module is server-only. Client code imports `env.client.ts`.
 */

type PublicKey = `NEXT_PUBLIC_${string}`

/** Every `NEXT_PUBLIC_`-prefixed key is typed `never`, so nothing can satisfy it. */
type ServerOnlyShape<T> = {
  [K in keyof T]: K extends PublicKey ? never : z.ZodType
}

function defineServerVars<T extends Record<string, z.ZodType>>(shape: T & ServerOnlyShape<T>): T {
  return shape
}

/** The mirror image: every key that is *not* `NEXT_PUBLIC_`-prefixed is typed `never`. */
type ClientOnlyShape<T> = {
  [K in keyof T]: K extends PublicKey ? z.ZodType : never
}

/** Every key must be `NEXT_PUBLIC_`-prefixed; anything else fails to compile. */
export function defineClientVars<T extends Record<string, z.ZodType>>(
  shape: T & ClientOnlyShape<T>,
): T {
  return shape
}

const APP_ENVS = ['local', 'preview', 'staging', 'production'] as const
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// connection string')

export const serverVars = defineServerVars({
  // Database
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,

  // Auth — see 12-authentication-authorization.md
  AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  AUTH_URL: z.url(),

  // Object storage — 14-file-storage-and-media.md
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, 'must be a DNS-safe bucket name'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  CDN_BASE_URL: z.url(),

  // Mail — 13-notifications.md. `log` is the development adapter.
  MAIL_PROVIDER: z.enum(['log', 'resend', 'smtp']),
  MAIL_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().includes('@', { message: 'must contain an address' }),

  // SMS — provider is Q3 in 25-progress.md. `log` is the development adapter;
  // any other value is a real provider and requires credentials (see refinement below).
  SMS_PROVIDER: z.string().min(1),
  SMS_API_KEY: z.string().min(1).optional(),
  SMS_SENDER: z.string().min(1).max(11, 'alphanumeric sender IDs are at most 11 characters'),

  // Geocoding — Q4. Required once radius service areas are live (Phase 3).
  GEOCODER_API_KEY: z.string().min(1).optional(),

  // Observability
  SENTRY_DSN: z.url().optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS),
  APP_ENV: z.enum(APP_ENVS),
})

const serverSchema = z.object(serverVars).superRefine((value, ctx) => {
  const deployed = value.APP_ENV === 'staging' || value.APP_ENV === 'production'

  // A real provider needs credentials. Only the `log` adapter may go without.
  if (value.MAIL_PROVIDER !== 'log' && !value.MAIL_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['MAIL_API_KEY'],
      message: `required when MAIL_PROVIDER is "${value.MAIL_PROVIDER}"`,
    })
  }
  if (value.SMS_PROVIDER !== 'log' && !value.SMS_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['SMS_API_KEY'],
      message: `required when SMS_PROVIDER is "${value.SMS_PROVIDER}"`,
    })
  }

  // The log-only adapters are a development convenience, never a production one.
  // Staging may still run them: Q3 (SMS sender ID) is open, and 25-progress.md makes the
  // log adapter the documented development default until it closes.
  if (value.APP_ENV === 'production' && value.MAIL_PROVIDER === 'log') {
    ctx.addIssue({
      code: 'custom',
      path: ['MAIL_PROVIDER'],
      message: 'the "log" mail adapter cannot be used when APP_ENV is "production"',
    })
  }
  if (value.APP_ENV === 'production' && value.SMS_PROVIDER === 'log') {
    ctx.addIssue({
      code: 'custom',
      path: ['SMS_PROVIDER'],
      message: 'the "log" SMS adapter cannot be used when APP_ENV is "production"',
    })
  }
  if (deployed && !value.SENTRY_DSN) {
    ctx.addIssue({
      code: 'custom',
      path: ['SENTRY_DSN'],
      message: `required when APP_ENV is "${value.APP_ENV}"`,
    })
  }
})

export type ServerEnv = z.infer<typeof serverSchema>

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError'
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(
      [
        'Invalid environment configuration. The application cannot start.',
        ...issues.map((issue) => `  · ${issue}`),
        '',
        'Copy .env.example to .env and fill in every required value.',
      ].join('\n'),
    )
    this.issues = issues
  }
}

/**
 * Pure parse over an explicit source, so the startup path and the test exercise the
 * same function. Throws `EnvValidationError` — it never returns a partial object.
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
    throw new EnvValidationError(issues)
  }

  return result.data
}

if (typeof window !== 'undefined') {
  throw new Error(
    'src/shared/config/env.ts is server-only. Import env.client.ts from client components.',
  )
}

/** Parsed at module load: importing this module is what makes startup fail. */
export const env: ServerEnv = parseServerEnv(process.env)
