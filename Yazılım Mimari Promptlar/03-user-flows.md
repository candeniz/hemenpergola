# 03 — User Flows

The first flow is the product. The rest support it. Each step below names the screen from
`Frontend Tasarım/` that specifies it (`07-frontend-architecture.md` §Screen map).

## F1 — The core flow (release gate)

```
1  discover            public homepage / category / product detail
2  configure           create-project wizard, steps 1..10
3  request offers      validation → matching → estimates
4  compare             matched manufacturers, sort/filter, compare up to 3
5  select              choose 1..N manufacturers, KVKK consent, send request
6  manufacturer acts   accept (contact disclosed) or decline, within SLA
7  survey              appointment scheduled → completed
8  final offer         line items + KDV + validity → customer accepts/rejects
9  outcome             won / lost, review becomes eligible
```

**Screens:** `outdoor_systems_public_homepage_final` → `product_detail_bioclimatic_pergola`
→ `create_project_wizard_refined_style` (`product_selection_step_1`, `dimensions_area_step_2`,
`project_options_step_5`, `project_summary_step_10`) → `finding_manufacturers_loading_state`
→ `matched_manufacturers_results` / `offer_results_refined_comparison` →
`compare_manufacturers_refined_style` → `manufacturer_selection_confirmation` →
`request_success_confirmation` → `customer_dashboard_final` → `request_detail_project_aoe_99421`.

The Playwright spec `e2e/core-flow.spec.ts` walks exactly these nine steps. A release with a
failing core-flow spec does not ship (`20-testing-strategy.md`).

### F1 details that are easy to get wrong

- **Step 2 is resumable.** The wizard writes a `Project` in `DRAFT` on first step completion
  and updates it per step. A customer who closes the tab resumes from
  `customer_dashboard_final` → "Continue draft". Anonymous users get a cookie-scoped draft
  that is claimed on registration (`10-project-configurator.md` §Anonymous drafts).
- **Step 3 is asynchronous in feel, synchronous in fact.** Matching + estimation runs in one
  request; `finding_manufacturers_loading_state` covers p95 latency, not a job queue. If it
  exceeds the budget it is a performance bug, not a reason to introduce a queue.
- **Step 3 can legitimately return zero matches.** `customer_dashboard_empty_state` /
  no-match view: widen radius, show unpriced-but-capable manufacturers, offer notify-me.
  Never silently show an empty list.
- **Step 5 is the KVKK boundary.** Contact data is not sent with the request. It becomes
  visible at step 6 on accept, and the consent + disclosure are both logged.
- **Step 8 introduces KDV.** Estimates at step 3 were net of KDV (`PRC-05`). The offer shows
  net, KDV and gross as separate lines so the difference is explained, not discovered.

## F2 — Customer account

Register (`register_outdoor_systems`) → email verification
(`email_verification_outdoor_systems`) → optional phone verification
(`phone_verification_outdoor_systems`) → login (`login_outdoor_systems`) → password reset
(`forgot_password_outdoor_systems`).

Rules: unverified email may browse and build a draft, may **not** send an offer request.
Phone verification is required before contact disclosure at F1/6 — it is the only thing
protecting manufacturers from junk leads.

## F3 — Manufacturer onboarding

Register company → `MFR-01` first user becomes `OWNER` → complete profile
(`manufacturer_company_settings`) → upload documents → `PENDING` → admin reviews
(`super_admin_manufacturer_verification_detail`) → `VERIFIED` or `REJECTED` with reason.

Only after `VERIFIED`: products (`manufacturer_product_management`), price book
(`manufacturer_pricing_management`), service areas (`manufacturer_service_area_management`).
A company is matchable only when it has **all three** plus a published price book, or is
explicitly flagged "price on request" (`PRC-06`).

## F4 — Manufacturer request handling

`offer_requests_manufacturer_portal` → `manufacturer_request_detail_new_lead` (project data,
no contact) → accept or decline within the SLA window → on accept
`manufacturer_request_detail` reveals contact → schedule survey
(`manufacturer_project_calendar`, `manufacturer_appointment_detail`) → mark completed →
create final offer → send → track won/lost.

SLA expiry auto-declines and is recorded against response-time analytics
(`manufacturer_performance_analytics`). No silent expiry: both sides are notified.

## F5 — Messaging

Available only on `ACCEPTED` or later requests (`customer_messages_arte_outdoor`).
Polling, not WebSocket, in V1 (`15-messaging.md`).

## F6 — Review

Eligible when an engagement reached `SURVEY_COMPLETED` or beyond. Customer submits →
moderation queue (`super_admin_reviews_moderation`) → published → manufacturer may respond
once (`manufacturer_reviews_management`).

## F7 — Admin

`super_admin_command_center_final` is the hub. Verification queue, manufacturer and customer
management, offer-request oversight, review moderation, complaints, CMS/SEO, audit log,
platform settings. Detailed in `17-admin-system.md`.

## Failure paths that must exist

| Case | Screen | Behaviour |
|---|---|---|
| No manufacturer matches | empty state | suggest radius widening, notify-me |
| Manufacturer has no published price | results row | "Price on request", ranked below priced |
| Pricing engine error | `system_error_price_unavailable` | match still shown, price omitted, error logged |
| Permission denied | `access_denied_permission_required` | 403 page, never a redirect loop |
| All manufacturers decline | request detail | customer prompted to select others from saved matches |
| SLA expired | request detail | auto-decline, both parties notified |

Each row has a test. A failure path without a test is a failure path that does not exist.
