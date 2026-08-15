import { randomUUID } from 'node:crypto'

import { httpStatusFor, type DomainError, type Result } from '@/shared/result'

/**
 * The `Result` → transport mapping, in one place for both entry points
 * (`05-system-architecture.md` §Two entry points, §Errors; `06-api-specification.md`
 * §Envelope).
 *
 * A route handler and a server action are both adapters over the same service. If each
 * mapped errors itself they would drift, and the mobile client would meet a different API
 * from the one the web app exercises — which is the failure `05` is written to prevent.
 */

export type SuccessEnvelope<T> = { data: T; meta: { requestId: string } }

export type ErrorEnvelope = {
  error: {
    code: DomainError['kind']
    message: string
    details: unknown[]
    requestId: string
  }
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope

/** Human-readable, never parsed by a client — `06` says clients switch on `code`. */
export function messageFor(error: DomainError): string {
  switch (error.kind) {
    case 'NOT_FOUND':
      return `${error.entity} not found`
    case 'FORBIDDEN':
      return `Not permitted: ${error.permission}`
    case 'VALIDATION':
      return 'The request could not be validated'
    case 'CONFLICT':
      return error.reason
    case 'PRECONDITION':
      return error.reason
    case 'RATE_LIMITED':
      return `Too many requests; retry in ${error.retryAfter}s`
    case 'DEPENDENCY':
      return `${error.service} is unavailable`
  }
}

function detailsFor(error: DomainError): unknown[] {
  return error.kind === 'VALIDATION' ? error.issues : []
}

export function successEnvelope<T>(data: T, requestId: string = randomUUID()): SuccessEnvelope<T> {
  return { data, meta: { requestId } }
}

export function errorEnvelope(error: DomainError, requestId: string = randomUUID()): ErrorEnvelope {
  return {
    error: {
      code: error.kind,
      message: messageFor(error),
      details: detailsFor(error),
      requestId,
    },
  }
}

export function envelopeFor<T>(
  result: Result<T, DomainError>,
  requestId: string = randomUUID(),
): Envelope<T> {
  return result.ok
    ? successEnvelope(result.value, requestId)
    : errorEnvelope(result.error, requestId)
}

/**
 * Turn a service result into an HTTP response. Used by every `/api/v1` route handler.
 *
 * `RATE_LIMITED` carries `Retry-After`, which `06` §Rate limits requires and which a client
 * cannot infer from the body.
 */
export function respond<T>(
  result: Result<T, DomainError>,
  requestId: string = randomUUID(),
): Response {
  const body = envelopeFor(result, requestId)
  const status = result.ok ? 200 : httpStatusFor(result.error)

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-request-id': requestId,
  }

  if (!result.ok && result.error.kind === 'RATE_LIMITED') {
    headers['retry-after'] = String(result.error.retryAfter)
  }

  return new Response(JSON.stringify(body), { status, headers })
}

/**
 * The server-action form of the same mapping.
 *
 * An action cannot set a status code — it returns a value to a React form — so the status
 * travels in the payload. The **code and the message are identical to the route handler's**,
 * which is what lets a UI built against one behave the same against the other.
 */
export type ActionResult<T> = { status: number } & Envelope<T>

export function actionResult<T>(
  result: Result<T, DomainError>,
  requestId: string = randomUUID(),
): ActionResult<T> {
  return {
    status: result.ok ? 200 : httpStatusFor(result.error),
    ...envelopeFor(result, requestId),
  }
}
