import type { ZodIssue } from 'zod'

/**
 * `05-system-architecture.md` §Errors, verbatim. Services return a `Result` and **do not
 * throw for expected failures** — a thrown exception is a bug, and it reaches the error
 * boundary and the logger rather than the user.
 */
export type DomainError =
  | { kind: 'NOT_FOUND'; entity: string }
  | { kind: 'FORBIDDEN'; permission: string }
  | { kind: 'VALIDATION'; issues: ZodIssue[] }
  | { kind: 'CONFLICT'; reason: string }
  | { kind: 'PRECONDITION'; reason: string }
  | { kind: 'RATE_LIMITED'; retryAfter: number }
  | { kind: 'DEPENDENCY'; service: string }

export type DomainErrorKind = DomainError['kind']

export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/** Narrowing helpers, so call sites read as prose rather than as property access. */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}

/** Transform the success value, leaving an error untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

/** Chain another fallible step. The first error short-circuits. */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

/** Unwrap with a fallback. There is deliberately no `unwrap()` that throws. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

// ── Constructors, one per kind ───────────────────────────────────────────────
// Named constructors instead of object literals at call sites: a typo in `kind` would
// otherwise be a valid object that never matches the adapter's switch.

export const notFound = (entity: string): DomainError => ({ kind: 'NOT_FOUND', entity })
export const forbidden = (permission: string): DomainError => ({ kind: 'FORBIDDEN', permission })
export const validation = (issues: ZodIssue[]): DomainError => ({ kind: 'VALIDATION', issues })
export const conflict = (reason: string): DomainError => ({ kind: 'CONFLICT', reason })
export const precondition = (reason: string): DomainError => ({ kind: 'PRECONDITION', reason })
export const rateLimited = (retryAfter: number): DomainError => ({
  kind: 'RATE_LIMITED',
  retryAfter,
})
export const dependency = (service: string): DomainError => ({ kind: 'DEPENDENCY', service })

/**
 * The transport mapping from `05` §Errors. Adapters — route handlers and server actions —
 * are the only callers; nothing in `domain/` or `application/` knows about HTTP.
 */
export const HTTP_STATUS: Record<DomainErrorKind, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION: 422,
  CONFLICT: 409,
  PRECONDITION: 409,
  RATE_LIMITED: 429,
  DEPENDENCY: 503,
}

export function httpStatusFor(error: DomainError): number {
  return HTTP_STATUS[error.kind]
}
