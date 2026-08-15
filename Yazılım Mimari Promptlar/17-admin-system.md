# 17 — Admin System

`/yonetim/*`, `globalRole = ADMIN` only, `noindex`, 8-hour non-sliding sessions
(`12-authentication-authorization.md`). Every write produces an `AuditLog` row; writes that
affect a company's standing or a user's data require a **reason string**.

## Command center

`super_admin_command_center_final` (canonical; `super_admin_global_dashboard` is the earlier
iteration). It is a work queue, not a vanity dashboard. Top row = things waiting on an admin:

| Queue | Source |
|---|---|
| Manufacturers pending verification | `Company.status = PENDING` with complete documents |
| Reviews pending moderation | `Review.status = PENDING` |
| Open complaints | `Complaint.status ∈ OPEN, ESCALATED` |
| Failed notifications (dead-letter) | `13-notifications.md` |
| Infected/failed uploads | `14-file-storage-and-media.md` |
| Zero-result districts (last 7 days) | `09-manufacturer-matching.md` §Zero-result |

Below that, health numbers: new projects, offer requests, accept rate, median response time,
offers sent, won. Each tile links to its filtered list.

## Manufacturer verification

`super_admin_manufacturer_management` → `super_admin_manufacturer_verification` (queue) →
`super_admin_manufacturer_verification_detail` (decision).

The detail view shows company profile, tax number, documents with a viewer, service areas,
products, and the submission history. Actions: **approve**, **reject with reason**,
**request more documents**, **suspend with reason**.

- Approval sets `verifiedAt`, unlocks matching, notifies the company.
- Rejection is not terminal: the company can resubmit, and the previous reason stays visible
  to both sides.
- Suspension freezes the company (`02-user-roles-and-permissions.md`) and pauses its
  `PENDING` requests rather than deleting them; the affected customers are notified and can
  select alternatives.
- Document viewing is audit-logged as a disclosure — these are legal identity documents.

## Customer management

`super_admin_customer_management` → `super_admin_customer_detail_profile`.

Read-only by default: projects, requests, reviews, consents, notification preferences.
Writes are limited to suspend/unsuspend (reason required), forced email re-verification, and
KVKK data export/erasure requests (`19-security-and-kvkk.md`). Contact details are masked
until an admin clicks to reveal, and the reveal is logged. No impersonation (`REQ-ADM-03`).

## Catalogue

`super_admin_product_catalog_management` — categories, products, attributes, options, and
their translations and SEO records. Everything here is data, so nothing here needs a
deployment (`CAT-03`).

Guards: a category with children or products cannot be deleted, only deactivated. An option
referenced by any `ProjectAttributeValue` or `PriceBookOptionPrice` cannot be deleted, only
deactivated (`10-project-configurator.md` §Admin authoring). Publishing catalogue changes
revalidates the affected ISR tags.

## Offer request oversight

`super_admin_offer_request_management` — filter by status, company, city, date; inspect the
timeline of any request. Read-only except two actions, both requiring a reason:
force-close a stuck request, and extend an SLA window. Admin cannot accept, decline, price,
or offer on behalf of anyone (`11-offer-request-lifecycle.md`).

## Moderation and complaints

`super_admin_reviews_moderation` per `16-reviews-and-ratings.md`.

`super_admin_complaints_disputes` — a complaint is a case attached to an `OfferRequest`, a
`Review` or a `Company`, with a status (`OPEN | IN_REVIEW | ESCALATED | RESOLVED | CLOSED`),
an assignee, an internal note thread and an outcome. Opening a case is the **only** way an
admin can read a message thread, and doing so writes a disclosure audit entry visible to
both parties.

## Content and SEO

`super_admin_cms_seo_management` — CMS pages, per-locale slugs, meta, canonical, JSON-LD,
redirects, `robots` directives (`18-cms-seo.md`). Publishing revalidates by tag.

## Platform settings

Settings live in `PlatformSetting` and are editable without deployment (`ADM-06`):

| Key | Default | Used by |
|---|---|---|
| `matching.weights` (+ `weightsVersion`) | see doc 09 | matching |
| `matching.max_companies_per_project` | 5 | matching |
| `pricing.band_percent` / `band_min_kurus` / `round_step` | 10% / — / ₺500 | pricing band |
| `offer_request.sla_hours` | 48 | lifecycle |
| `tax.kdv_default` | 20% | offers |
| `review.window_days` | 90 | reviews |
| `notification.*` | see doc 13 | `super_admin_global_notification_settings` |

Changing a setting is audit-logged with before/after. Weight changes bump `weightsVersion`
so past match runs stay explainable.

## Analytics

`super_admin_platform_metrics_analytics` — funnel (project → matched → requested → accepted →
offered → won), supply coverage by district, response and moderation SLAs, review health.

`super_admin_market_pricing_dashboard` — the **only** place the market aggregate exists:
min/max/median estimates per product and region, computed over `PriceCalculation` rows. This
is the §32 feature from the brief, scoped to admin (`ADR-006`). Never expose it, in any form,
on a customer or manufacturer surface.

## Audit log

`super_admin_audit_logs` — filter by actor, entity type, entity id, action, date. Read-only
for everyone, including admins; append-only in the database (no `UPDATE`/`DELETE` grant for
the application role). Retention and export in `19-security-and-kvkk.md`.

## Not in V1

`super_admin_plan_management`, `super_admin_subscriptions_oversight`,
`super_admin_invoices_transactions`, `super_admin_configurator_builder` — designed, not
built, not linked in navigation (`ADR-010`).
