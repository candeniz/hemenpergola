/**
 * Anonymous drafts — `10-project-configurator.md` §Anonymous drafts, task 4.5.
 *
 * A visitor configures without an account. The draft is owned by an **opaque key held in an
 * httpOnly cookie**, and `04` §Project enforces `exactly one of customerId / anonymousKey`
 * with a CHECK constraint. This file is the pure half: the key's shape, the two numbers the
 * rules are made of, and the retention cut-off. Nothing here touches a cookie, a request or
 * the database, so all of it is unit-testable and none of it can drift between the service
 * and the transport that feeds it.
 *
 * ## Why this lives in `shared/context` and not in `modules/project`
 *
 * Because it is an **identity**, and `05-system-architecture.md` §ActorContext puts identity
 * resolution in one place for every surface. `resolveActor` is what turns a request into an
 * actor; it already reads the session cookie there, and an anonymous key read anywhere else
 * would be a second identity resolver — the shape `ADR-022` was written to stop repeating.
 *
 * Projects are the only rows that use it today. That is a fact about Phase 4, not about the
 * concept: the moment a second surface accepts anonymous ownership it will need the same key
 * from the same cookie, and moving it then means moving it out of a module that had claimed
 * it.
 *
 * ## Why the key is opaque and long
 *
 * It is a bearer credential. Anyone holding it owns the drafts it points at, exactly as a
 * session token does, which is why it is 32 random bytes rather than a cuid or a counter —
 * a guessable key is an enumeration of other people's project data. It carries no meaning,
 * so nothing can be forged into it, and revoking it is deleting the cookie.
 *
 * It is deliberately **not** a session id. A session identifies a person; this identifies a
 * shopping basket that has not been claimed by anyone yet, and the two have different
 * lifetimes, different deletion rules and different retention obligations
 * (`19-security-and-kvkk.md` §Retention gives anonymous drafts thirty days; a session gets
 * thirty days from *its* own last use).
 */

/**
 * Thirty days — `10` §Anonymous drafts for the cookie, `19` §Retention for the rows. Both
 * numbers are the same number and they are this constant, so a change cannot move one and
 * leave the other. A cookie outliving the rows would offer a customer a draft that had been
 * swept; rows outliving the cookie would leave data nobody can ever reach again.
 */
export const ANONYMOUS_DRAFT_TTL_DAYS = 30

/**
 * At most three drafts per key — `10` §Anonymous drafts, quoted: *"a key claims at most 3
 * drafts"*.
 *
 * Counted by **rows**, not by anything the browser sends, which is the only counting that
 * means something: the cookie is attacker-controlled and a client-side counter is a
 * suggestion. `04`'s XOR constraint is what makes the count well-defined in the first place
 * — a project has exactly one owner, so "drafts held by this key" is a `WHERE` clause and
 * not a judgement call.
 *
 * Three rather than one because comparing two sizes of the same pergola is the behaviour
 * `10` §Reuse exists to serve, and three rather than unlimited because an unauthenticated
 * write endpoint with no ceiling is a storage bill somebody else decides.
 */
export const MAX_ANONYMOUS_DRAFTS_PER_KEY = 3

/** Bytes of entropy behind a key. 32, the same as a session token — it is the same kind of secret. */
const KEY_BYTES = 32

/**
 * The cookie's name.
 *
 * No `__Host-` variant pair here, unlike the session cookie: this value is *not* a
 * credential for an account, and the pair exists there only because `__Host-` requires
 * `Secure`, which local HTTP cannot set. The same problem applies, so the same solution
 * does — `sessionCookieName`'s shape, kept beside the thing it names.
 */
export const ANONYMOUS_COOKIE = '__Host-pergola.anon'
export const ANONYMOUS_COOKIE_DEV = 'pergola.anon'

export function anonymousCookieName(secure: boolean): string {
  return secure ? ANONYMOUS_COOKIE : ANONYMOUS_COOKIE_DEV
}

/**
 * Base64url of 32 random bytes: 43 characters, no padding, URL-safe and cookie-safe.
 *
 * `randomBytes` is imported lazily so this module stays importable from a test and from the
 * client bundle's type graph without dragging `node:crypto` in.
 */
export async function newAnonymousKey(): Promise<string> {
  const { randomBytes } = await import('node:crypto')
  return randomBytes(KEY_BYTES).toString('base64url')
}

/**
 * Is this a key we could have issued?
 *
 * Checked before the value reaches a `where` clause. Not a security control — the database
 * would simply not match a forged value — but a shape check keeps a 4 KB cookie out of a
 * query and makes the "no identity at all" case unambiguous for the caller.
 */
export function isAnonymousKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value)
}

/** The cookie's expiry, from a caller-supplied `now` so the value is testable. */
export function anonymousCookieExpiry(now: Date): Date {
  return new Date(now.getTime() + ANONYMOUS_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * The retention rule — `19-security-and-kvkk.md` §Retention, *"Anonymous project drafts: 30
 * days"*.
 *
 * **The rule is here; the sweep is not.** `19` §Retention is explicit that retention is
 * *"enforced by the `audit.retention_sweep` job, not by manual cleanup"*, and that job is
 * Phase 9's, with the rest of the retention set. Writing half a sweeper now — one table, no
 * schedule, no audit entry — would mean Phase 9 finds a second mechanism to reconcile with
 * its own, which is how two cleanup paths that disagree get shipped.
 *
 * What is written now is the part that would otherwise be re-derived from the prose: which
 * rows, measured from which column, against which cut-off. Phase 9 calls this and adds the
 * schedule. Recorded in `25-progress.md` §Open questions as Q25 so the deferral is in the
 * *table* and not only in a dated log entry — `CLAUDE.md` §Definition of done, and the
 * reason that rule exists is `ADR-022`/Q23.
 *
 * Measured from `updatedAt`, not `createdAt`: a visitor who came back on day 29 to change a
 * dimension has not abandoned anything, and deleting their draft the next morning because
 * the row is old is the wrong reading of "unclaimed for thirty days".
 */
export function anonymousDraftCutoff(now: Date): Date {
  return new Date(now.getTime() - ANONYMOUS_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * The `where` fragment Phase 9's sweep will use, as data rather than as prose.
 *
 * Only rows that are still anonymous: a claimed project belongs to an account and follows
 * the account's retention, not this one. `deletedAt: null` because a soft-deleted row is
 * already out of every read path and hard deletion is the sweep's own separate decision.
 */
export function expiredAnonymousDraftsWhere(now: Date): {
  anonymousKey: { not: null }
  customerId: null
  deletedAt: null
  updatedAt: { lt: Date }
} {
  return {
    anonymousKey: { not: null },
    customerId: null,
    deletedAt: null,
    updatedAt: { lt: anonymousDraftCutoff(now) },
  }
}
