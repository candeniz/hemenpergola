import { test } from '@playwright/test'

/**
 * THE RELEASE GATE.
 *
 * `20-testing-strategy.md` §End to end: this spec walks the nine steps of
 * `03-user-flows.md` §F1 across three browser contexts (customer, manufacturer, admin)
 * against a seeded database. **A release with a failing core-flow spec does not ship.
 * Nothing else has that status.**
 *
 * It exists from Phase 0, empty, on purpose. A gate introduced in Phase 6 is a gate that
 * was optional until Phase 6. Each step un-skips in the phase named in its comment, and the
 * count of remaining `skip`s is the honest measure of how much of the product actually
 * works end to end.
 *
 *   step 1–2   Phase 4  · configurator
 *   step 3–4   Phase 5  · matching + pricing
 *   step 5–9   Phase 6  · offer request lifecycle
 *
 * Do not delete a step to make the suite green. Do not add a step that F1 does not have.
 */
test.describe('F1 · core flow (release gate)', () => {
  test.skip('1 · discover: a visitor reaches a product from the public homepage', async () => {
    // Phase 8 gives this real catalogue content; Phase 4 can drive it with seed rows.
    // Screens: outdoor_systems_public_homepage_final → product_detail_bioclimatic_pergola
  })

  test.skip('2 · configure: the wizard produces a READY project and survives a reload', async () => {
    // Phase 4. Three visible stages, ten logical steps (ADR-013); each step persists, so
    // the reload assertion is the one that proves state lives in the database.
    // Screens: create_project_wizard_refined_style, dimensions_area_step_2, …_step_10
  })

  test.skip('3 · request offers: matching and pricing return ranked, priced manufacturers', async () => {
    // Phase 5. Synchronous in fact, asynchronous in feel (03 §F1 details).
    // Must also cover the zero-match branch, which is a legitimate outcome, not an error.
    // Screens: finding_manufacturers_loading_state → matched_manufacturers_results
  })

  test.skip('4 · compare: the customer sorts, filters and compares at most three', async () => {
    // Phase 5. The cap is 3 (CUS-06) and the price shown is a band, never a line item
    // (PRC-03). Screen: compare_manufacturers_refined_style
  })

  test.skip('5 · select: consent is captured and the request is sent to 1..5 manufacturers', async () => {
    // Phase 6. The KVKK boundary: contact data is NOT sent with the request, and the
    // consent row records the exact text version (19 §Consent).
    // Screens: manufacturer_selection_confirmation → request_success_confirmation
  })

  test.skip('6 · manufacturer accepts: contact is disclosed exactly once, with a record', async () => {
    // Phase 6. The single most important transition in the product. Asserts the DTO
    // difference — contact fields absent before ACCEPTED, present after — plus the
    // ContactDisclosure row, the audit entry and the notification to the customer.
    // Screens: manufacturer_request_detail_new_lead → manufacturer_request_detail
  })

  test.skip('7 · survey: an appointment is scheduled and then completed', async () => {
    // Phase 6. Completion is what makes the engagement review-eligible (16).
    // Screens: manufacturer_project_calendar, manufacturer_appointment_detail
  })

  test.skip('8 · final offer: line items, KDV and validity, then the customer decides', async () => {
    // Phase 6. Tax is computed once on the net total, never per line (11 §Offers and KDV),
    // and the original estimate is shown beside the offer so the gap is explained in place.
  })

  test.skip('9 · outcome: won or lost is recorded and a review becomes possible', async () => {
    // Phase 6 for the outcome, Phase 7 for the review that follows it.
  })
})
