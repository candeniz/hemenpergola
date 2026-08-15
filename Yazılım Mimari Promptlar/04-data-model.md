# 04 — Data Model

PostgreSQL 16 + PostGIS, accessed through Prisma. This is the contract; the Prisma schema is
its implementation and must not drift. Change here first, then `prisma/schema.prisma`, then a
migration.

## Conventions

- Primary keys: `cuid()` strings. No sequential integers in URLs.
- Money: **integer kuruş** (`Int`), never `Float`, never `Decimal` in application code.
  A column named `*Kurus` is the only representation. Formatting happens at the edge.
- Timestamps: `createdAt` / `updatedAt` on every table, UTC.
- Soft delete only where a hard delete would break history (`Company`, `User`, `Project`):
  `deletedAt` plus a Prisma extension that filters it. Everything else deletes hard.
- Enums live in the DB as Postgres enums **except** categories/products/options, which are
  rows (`CAT-01`).
- Every foreign key is indexed. Every list query has a covering index; if a query needs one
  that does not exist, add it in the same PR.
- **Collation is C at the cluster, Turkish only where a human reads the order.** The
  database is created with `--locale=C`: byte-order comparison, stable indexes, and no
  locale surprises in the things that must compare exactly — emails, slugs, tokens, tax
  numbers, enum-like strings. Columns that a Turkish reader sorts by carry an explicit
  column collation:

  | Column | Collation |
  |---|---|
  | `City.name` | `COLLATE "tr-TR-x-icu"` |
  | `District.name` | `COLLATE "tr-TR-x-icu"` |
  | `Company.displayName` | `COLLATE "tr-TR-x-icu"` |

  Why not a `tr_TR` cluster: in Turkish collation `I` lower-cases to `ı`, not `i`. A
  cluster-wide Turkish locale would therefore make `USER@X.COM` and `user@x.com` compare as
  different strings, and `İSTANBUL` and `istanbul` slugs diverge — it silently breaks
  case-insensitive email lookup, slug uniqueness and every identifier comparison in the
  system. Sorting a city list correctly is worth one `COLLATE` clause; it is not worth
  that. Adding a Turkish-sorted column later means adding the clause, never changing the
  cluster.

## PostGIS and Prisma

Prisma has no `geography` type. Rather than trading `ADR-002` away for the convenience of a
type the ORM understands, spatial columns are declared as
`Unsupported("geography(Point, 4326)")` and handled deliberately (`ADR-015`):

| Concern | Where it lives |
|---|---|
| Column declaration | `prisma/schema.prisma`, as `Unsupported` |
| GiST index | hand-written in the migration SQL — Prisma cannot index a type it cannot model |
| Every read and write | `src/shared/geo` only, via `$queryRaw` |

`shared/geo` is the **only** file in the application allowed to write PostGIS SQL. That is
what makes `ADR-002`'s real rule — no Haversine in application code — structural instead of
cultural: a JavaScript distance function cannot use the GiST index, so it turns every match
run into a full scan.

Two traps the wrapper exists to absorb: `ST_MakePoint` takes **(longitude, latitude)**,
which is the reverse of how it is said aloud, and `geography` distances are **metres** while
service areas are configured in kilometres.

Consequence to plan around: a spatial column cannot be selected, filtered or included
through the Prisma client. `CompanyContact.point`, `City.point` and `District.point` follow
this pattern today; `ServiceArea.centerPoint` follows it in Phase 3.

## Identity and tenancy

```
User(id, email unique, emailVerifiedAt, phone, phoneVerifiedAt, passwordHash,
     globalRole: CUSTOMER|ADMIN, status, locale, deletedAt)
Account / Session / VerificationToken          -- Auth.js v5 tables
CompanyMembership(id, userId, companyId, role: OWNER|ADMIN|SALES|VIEWER, invitedAt, acceptedAt)
  unique(userId, companyId)
Company(id, slug unique, legalName, displayName, taxNumber, about, logoId, coverId,
        status: PENDING|VERIFIED|REJECTED|SUSPENDED, verifiedAt, rejectionReason,
        foundedYear, employeeRange, deletedAt)
CompanyDocument(id, companyId, type, fileId, status, reviewedBy, reviewedAt, note)
CompanyContact(id, companyId, phone, email, website, addressLine, cityId, districtId,
               point geography(Point))
```

`Company.slug` is the public SEO identity and is immutable once `VERIFIED`.

## Catalogue (rows, not enums)

```
Category(id, parentId?, slug unique, sortOrder, isActive, seoId)
CategoryTranslation(categoryId, locale, name, description)     pk(categoryId, locale)
Product(id, categoryId, slug unique, sortOrder, isActive, basisType: AREA_M2|LENGTH_M|UNIT, seoId)
ProductTranslation(productId, locale, name, shortDescription, description)
ProductAttribute(id, productId, key, inputType: NUMBER|SELECT|MULTISELECT|BOOL|TEXT,
                 unit?, min?, max?, step?, isRequired, affectsPrice, sortOrder)
ProductAttributeTranslation(attributeId, locale, label, helpText)
ProductOption(id, attributeId, value, sortOrder, isActive)
ProductOptionTranslation(optionId, locale, label)
CompanyProduct(id, companyId, productId, isActive)             unique(companyId, productId)
CompanyProductOption(id, companyProductId, optionId, isOffered)
```

`ProductAttribute` + `ProductOption` are what the V1 configurator renders (`ADR-008`).
`ConfiguratorQuestion` / `ConfiguratorRule` are not in V1 — see §Deferred.

## Project

```
Project(id, customerId?, anonymousKey?, productId, status: DRAFT|READY|SUBMITTED|CLOSED,
        title, widthMm?, depthMm?, heightMm?, areaM2?, quantity,
        projectType: NEW_BUILD|RENOVATION,
        installationType: WALL_MOUNTED|FREESTANDING|ROOF|OTHER,
        cityId, districtId, addressNote?, point geography(Point)?,
        timing: ASAP|M1_3|M3_6|PLANNING, budgetHintKurus?, note?, deletedAt)
ProjectAttributeValue(id, projectId, attributeId, optionId?, numberValue?, boolValue?, textValue?)
ProjectAttachment(id, projectId, fileId, kind: PHOTO|DOCUMENT, sortOrder)
```

Dimensions are stored in **millimetres as integers**; `areaM2` is derived and stored for
query and indexing purposes only. Exactly one of `customerId` / `anonymousKey` is set.

## Pricing

```
PriceBook(id, companyId, version Int, status: DRAFT|PUBLISHED|ARCHIVED, publishedAt,
          publishedBy, currency 'TRY', validFrom, validTo?, note)
  unique(companyId, version)
PriceBookItem(id, priceBookId, productId, basePriceKurus, unit: PER_M2|PER_M|PER_UNIT,
              minProjectPriceKurus, setupFeeKurus?)
PriceBookOptionPrice(id, priceBookId, optionId,
                     mode: FLAT|PER_M2|PER_M|PER_UNIT|PERCENT, valueKurus?, percent?)
PriceBookRegionAdjustment(id, priceBookId, cityId?, districtId?,
                          mode: FLAT|PERCENT, valueKurus?, percent?)
PriceBookRule(id, priceBookId, kind, thresholdMin?, thresholdMax?, mode, valueKurus?, percent?, note)
PriceCalculation(id, projectId, companyId, priceBookId, priceBookVersion Int,
                 netKurus, bandLowKurus, bandHighKurus, breakdown Json,
                 engineVersion, calculatedAt, actorUserId?, requestIp?)
```

A `PriceBook` in `PUBLISHED` is **immutable**. Editing means: clone to a new `DRAFT`, publish
as `version + 1`, archive the old one. `PriceCalculation` is append-only (`PRC-02`);
`breakdown` is internal, `bandLowKurus`/`bandHighKurus` is what the customer sees (`PRC-03`).
`actorUserId` + `requestIp` exist so scraping is detectable (`ADR-006`).

## Matching and service areas

```
ServiceArea(id, companyId, kind: CITY|DISTRICT|RADIUS, cityId?, districtId?,
            centerPoint geography(Point)?, radiusKm?, isActive)
City(id, name, plateCode, point)
District(id, cityId, name, point)
MatchRun(id, projectId, createdAt, weightsVersion, resultCount, durationMs)
MatchResult(id, matchRunId, companyId, score, scoreBreakdown Json, priceCalculationId?, rank)
```

`ServiceArea` with `kind = RADIUS` uses a GiST index on `centerPoint`; containment is
`ST_DWithin(centerPoint, project.point, radiusKm * 1000)` (`ADR-002`).

## Offer request lifecycle

```
OfferRequest(id, projectId, customerId, companyId, status, matchResultId?,
             priceCalculationId?, slaExpiresAt, respondedAt, declineReason?,
             contactDisclosedAt?, consentId, closedReason?)
  unique(projectId, companyId)
ContactDisclosure(id, offerRequestId, companyId, disclosedAt, disclosedFields String[], consentId)
Consent(id, userId, type: CONTACT_SHARING|MARKETING|TERMS, textVersion, grantedAt,
        revokedAt?, ip, userAgent)
Appointment(id, offerRequestId, scheduledAt, durationMin, status, note, completedAt)
Offer(id, offerRequestId, number unique, status, netKurus, taxRate, taxKurus, grossKurus,
      validUntil, note, sentAt, decidedAt, decisionNote)
OfferLine(id, offerId, sortOrder, description, quantity, unit, unitPriceKurus, lineNetKurus)
```

Status values and transitions live in `11-offer-request-lifecycle.md`. Nothing writes
`status` directly — all transitions go through the state machine, which is the only place
the invariants live.

## Messaging, reviews, media, content

```
Thread(id, offerRequestId unique)
Message(id, threadId, senderUserId, body, sentAt, readAt?)
Review(id, offerRequestId unique, customerId, companyId, ratingOverall, ratingQuality,
       ratingCommunication, ratingTimeliness, title, body,
       status: PENDING|PUBLISHED|REJECTED, moderatedBy, moderatedAt, publishedAt)
ReviewResponse(id, reviewId unique, companyId, body, createdAt)
File(id, key, bucket, mime, sizeBytes, width?, height?, ownerType, ownerId, uploadedBy,
     virusScanStatus)
PortfolioItem(id, companyId, title, description, productId?, cityId?, completedAt, sortOrder)
PortfolioPhoto(id, portfolioItemId, fileId, sortOrder)
CmsPage(id, slug unique, status, seoId)
CmsPageTranslation(pageId, locale, title, body)
Seo(id, metaTitle?, metaDescription?, canonicalUrl?, ogImageId?, noIndex, jsonLd Json?)
Notification(id, userId, type, payload Json, readAt?, createdAt)
NotificationPreference(id, userId, channel, type, enabled)
AuditLog(id, actorUserId?, actorRole, companyId?, entityType, entityId, action,
         before Json?, after Json?, reason?, ip, userAgent, createdAt)
PlatformSetting(key primary, value Json, updatedBy, updatedAt)
```

`Review` is unique per `offerRequestId` — one engagement, one review
(`16-reviews-and-ratings.md`).

## Deferred — modelled, not built (`ADR-010`, brief §37)

```
Plan(id, code, name, priceKurus, interval, features Json, isActive)
Subscription(id, companyId, planId, status, currentPeriodStart, currentPeriodEnd, cancelAt?)
Payment(id, companyId, subscriptionId?, amountKurus, status, provider, providerRef, paidAt?)
LeadCredit(id, companyId, delta, reason, offerRequestId?, createdAt)
ConfiguratorQuestion(id, productId, ...)
ConfiguratorRule(id, productId, ...)
```

These tables ship in the schema so later migrations are additive, and designs for them
already exist (`super_admin_plan_management`, `super_admin_subscriptions_oversight`,
`super_admin_invoices_transactions`, `super_admin_configurator_builder`). **No service, no
route, no UI in V1.** The existence of a design is not a decision to build it.

## Indexes worth naming now

| Table | Index | Why |
|---|---|---|
| `ServiceArea` | GiST on `centerPoint` | radius containment |
| `Project` | GiST on `point`; btree `(customerId, status)` | matching, dashboard |
| `OfferRequest` | `(companyId, status, createdAt)`, `(customerId, status)` | both portals' lists |
| `PriceBook` | partial unique `(companyId)` where `status = 'PUBLISHED'` | one live book per company |
| `MatchResult` | `(matchRunId, rank)` | ordered results |
| `AuditLog` | `(entityType, entityId, createdAt)`, `(actorUserId, createdAt)` | admin filters |
| `Company` | trigram on `displayName` | directory search |
| `Message` | `(threadId, sentAt)` | polling window |
