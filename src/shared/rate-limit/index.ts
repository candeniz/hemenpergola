import 'server-only'

import { prisma } from '@/shared/db'

/**
 * Rate limiting — `06-api-specification.md` §Rate limits.
 *
 * The limits are the table in `06`, transcribed once. Exceeding one is `RATE_LIMITED`, which
 * `respond()` already turns into a 429 with `Retry-After`.
 *
 * **Fixed windows, in Postgres.** Two decisions worth stating:
 *
 *   *In Postgres* because `23-deployment-and-environments.md` §Runtime runs the web tier as
 *   N stateless instances. A per-process counter gives an attacker N times the limit and
 *   forgets everything on deploy — which is not a weaker limit, it is a limit that looks
 *   present and is not. `05` §Jobs rules out Redis for V1, so the database that is already
 *   there is the shared store.
 *
 *   *Fixed windows*, not a sliding log, because a fixed window is one upsert with no read
 *   first. The known cost is the boundary: a caller can spend the budget at the end of one
 *   window and again at the start of the next, so a 10/15min limit permits 20 in a bad
 *   two-minute stretch. For login that is fine — the per-account progressive delay in
 *   `12` §Abuse controls is what actually makes guessing expensive, and this limit exists to
 *   stop the volume, not to be the only defence.
 */

export type RateLimitRule = {
  /** How many requests are allowed in one window. */
  limit: number
  windowSeconds: number
}

/** `06` §Rate limits, verbatim. Phase 1 owns `auth`; the rest arrive with their phases. */
export const RATE_LIMITS = {
  /** login, register, reset, verify — 10 / 15 min, per IP *and* per account. */
  auth: { limit: 10, windowSeconds: 15 * 60 },
  offerRequestCreate: { limit: 5, windowSeconds: 60 * 60 },
  priceEstimateUser: { limit: 30, windowSeconds: 60 * 60 },
  priceEstimateIp: { limit: 60, windowSeconds: 60 * 60 },
  messages: { limit: 60, windowSeconds: 60 * 60 },
  publicRead: { limit: 300, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitSurface = keyof typeof RATE_LIMITS

export type RateLimitVerdict =
  { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number }

function windowStart(windowSeconds: number, now: number): Date {
  return new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000)
}

/**
 * Count one request against a bucket and say whether it is allowed.
 *
 * `dimension` and `value` are what the bucket is keyed on — `('ip', '203.0.113.7')`,
 * `('account', 'a@b.com')`. Keying an account bucket on the address rather than the user id
 * is deliberate: a login attempt for an address with no account must be counted too, or the
 * limit is trivially avoided by guessing addresses instead of passwords.
 */
export async function consumeRateLimit(
  surface: RateLimitSurface,
  dimension: string,
  value: string,
  now: number = Date.now(),
): Promise<RateLimitVerdict> {
  const rule = RATE_LIMITS[surface]
  const start = windowStart(rule.windowSeconds, now)
  const bucket = `${surface}:${dimension}:${value}`

  // One statement: insert the window or increment it. No read first, so two concurrent
  // requests cannot both see 9 and both decide they are the tenth.
  const row = await prisma.rateLimitHit.upsert({
    where: { bucket_windowStart: { bucket, windowStart: start } },
    create: { bucket, windowStart: start, count: 1 },
    update: { count: { increment: 1 } },
  })

  if (row.count <= rule.limit) {
    return { allowed: true, remaining: rule.limit - row.count }
  }

  const elapsed = (now - start.getTime()) / 1000
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(rule.windowSeconds - elapsed)) }
}

/**
 * The auth surface, both dimensions at once (`06`: *"per IP + per account"*).
 *
 * Both counters are consumed even when the first one already refuses, so a caller cannot
 * hide one dimension behind the other — spreading attempts across accounts still fills the
 * IP bucket, and coming from many IPs still fills the account bucket.
 */
export async function consumeAuthRateLimit(
  ip: string,
  account: string,
  now: number = Date.now(),
): Promise<RateLimitVerdict> {
  const [byIp, byAccount] = await Promise.all([
    // `resolveActor` records "unknown" rather than inventing an address. Counting that as
    // one shared bucket is wrong — it would let one caller lock out everyone whose proxy
    // headers are missing — so it is skipped and the account dimension carries the limit.
    ip === 'unknown'
      ? Promise.resolve<RateLimitVerdict>({ allowed: true, remaining: RATE_LIMITS.auth.limit })
      : consumeRateLimit('auth', 'ip', ip, now),
    consumeRateLimit('auth', 'account', account.toLowerCase(), now),
  ])

  if (!byIp.allowed) return byIp
  if (!byAccount.allowed) return byAccount

  return { allowed: true, remaining: Math.min(byIp.remaining, byAccount.remaining) }
}

/** Drop windows nobody can be inside any more. Called by the daily cleanup job. */
export async function sweepRateLimits(now: number = Date.now()): Promise<number> {
  const longest = Math.max(...Object.values(RATE_LIMITS).map((rule) => rule.windowSeconds))
  const cutoff = new Date(now - longest * 2000)

  const { count } = await prisma.rateLimitHit.deleteMany({ where: { windowStart: { lt: cutoff } } })
  return count
}
