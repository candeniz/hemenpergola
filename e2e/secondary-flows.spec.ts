import { test } from '@playwright/test'

/**
 * The secondary specs named in `20-testing-strategy.md` §End to end, plus every failure
 * path in `03-user-flows.md` §Failure paths — *"each row has a test. A failure path without
 * a test is a failure path that does not exist."*
 *
 * They are `fixme` rather than `skip` so they read as owed work rather than as a decision,
 * and so the count is visible in every Playwright run from now on. One file, because a
 * directory of empty files is harder to keep honest than a list.
 */

test.describe('F2 · customer account', () => {
  // 'registration → email verification → login → password reset' now runs, in
  // `account.spec.ts`. Phase 1 closed it; it is not listed here twice.

  test.fixme('phone verification gates contact disclosure', async () => {
    // Phase 1 for the flow, Phase 6 for the gate it protects. The only real defence
    // manufacturers have against junk leads (03 §F2).
  })
})

test.describe('F3 · manufacturer onboarding', () => {
  test.fixme('register → documents → verified → products, price book, service areas', async () => {
    // Phase 3. Ends at the state that matters: the company is matchable.
  })

  test.fixme('a rejected company can resubmit, and the reason stays visible to both', async () => {
    // Phase 2 (admin decision) + Phase 3.
  })
})

test.describe('F4 · request handling', () => {
  test.fixme('decline and re-select: the customer picks others from the same MatchRun', async () => {
    // Phase 6. Failure path: "all manufacturers decline".
  })

  test.fixme('SLA expiry auto-declines and notifies both parties', async () => {
    // Phase 6. Needs the clock advanced through a test-only endpoint (20 §End to end).
  })
})

test.describe('F6 · reviews', () => {
  test.fixme('review is possible only after SURVEY_COMPLETED, and is moderated', async () => {
    // Phase 7. One review per OfferRequest, enforced by a unique index (16).
  })
})

test.describe('03 §Failure paths — each row is a test', () => {
  test.fixme('no manufacturer matches → widen radius, unpriced-but-capable, notify me', async () => {
    // Phase 5. Never an empty list rendered silently.
  })

  test.fixme('manufacturer has no published price → "price on request", ranked below', async () => {
    // Phase 5 (PRC-06).
  })

  test.fixme('pricing engine error → match still shown, price omitted, error logged', async () => {
    // Phase 5. Screen: system_error_price_unavailable. Matching and pricing fail
    // independently — that separation is the point.
  })

  // 'permission denied → 403 page, never a redirect loop' now runs, in `account.spec.ts`.

  test.fixme('all manufacturers decline → customer prompted to select others', async () => {
    // Phase 6.
  })

  test.fixme('SLA expired → auto-decline, both parties notified', async () => {
    // Phase 6.
  })
})
