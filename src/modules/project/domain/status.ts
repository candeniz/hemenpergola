/**
 * Where a project's status is decided — the only place.
 *
 * ## Why this file exists
 *
 * `Project.status` was being written from two places with two different guards, and they
 * disagreed: the edit path refused `SUBMITTED` **and** `CLOSED`, the validation path skipped
 * only `SUBMITTED`. So validating a closed project resurrected it to `DRAFT` or `READY`.
 * The same drift also made `validate` return a status it had computed rather than the one it
 * had stored — a caller validating a `SUBMITTED` project was told `READY` while the database
 * said `SUBMITTED`, and Phase 6 reads that field.
 *
 * `CLAUDE.md` non-negotiable 4 bans exactly this scattering for `OfferRequest` — status
 * changes go through the state machine, never a direct write — and the reasoning transfers
 * unchanged. This is **not** the full machine `11-offer-request-lifecycle.md` specifies,
 * because no such machine is defined for `Project` in the documents; it is the smallest pure
 * thing that keeps one definition of "terminal" and one definition of each transition.
 *
 * A third write site should not have to remember the guard. It should have to call this.
 */

export type ProjectStatus = 'DRAFT' | 'READY' | 'SUBMITTED' | 'CLOSED'

/**
 * Statuses the configurator may no longer touch.
 *
 * `SUBMITTED` means a request is out and manufacturers are working on it — editing behind
 * their back is `11` §Lifecycle's problem, not the configurator's. `CLOSED` is the end of the
 * road. Both are terminal *for this module*; `11` may still move a `SUBMITTED` request on.
 */
const TERMINAL: readonly ProjectStatus[] = ['SUBMITTED', 'CLOSED']

export function isTerminal(status: ProjectStatus): boolean {
  return TERMINAL.includes(status)
}

/** May the configurator write to a project in this state at all? */
export function canEdit(status: ProjectStatus): boolean {
  return !isTerminal(status)
}

/**
 * The status after a step is saved.
 *
 * An edit always returns the project to `DRAFT`: it was `READY` against the *old* values, and
 * carrying that flag through a change is how a stale readiness reaches Phase 6's offer
 * request. Terminal states are returned unchanged — the caller is expected to have refused
 * the edit already, and this is the second line of defence rather than the first.
 */
export function statusAfterEdit(current: ProjectStatus): ProjectStatus {
  if (isTerminal(current)) return current
  return 'DRAFT'
}

/**
 * The status after a readiness check.
 *
 * Terminal states are **returned unchanged**, which is the fix for both bugs at once: a
 * `SUBMITTED` project stays `SUBMITTED` and reports `SUBMITTED`, and a `CLOSED` one is not
 * resurrected. Everything else follows the check.
 */
export function statusAfterValidation(current: ProjectStatus, ready: boolean): ProjectStatus {
  if (isTerminal(current)) return current
  return ready ? 'READY' : 'DRAFT'
}
