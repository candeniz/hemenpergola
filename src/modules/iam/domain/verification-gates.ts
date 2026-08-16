/**
 * Verification gates — `12-authentication-authorization.md` §Verification gates.
 *
 * A table, not a scattering of `if (user.emailVerifiedAt === null)` across ten services. The
 * point of writing it as data in Phase 1 is that the *rule* is a Phase 1 decision while most
 * of the *actions* belong to later phases: the project wizard is Phase 4, offers are Phase 5,
 * disclosure is Phase 6. Encoding it here means each of those arrives already gated, instead
 * of each one remembering.
 *
 * **The rows come from `12`'s table verbatim**, including the ones that are looser than they
 * first look. Requesting offers requires a verified *email*, not a phone; contact disclosure
 * is where the phone gate lands. Reading those two rows as "both, obviously" is the mistake
 * this comment exists to prevent — and it is not a hole, because disclosure is only ever
 * reached through a request that already required the email.
 *
 * Rows `12` does not cover are marked below. They are judgement, not transcription, and each
 * says on what grounds.
 */

export type VerificationRequirement = 'none' | 'email' | 'phone' | 'email+phone'

export type GatedAction =
  /* Phase 1 */
  | 'account:sign-in'
  | 'company:create'
  | 'company:invite-member'
  /* Phase 4 — the wizard is later, but its gate is decided here */
  | 'project:configure'
  | 'project:save-draft'
  | 'project:submit'
  /* Phase 5 */
  | 'offer-request:send'
  | 'offer:respond'
  /* Phase 6 */
  | 'message:send'
  | 'contact:disclose'
  | 'review:write'

export const VERIFICATION_GATES: Record<GatedAction, VerificationRequirement> = {
  /*
   * `12`'s table, row by row.
   */

  // "browse, configure a draft | nothing". Demanding a phone number before somebody can
  // look at a pergola is how you lose the visitor, and it costs the platform nothing.
  'project:configure': 'none',

  // "save a project to an account | email verified"
  'project:save-draft': 'email',

  // "request offers | email verified" — email, *not* phone. `10-matching.md` treats a
  // submitted project as a lead, and the lead has to be reachable; the address is what
  // makes it reachable at this point in the flow.
  'project:submit': 'email',
  'offer-request:send': 'email',

  // "have contact disclosed to a manufacturer | phone verified". `03` §F2 calls this the
  // only real defence manufacturers have against junk leads — a hard gate, not a nudge.
  // Email is already verified by the time anyone arrives here, because requesting offers
  // required it.
  'contact:disclose': 'phone',

  /*
   * Not in `12`'s table. Judgement, with the grounds stated.
   */

  // Signing in is deliberately ungated. A user who never verified must still be able to get
  // in and ask for a new link; gating the door instead of the action is how accounts become
  // unrecoverable.
  'account:sign-in': 'none',

  // A company is a commercial identity and the platform has to be able to reach whoever
  // created it — `03` §F3 puts a phone call in the verification path itself.
  'company:create': 'email+phone',

  // Inviting a colleague sends mail on the company's behalf, from an account that must
  // itself be a real mailbox.
  'company:invite-member': 'email',

  // Both sides of a conversation are reachable, or neither should be talking.
  'offer:respond': 'email',
  'message:send': 'email',

  // `16-reviews.md`: a review is attributable and disputable, so the reviewer is somebody
  // the platform can reach on both channels.
  'review:write': 'email+phone',
}

export type VerificationState = {
  emailVerifiedAt: Date | null
  phoneVerifiedAt: Date | null
}

export type GateOutcome =
  | { allowed: true }
  | { allowed: false; missing: 'email' | 'phone'; requirement: VerificationRequirement }

/**
 * Does this user satisfy the gate on this action?
 *
 * Returns *which* channel is missing, because the screen has to say "verify your phone", not
 * "verification required" — and when both are missing it names email first, which is the one
 * the user can actually complete while Q3 leaves the SMS provider undecided.
 */
export function checkVerificationGate(action: GatedAction, state: VerificationState): GateOutcome {
  const requirement = VERIFICATION_GATES[action]

  const needsEmail = requirement === 'email' || requirement === 'email+phone'
  const needsPhone = requirement === 'phone' || requirement === 'email+phone'

  if (needsEmail && state.emailVerifiedAt === null) {
    return { allowed: false, missing: 'email', requirement }
  }
  if (needsPhone && state.phoneVerifiedAt === null) {
    return { allowed: false, missing: 'phone', requirement }
  }

  return { allowed: true }
}
