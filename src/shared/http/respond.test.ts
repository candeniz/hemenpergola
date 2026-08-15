import { describe, expect, it } from 'vitest'
import type { ZodIssue } from 'zod'

import {
  conflict,
  dependency,
  err,
  forbidden,
  notFound,
  ok,
  precondition,
  rateLimited,
  validation,
  type DomainError,
  type DomainErrorKind,
} from '@/shared/result'

import { actionResult, envelopeFor, respond } from './respond'

/**
 * `05-system-architecture.md` §Errors and `06-api-specification.md` §Envelope.
 *
 * The point of this file is that **both** adapters map identically. A route handler and a
 * server action are two front doors onto the same service; if their mappings drift, the
 * mobile client meets a different API from the one the web app exercises, which is the
 * failure `05` §Two entry points is written to prevent.
 */

const issue = { code: 'custom', path: ['widthMm'], message: 'required' } as unknown as ZodIssue

/** One of every kind, so the suite fails to compile if an eighth is added. */
const ONE_OF_EACH: Record<DomainErrorKind, DomainError> = {
  NOT_FOUND: notFound('Project'),
  FORBIDDEN: forbidden('company:offer.send'),
  VALIDATION: validation([issue]),
  CONFLICT: conflict('illegal state transition'),
  PRECONDITION: precondition('company not verified'),
  RATE_LIMITED: rateLimited(60),
  DEPENDENCY: dependency('storage'),
}

const EXPECTED_STATUS: Record<DomainErrorKind, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION: 422,
  CONFLICT: 409,
  PRECONDITION: 409,
  RATE_LIMITED: 429,
  DEPENDENCY: 503,
}

const kinds = Object.keys(ONE_OF_EACH) as DomainErrorKind[]

describe('route handler · Result → HTTP', () => {
  it.each(kinds)('%s maps to its documented status', async (kind) => {
    const response = respond(err(ONE_OF_EACH[kind]))

    expect(response.status).toBe(EXPECTED_STATUS[kind])

    const body = (await response.json()) as { error: { code: string; requestId: string } }
    // Clients switch on `code`, never on `message` (06 §Envelope).
    expect(body.error.code).toBe(kind)
    expect(body.error.requestId.length).toBeGreaterThan(0)
  })

  it('returns 200 and the success envelope', async () => {
    const response = respond(ok({ id: 'prj_1' }))

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { id: string }; meta: { requestId: string } }
    expect(body.data).toEqual({ id: 'prj_1' })
    expect(body.meta.requestId.length).toBeGreaterThan(0)
  })

  it('sets Retry-After on 429, which a client cannot infer from the body', () => {
    const response = respond(err(rateLimited(42)))

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
  })

  it('carries validation issues in details and nothing else does', async () => {
    const invalid = (await respond(err(validation([issue]))).json()) as {
      error: { details: unknown[] }
    }
    const forbiddenBody = (await respond(err(forbidden('x'))).json()) as {
      error: { details: unknown[] }
    }

    expect(invalid.error.details).toHaveLength(1)
    expect(forbiddenBody.error.details).toEqual([])
  })
})

describe('server action · Result → status', () => {
  it.each(kinds)('%s maps to the same status as the route handler', (kind) => {
    const result = actionResult(err(ONE_OF_EACH[kind]))
    expect(result.status).toBe(EXPECTED_STATUS[kind])
  })

  it('returns 200 and the same success envelope', () => {
    const result = actionResult(ok({ id: 'prj_1' }))

    expect(result.status).toBe(200)
    expect('data' in result && result.data).toEqual({ id: 'prj_1' })
  })
})

describe('the two surfaces agree', () => {
  it.each(kinds)('%s produces an identical envelope on both', async (kind) => {
    const requestId = 'fixed-request-id'
    const error = err(ONE_OF_EACH[kind])

    const fromRoute = (await respond(error, requestId).json()) as unknown
    const { status, ...fromAction } = actionResult(error, requestId)

    // Same code, same message, same details, same requestId — the only difference between
    // the surfaces is where the status lives, because an action cannot set a header.
    expect(fromAction).toEqual(fromRoute)
    expect(status).toBe(EXPECTED_STATUS[kind])
  })

  it('produces an identical success envelope on both', async () => {
    const requestId = 'fixed-request-id'
    const value = ok({ token: 'abc', expiresIn: 900 })

    const fromRoute = (await respond(value, requestId).json()) as unknown
    const { status, ...fromAction } = actionResult(value, requestId)

    expect(fromAction).toEqual(fromRoute)
    expect(status).toBe(200)
    expect(fromAction).toEqual(envelopeFor(value, requestId))
  })
})
