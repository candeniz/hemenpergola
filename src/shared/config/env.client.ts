import { z } from 'zod'

import { defineClientVars } from './env'

/**
 * Client-visible configuration. Everything here ships in the browser bundle, so
 * **nothing secret may be added to this file** — `defineClientVars` rejects any key that
 * is not `NEXT_PUBLIC_`-prefixed, and `env.ts` rejects any server key that is.
 *
 * Each variable is read as an explicit `process.env.NEXT_PUBLIC_*` member expression
 * because that is the only form Next statically replaces at build time. Passing
 * `process.env` around would leave these `undefined` in the browser.
 */

export const clientVars = defineClientVars({
  NEXT_PUBLIC_SITE_URL: z.url(),
})

const clientSchema = z.object(clientVars)

export type ClientEnv = z.infer<typeof clientSchema>

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const result = clientSchema.safeParse(source)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n  · ')
    throw new Error(`Invalid public environment configuration:\n  · ${issues}`)
  }

  return result.data
}

export const clientEnv: ClientEnv = parseClientEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
})
