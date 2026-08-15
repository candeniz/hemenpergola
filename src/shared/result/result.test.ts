import { describe, expect, it } from 'vitest'
import type { ZodIssue } from 'zod'

import {
  andThen,
  conflict,
  dependency,
  err,
  forbidden,
  HTTP_STATUS,
  httpStatusFor,
  isErr,
  isOk,
  map,
  notFound,
  ok,
  precondition,
  rateLimited,
  unwrapOr,
  validation,
  type DomainError,
  type DomainErrorKind,
} from './index'

describe('Result', () => {
  it('carries a value or an error, never both', () => {
    const good = ok(42)
    const bad = err(notFound('Project'))

    expect(isOk(good)).toBe(true)
    expect(isErr(good)).toBe(false)
    expect(isOk(bad)).toBe(false)
    expect(isErr(bad)).toBe(true)

    if (good.ok) expect(good.value).toBe(42)
    if (!bad.ok) expect(bad.error).toEqual({ kind: 'NOT_FOUND', entity: 'Project' })
  })

  it('maps the success value and leaves an error untouched', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6))

    const failure = err(conflict('illegal transition'))
    expect(map(failure, (n: number) => n * 3)).toBe(failure)
  })

  it('short-circuits a chain on the first error', () => {
    const double = (n: number) => ok(n * 2)
    const fail = () => err(precondition('company not verified'))

    expect(andThen(ok(2), double)).toEqual(ok(4))
    expect(andThen(andThen(ok(2), fail), double)).toEqual(err(precondition('company not verified')))
  })

  it('unwraps with a fallback — there is no throwing unwrap', () => {
    expect(unwrapOr(ok('value'), 'fallback')).toBe('value')
    expect(unwrapOr(err(notFound('Company')), 'fallback')).toBe('fallback')
  })
})

describe('DomainError', () => {
  const issue: ZodIssue = {
    code: 'custom',
    path: ['widthMm'],
    message: 'required',
  } as unknown as ZodIssue

  const oneOfEach: Record<DomainErrorKind, DomainError> = {
    NOT_FOUND: notFound('Project'),
    FORBIDDEN: forbidden('offer_request.respond'),
    VALIDATION: validation([issue]),
    CONFLICT: conflict('illegal state transition'),
    PRECONDITION: precondition('company not verified'),
    RATE_LIMITED: rateLimited(60),
    DEPENDENCY: dependency('storage'),
  }

  it('has exactly the seven kinds 05 §Errors defines — no more, no fewer', () => {
    expect(Object.keys(oneOfEach).sort()).toEqual([
      'CONFLICT',
      'DEPENDENCY',
      'FORBIDDEN',
      'NOT_FOUND',
      'PRECONDITION',
      'RATE_LIMITED',
      'VALIDATION',
    ])
    expect(Object.keys(HTTP_STATUS).sort()).toEqual(Object.keys(oneOfEach).sort())
  })

  it('maps every kind to the status 05 §Errors specifies', () => {
    expect(httpStatusFor(oneOfEach.NOT_FOUND)).toBe(404)
    expect(httpStatusFor(oneOfEach.FORBIDDEN)).toBe(403)
    expect(httpStatusFor(oneOfEach.VALIDATION)).toBe(422)
    expect(httpStatusFor(oneOfEach.CONFLICT)).toBe(409)
    expect(httpStatusFor(oneOfEach.PRECONDITION)).toBe(409)
    expect(httpStatusFor(oneOfEach.RATE_LIMITED)).toBe(429)
    expect(httpStatusFor(oneOfEach.DEPENDENCY)).toBe(503)
  })

  it('keeps CONFLICT and PRECONDITION distinct even though both are 409', () => {
    // They map to the same status and mean different things: an illegal transition versus
    // an unmet precondition. Collapsing them would lose the reason in the payload.
    expect(httpStatusFor(oneOfEach.CONFLICT)).toBe(httpStatusFor(oneOfEach.PRECONDITION))
    expect(oneOfEach.CONFLICT.kind).not.toBe(oneOfEach.PRECONDITION.kind)
  })

  it('carries the payload each kind needs for its response', () => {
    expect(oneOfEach.NOT_FOUND).toHaveProperty('entity')
    expect(oneOfEach.FORBIDDEN).toHaveProperty('permission')
    expect(oneOfEach.VALIDATION).toHaveProperty('issues')
    expect(oneOfEach.RATE_LIMITED).toHaveProperty('retryAfter', 60)
    expect(oneOfEach.DEPENDENCY).toHaveProperty('service', 'storage')
  })
})
