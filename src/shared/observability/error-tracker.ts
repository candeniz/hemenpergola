import 'server-only'

/**
 * The error-tracking port — task 9.5. The PORT ships now; the ADAPTER deliberately does
 * not: `19` §Data location requires any third-party processor to be named in the privacy
 * notice with a processor agreement BEFORE it is wired in, and both hang off the Q2 legal
 * chain. Choosing Sentry-or-whoever here would wire a processor nobody has contracted.
 *
 * So: one seam, a log adapter behind it, and a ring buffer `/api/health`-style surfaces
 * can read. The day Q2 clears, the real adapter is one file and zero call-site changes —
 * the same shape as `Mailer`/`SmsSender`, proven twice already.
 *
 * Alerting has the same gap on purpose: an alert with no on-call rota is a log line with
 * anxiety. WHERE alerts go (the channel, the rota) is a launch-checklist blank a human
 * fills; `captureError` is the single point the wiring will hang from.
 */

export type CapturedError = {
  at: Date
  scope: string
  message: string
}

export type ErrorTracker = {
  readonly name: string
  capture(scope: string, error: unknown): void
}

const BUFFER_LIMIT = 100

const globalForErrors = globalThis as unknown as { capturedErrors?: CapturedError[] }

function buffer(): CapturedError[] {
  globalForErrors.capturedErrors ??= []
  return globalForErrors.capturedErrors
}

export const logErrorTracker: ErrorTracker = {
  name: 'log',
  capture(scope, error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[error-tracker] ${scope}:`, error)
    const log = buffer()
    log.push({ at: new Date(), scope, message })
    if (log.length > BUFFER_LIMIT) log.splice(0, log.length - BUFFER_LIMIT)
  },
}

let tracker: ErrorTracker = logErrorTracker

export function getErrorTracker(): ErrorTracker {
  return tracker
}

/** Tests, and the day a contracted provider's adapter exists. */
export function setErrorTracker(next: ErrorTracker): void {
  tracker = next
}

export function captureError(scope: string, error: unknown): void {
  getErrorTracker().capture(scope, error)
}

export function recentCapturedErrors(): readonly CapturedError[] {
  return buffer()
}
