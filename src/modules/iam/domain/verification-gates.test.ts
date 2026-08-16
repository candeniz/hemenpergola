import { describe, expect, it } from 'vitest'

import { checkVerificationGate, VERIFICATION_GATES, type GatedAction } from './verification-gates'

/**
 * `12-authentication-authorization.md` §Verification gates — task 1.5.
 *
 * The table is written in Phase 1 while most of the actions it governs belong to Phases 4
 * to 6. That is the point: the rule is decided once, and each of those phases arrives
 * already gated instead of each one remembering. These tests pin the decisions so a later
 * phase cannot quietly relax one on its way past — or, as the first version of this file
 * did, quietly *tighten* one past what `12` actually says.
 */

const verified = { emailVerifiedAt: new Date(), phoneVerifiedAt: new Date() }
const emailOnly = { emailVerifiedAt: new Date(), phoneVerifiedAt: null }
const phoneOnly = { emailVerifiedAt: null, phoneVerifiedAt: new Date() }
const nothing = { emailVerifiedAt: null, phoneVerifiedAt: null }

describe('the rows `12` states, verbatim', () => {
  it.each([
    ['project:configure', 'none'],
    ['project:save-draft', 'email'],
    ['project:submit', 'email'],
    ['offer-request:send', 'email'],
    ['contact:disclose', 'phone'],
  ] as const satisfies readonly (readonly [GatedAction, string])[])(
    '%s requires %s',
    (action, requirement) => {
      expect(VERIFICATION_GATES[action]).toBe(requirement)
    },
  )

  it('lets an email-verified user request offers without a phone', () => {
    // `12`: "request offers | email verified". Reading it as "both, obviously" is the
    // tempting mistake — and it would block every customer while Q3 leaves the SMS provider
    // undecided, which is a missing decision turned into an outage.
    expect(checkVerificationGate('offer-request:send', emailOnly).allowed).toBe(true)
    expect(checkVerificationGate('project:submit', emailOnly).allowed).toBe(true)
  })

  it('still refuses an unverified one', () => {
    expect(checkVerificationGate('offer-request:send', nothing).allowed).toBe(false)
    expect(checkVerificationGate('project:save-draft', nothing).allowed).toBe(false)
  })

  it('gates contact disclosure on the phone', () => {
    // `03` §F2: the only real defence manufacturers have against junk leads. A hard gate.
    expect(checkVerificationGate('contact:disclose', emailOnly).allowed).toBe(false)
    expect(checkVerificationGate('contact:disclose', phoneOnly).allowed).toBe(true)
    expect(checkVerificationGate('contact:disclose', verified).allowed).toBe(true)
  })

  it('leaves browsing and configuring ungated', () => {
    expect(checkVerificationGate('project:configure', nothing).allowed).toBe(true)
  })
})

describe('the rows that are judgement, not transcription', () => {
  it('does not gate signing in', () => {
    // Gating the door rather than the action is how accounts become unrecoverable: a user
    // who never verified must still get in and ask for a new link.
    expect(VERIFICATION_GATES['account:sign-in']).toBe('none')
    expect(checkVerificationGate('account:sign-in', nothing).allowed).toBe(true)
  })

  it('requires both channels to register a company', () => {
    expect(VERIFICATION_GATES['company:create']).toBe('email+phone')
    expect(checkVerificationGate('company:create', emailOnly).allowed).toBe(false)
    expect(checkVerificationGate('company:create', verified).allowed).toBe(true)
  })

  it('requires both to write a review', () => {
    expect(VERIFICATION_GATES['review:write']).toBe('email+phone')
  })
})

describe('what the failure says', () => {
  it('names email first when both are missing', () => {
    /*
     * Not cosmetic. Q3 is open — there is no SMS provider — so a user told "verify your
     * phone" first would be sent to a step that cannot complete. Email can.
     */
    const outcome = checkVerificationGate('company:create', nothing)

    expect(outcome.allowed).toBe(false)
    if (outcome.allowed) return
    expect(outcome.missing).toBe('email')
  })

  it('names the phone once the email is done', () => {
    const outcome = checkVerificationGate('company:create', emailOnly)

    expect(outcome.allowed).toBe(false)
    if (outcome.allowed) return
    expect(outcome.missing).toBe('phone')
    expect(outcome.requirement).toBe('email+phone')
  })
})

describe('the table itself', () => {
  it('covers every action in the union, with no duplicates', () => {
    // `Record<GatedAction, …>` already makes a missing key a type error. This catches the
    // other direction: a key nobody removed when the action disappeared.
    const actions = Object.keys(VERIFICATION_GATES)
    expect(actions.length).toBe(11)
    expect(new Set(actions).size).toBe(actions.length)
  })

  it('lets a fully verified user through everything', () => {
    for (const action of Object.keys(VERIFICATION_GATES) as GatedAction[]) {
      expect(checkVerificationGate(action, verified).allowed, action).toBe(true)
    }
  })
})
