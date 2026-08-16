/**
 * The catalogue authoring rules — `10-project-configurator.md` §Admin authoring,
 * `17-admin-system.md` §Catalogue.
 *
 * Pure, and separate from the service, because the interesting thing about these rules is
 * *when they were written*. There is not a single `Project` row in the database today, so
 * every one of them is currently unfalsifiable in production: an admin could delete any
 * option and nothing would break.
 *
 * They are enforced anyway. The alternative is discovering them in Phase 4, as data loss —
 * a `PriceCalculation.breakdown` from six months ago naming an option that no longer exists,
 * and no way to reconstruct what the customer was quoted.
 */

export type ReferenceCounts = {
  /** `ProjectAttributeValue` rows pointing at this option. Phase 4. */
  projectValues: number
  /** `PriceBookOptionPrice` rows pointing at this option. Phase 3. */
  priceBookEntries: number
}

export type DeletionVerdict =
  { allowed: true } | { allowed: false; reason: 'referenced'; counts: ReferenceCounts }

/**
 * May this option be deleted outright?
 *
 * Only if nothing has ever referenced it. *"Never delete a `ProductOption` that has been
 * referenced. Deactivate. History has to stay readable, including inside a
 * `PriceCalculation.breakdown` from six months ago."*
 *
 * Deactivation is always available and is what the admin screen offers by default; deletion
 * exists for the case an admin creates an option, mistypes it, and removes it before anyone
 * has seen it.
 */
export function canDeleteOption(counts: ReferenceCounts): DeletionVerdict {
  const referenced = counts.projectValues > 0 || counts.priceBookEntries > 0
  return referenced ? { allowed: false, reason: 'referenced', counts } : { allowed: true }
}

export type CategoryDeletionCounts = {
  children: number
  products: number
}

/**
 * `17` §Catalogue: *"a category with children or products cannot be deleted, only
 * deactivated"*. Same shape, different reason — deleting it would orphan a public URL that
 * is already indexed.
 */
export function canDeleteCategory(counts: CategoryDeletionCounts): boolean {
  return counts.children === 0 && counts.products === 0
}

export type AttributeChange = {
  isRequired: boolean
  wasRequired: boolean
  isNew: boolean
}

export type AttributeChangeImpact =
  | { kind: 'safe' }
  /** Applies to new projects only; existing `READY` projects stay valid. */
  | { kind: 'new-projects-only'; because: 'required-attribute-added' }

/**
 * What a change to an attribute does to projects that already exist.
 *
 * `10` §Admin authoring: adding an optional attribute is safe; adding a required one
 * *"applies to new projects only; existing `READY` projects stay valid"*.
 *
 * This returns the impact rather than refusing, because refusing would be wrong — the admin
 * is allowed to make the change. What they are not allowed to do is make it without being
 * told, so the screen shows this and the audit entry records it.
 */
export function attributeChangeImpact(change: AttributeChange): AttributeChangeImpact {
  const becomesRequired = change.isRequired && (change.isNew || !change.wasRequired)

  return becomesRequired
    ? { kind: 'new-projects-only', because: 'required-attribute-added' }
    : { kind: 'safe' }
}

/**
 * `showIfAttributeKey` must name a sibling that exists, and must not chain.
 *
 * `ADR-008` allows exactly one level. Two would be a dependency graph, a graph needs cycle
 * detection and evaluation order, and at that point the rules engine has been built by
 * accident — which is the failure mode the ADR names.
 */
export type ShowIfProblem =
  | { kind: 'unknown-key'; key: string }
  | { kind: 'self-reference'; key: string }
  | { kind: 'would-chain'; key: string; because: string }

export type SiblingAttribute = {
  key: string
  showIfAttributeKey: string | null
}

export function validateShowIf(
  attribute: { key: string; showIfAttributeKey: string | null },
  siblings: readonly SiblingAttribute[],
): ShowIfProblem[] {
  const target = attribute.showIfAttributeKey
  if (target === null || target === '') return []

  if (target === attribute.key) return [{ kind: 'self-reference', key: target }]

  const sibling = siblings.find((candidate) => candidate.key === target)
  if (sibling === undefined) return [{ kind: 'unknown-key', key: target }]

  // The target is itself conditional, so showing this field would depend on a chain.
  if (sibling.showIfAttributeKey !== null && sibling.showIfAttributeKey !== '') {
    return [
      {
        kind: 'would-chain',
        key: target,
        because: `${target} is itself conditional on ${sibling.showIfAttributeKey}`,
      },
    ]
  }

  /*
   * The other direction: nothing may already depend on *this* attribute, or making it
   * conditional creates the same chain from the far end. Authoring order should not decide
   * whether a rule is enforced.
   */
  const dependent = siblings.find((candidate) => candidate.showIfAttributeKey === attribute.key)
  if (dependent !== undefined) {
    return [
      {
        kind: 'would-chain',
        key: target,
        because: `${dependent.key} already depends on ${attribute.key}`,
      },
    ]
  }

  return []
}

/**
 * The answers so far, keyed by attribute **key** — the same key `showIfAttributeKey` names.
 *
 * A string, because that is what a form field yields and what `ProductOption.value` stores.
 * A boolean attribute answers `'true'` / `'false'`; a select answers its option value.
 */
export type AnswersByKey = Readonly<Record<string, string | null | undefined>>

/**
 * Is this attribute shown, given the answers so far?
 *
 * This is the **runtime** half of `showIf`, and it lives here rather than in `project/`
 * because it is the same rule as `validateShowIf` seen from the other end: that function
 * checks an admin's authored dependency is well-formed, this one evaluates it. Splitting them
 * across two modules would mean "what `showIf` means" had two homes and eventually two
 * answers.
 *
 * `10-project-configurator.md` §Validation requires the client and the server to evaluate
 * **from the same data in the same way**, so both call this. A wizard that hid a field the
 * server then demanded, or showed one the server ignored, is the failure this prevents.
 *
 * One level, no chaining (`ADR-008`) — `validateShowIf` is what guarantees the parent is not
 * itself conditional, so this function does not need to recurse and deliberately does not.
 */
export function isAttributeVisible(
  attribute: { showIfAttributeKey: string | null; showIfValue: string | null },
  answers: AnswersByKey,
): boolean {
  const key = attribute.showIfAttributeKey
  if (key === null || key === '') return true

  const answer = answers[key]
  if (answer === null || answer === undefined) return false

  /*
   * An empty `showIfValue` means "shown when the parent has any answer at all". Treating it
   * as "shown when the parent equals the empty string" would make the attribute permanently
   * invisible, which is the kind of bug an admin reports as "my field disappeared".
   */
  const expected = attribute.showIfValue
  if (expected === null || expected === '') return answer !== ''

  return answer === expected
}
