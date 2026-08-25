# 06 — API Specification

`/api/v1` is a real, versioned, documented API — not an internal helper. The web app mostly
uses server actions, but every capability exists here because the mobile phase consumes it
(`05-system-architecture.md` §Two entry points).

## Conventions

- Base: `/api/v1`. Breaking changes require `/api/v2`; additive changes do not.
- Auth: `Authorization: Bearer <jwt>`. Cookie sessions are **not** accepted here, so CSRF is
  structurally impossible on this surface (`12-authentication-authorization.md`).
- Company scope is in the path: `/api/v1/companies/{companyId}/...`. Never inferred.
- Content type `application/json`; `Accept-Language: tr|en` selects translated fields.
- Idempotency: `Idempotency-Key` header required on `POST` that creates money- or
  disclosure-bearing entities (offer request, offer, appointment).
- Money in responses: `{ "amount": 1250000, "currency": "TRY" }` — integer kuruş, always.
  Never a formatted string, never a float.

### Envelope

```jsonc
// success
{ "data": { }, "meta": { "requestId": "..." } }

// list
{ "data": [ ], "meta": { "requestId": "...", "page": { "cursor": "...", "hasMore": true, "limit": 20 } } }

// error
{ "error": { "code": "FORBIDDEN", "message": "…", "details": [ ], "requestId": "…" } }
```

`code` mirrors `DomainError.kind`. Clients switch on `code`, never on `message`.

### Pagination

Cursor-based (`?cursor=&limit=`). Offset pagination is not offered — admin tables sort by
`createdAt desc` and offset drifts under concurrent writes.

### Rate limits

| Surface | Limit |
|---|---|
| auth (login, register, reset, verify) | 10 / 15 min / IP + per account |
| offer request creation | 5 / hour / user |
| price estimate | 30 / hour / user, 60 / hour / IP (`ADR-006` anti-scraping) |
| messages | 60 / hour / thread |
| public read | 300 / min / IP |
| privacy (export request, erasure request) | 5 / hour / account — each call is one emailed token |

Exceeded → `429` with `Retry-After`. Every price-estimate call is recorded with actor and IP
regardless of outcome.

## Endpoints

### Auth

```
POST   /auth/register                 { email, password, fullName, locale }
POST   /auth/login                    -> { accessToken, refreshToken, expiresIn }
POST   /auth/refresh
POST   /auth/logout
POST   /auth/verify-email             { token }
POST   /auth/verify-phone/start       { phone }
POST   /auth/verify-phone/confirm     { code }
POST   /auth/password/forgot          { email }
POST   /auth/password/reset           { token, password }
GET    /me                            -> user + memberships
PATCH  /me                            { channel, type, enabled }  one notification preference
GET    /me/notification-preferences   -> the stored rows; absence of a row means enabled
```

`POST /auth/logout` revokes an API refresh-token family — `{ refreshToken?, allDevices? }`,
answering `{ revokedFamilies }`, and signing out twice is not an error. It is **not** the
web sign-out: that deletes a `Session` row addressed by an `httpOnly` cookie (`ADR-022`)
and is the one capability deliberately absent from this surface, because a token client has
no cookie to delete.

`PATCH /me` writes **one** preference per call, which is the shape a toggle produces and
the shape `13` §Preferences stores. Mandatory events (`ADR-027`) are refused here with
`PRECONDITION` rather than silently ignored. Profile and locale writes are named in this
line and not yet built — Phase 10.4.

### Catalogue (public)

```
GET    /categories                    ?parent=&locale=
GET    /categories/{slug}
GET    /products                      ?category=&q=&cursor=
GET    /products/{slug}               -> product + attributes + options  (drives the configurator)
GET    /cities                        81 provinces
GET    /cities/districts              all 974 districts, each with its cityId
```

### Projects (customer)

```
POST   /projects                      create draft
GET    /projects                      ?status=&cursor=
GET    /projects/{id}
PATCH  /projects/{id}                 partial, per wizard step
PUT    /projects/{id}/attributes      full replace of attribute values
POST   /projects/{id}/photos          { fileId }        DELETE /projects/{id}/photos/{photoId}
POST   /projects/{id}/claim           { anonymousKey }  attach an anonymous draft after signup
DELETE /projects/{id}                 draft only
POST   /projects/{id}/validate        -> { ready: bool, issues: [] }
POST   /projects/{id}/duplicate       -> a new draft with the same answers
```

`POST /projects/{id}/photos` and every other body below that takes a `{ fileId }` gets one
from §Files — that section did not exist until Phase 10.2 and its absence was the largest
hole in this document: three endpoints consumed an id nothing produced.

### Matching and estimates (customer)

```
POST   /projects/{id}/matches          run matching + estimates -> MatchRun
GET    /projects/{id}/matches          the STORED run, ranked
GET    /projects/{id}/matches/fallback `09` §Zero-result steps 1–2, computed, not persisted
POST   /projects/{id}/matches/supply-gap  `09` §Zero-result step 3 — notify me
```

**`GET` reads the stored run and does not recompute.** `09` §Pipeline persists a
`MatchRun` so that returning to the results does not re-run the pipeline; a client that
could only `POST` would pay for the pipeline on every screen visit and would see the band
move whenever a price book changed underneath it.

`/matches/compare` needs no endpoint of its own: comparison is a view over the same stored
run, filtered to at most three companies by the client. It is listed here as a screen, not a
capability.

`/matches/fallback` is separate from `GET /matches` because `resultCount: 0` is a true
answer a client must be able to receive. `09` is explicit that a widened result is **not**
persisted as a match — writing it into the run would make the count a lie.

`MatchResult` in a customer response carries `estimate: { bandLow, bandHigh, currency,
taxIncluded: false, priceOnRequest: bool }`. It never carries `breakdown` (`PRC-03`). The
manufacturer's own endpoint below does return the breakdown for its own calculations.

### Offer requests (customer side)

```
POST   /offer-requests                { projectId, companyIds[], consent: { textVersion, accepted } }
GET    /offer-requests                ?projectId=  the requests for one project
GET    /offer-requests/{id}
POST   /offer-requests/{id}/cancel    { reason }
GET    /offer-requests/{id}/offer
POST   /offer-requests/{id}/offer/accept   { note? }
POST   /offer-requests/{id}/offer/reject   { reason }
```

`consent.accepted !== true` → `422`. Consent is stored, versioned and auditable; it is not a
UI checkbox that vanishes after submit (`19-security-and-kvkk.md`).

### Files

Every `{ fileId }` in this document comes from here. Uploads go **straight from the client
to object storage** and never through the application, so the flow is three calls:

```
POST   /files/presign                 { ownerType, ownerId, mime, sizeBytes } -> { fileId, uploadUrl, headers }
POST   /files/{fileId}/complete       the bytes landed; verify, scan, enqueue processing
GET    /files/{fileId}/url            -> { url, expiresAt? }
```

`ownerType` is one of `PROJECT`, `COMPANY_DOCUMENT`, `PORTFOLIO`, `COMPANY_LOGO`,
`COMPANY_COVER`, `CMS`, `OFFER_ATTACHMENT`, and it selects the size and MIME policy.
The `mime` and `sizeBytes` in the presign are a **claim**: they are checked against that
policy before a URL is issued, and checked again against what actually arrived by
`complete`. A client that lies gets a `File` row that never becomes usable.

`complete` is not optional. Until it runs the file is unscanned, and `url` will not serve
an unscanned file to anybody but its uploader. It is idempotent, because a phone on a poor
connection will retry it.

`url` returns different things by access class, which lives in the storage key and not only
in a column: a portfolio photo comes back as an unsigned CDN URL, a company document as a
five-minute signed URL whose issue is a disclosure and writes an audit entry.

### Manufacturer portal

```
GET    /companies/{companyId}
PATCH  /companies/{companyId}                      profile and contact
PUT    /companies/{companyId}/slug                 { slug } — see 18 §Slugs for the redirect rule
POST   /companies/{companyId}/documents            { type, fileId }
GET    /companies/{companyId}/members
POST   /companies/{companyId}/members/invite       { email, role }
PATCH  /companies/{companyId}/members/{userId}     { role }
DELETE /companies/{companyId}/members/{userId}

GET    /companies/{companyId}/products
PUT    /companies/{companyId}/products/{productId} { isActive, offeredOptionIds[] }

GET    /companies/{companyId}/price-books
POST   /companies/{companyId}/price-books          create draft (optionally clone version N)
GET    /companies/{companyId}/price-books/{id}
PATCH  /companies/{companyId}/price-books/{id}     draft only
PUT    /companies/{companyId}/price-books/{id}/items
POST   /companies/{companyId}/price-books/{id}/publish
POST   /companies/{companyId}/price-books/{id}/archive
POST   /companies/{companyId}/price-books/{id}/simulate  { projectDraft } -> full breakdown

GET    /companies/{companyId}/service-areas
POST   /companies/{companyId}/service-areas        { kind, cityId|districtId|{lat,lng,radiusKm} }
DELETE /companies/{companyId}/service-areas/{id}

GET    /companies/{companyId}/offer-requests       ?status=&cursor=
GET    /companies/{companyId}/offer-requests/{id}  contact fields present only after ACCEPTED
POST   /companies/{companyId}/offer-requests/{id}/accept
POST   /companies/{companyId}/offer-requests/{id}/decline   { reason }
POST   /companies/{companyId}/offer-requests/{id}/appointments  { scheduledAt, durationMin, note }
PATCH  /companies/{companyId}/offer-requests/{id}/appointments  complete the survey
POST   /companies/{companyId}/offer-requests/{id}/offers        { lines[], taxRate?, validUntil, note }
POST   /companies/{companyId}/offer-requests/{id}/outcome       { result: WON|LOST, reason? }

GET    /companies/{companyId}/portfolio            POST/PATCH/DELETE items and photos
GET    /companies/{companyId}/reviews              POST /reviews/{id}/response
GET    /companies/{companyId}/analytics            ?from=&to=
GET    /companies/{companyId}/offer-requests/{id}/messages   the manufacturer's half of the thread
POST   /companies/{companyId}/offer-requests/{id}/messages   { body }
```

`price-books/{id}/simulate` is how a manufacturer sees what customers will be quoted before
publishing. It is the safe place for the full breakdown: same company, `price_book.read`.

### Messaging

```
GET    /offer-requests/{id}/messages   ?after=<messageId>    polling window
POST   /offer-requests/{id}/messages   { body }
POST   /offer-requests/{id}/messages/read   { upTo }
```

Both sides use the same two endpoints; authorisation resolves which participant you are.

### Reviews (customer)

```
GET    /offer-requests/{id}/review/eligibility
POST   /offer-requests/{id}/review     { ratings…, title, body }
```

### Public read

```
GET    /manufacturers                  ?city=&district=&product=&q=&sort=&cursor=
GET    /manufacturers/{slug}
GET    /manufacturers/{slug}/portfolio GET /manufacturers/{slug}/reviews
GET    /pages/{slug}                   CMS
GET    /categories/{slug}/cities       GET /cities/{slug}  the city landing pages 18 §Cities
```

Every one of these exists today **only as a Server Component**. They are public and
cacheable, which is what made them the easiest to leave as pages and the least urgent to
expose — and a mobile client needs all of them, so they land in Phase 10.4 rather than
staying a rendering detail. The same is true of the configurator's product reads under
§Catalogue.

### Admin

Mirrors `17-admin-system.md` under `/admin/*`, all requiring `globalRole = ADMIN`, all
writing an `AuditLog` row. Read the admin doc for semantics; the shapes follow the same
envelope and pagination rules as everything above.

"Mirrors `17`" is a description, not a path, and a capability with no path written down is
a capability nobody builds. The ones this document had left implicit:

```
GET    /admin/audit                   already built; ?entityType=&entityId=&cursor=
GET    /admin/audit/facets            the filter values that exist, for the viewer's selects
GET    /admin/offer-requests          the requests an admin may close, and only those
POST   /admin/offer-requests/{id}/close   { reason } — 11's one operator power
GET    /admin/reviews                 ?status=PENDING
POST   /admin/reviews/{id}/moderate   { status, reason? }
PUT    /admin/content/{slug}          the block CMS page body
```

`11` §Transition table is explicit that closing is the **whole** of what an admin may do to
an engagement: *"There is no admin override that skips a guard."* `/admin/offer-requests`
therefore lists closable requests rather than all of them — a general view is how an
override gets added later without anyone deciding to add one.

### Privacy (the account's own data)

```
POST   /privacy/export                ask for the package -> { expiresAt }
GET    /privacy/export?token=&format= download it (json | pdf); the token is emailed
POST   /privacy/erase                 { confirmEmail } — ASK to erase; emails a token
POST   /privacy/erase/confirm         { token } — the anonymisation itself runs here
```

`19` §Data subject rights, and the reason this section is dated rather than original: only
the `GET` existed until Phase 10.2. The download was built, tested and shipped, and there
was no way to reach the thing being downloaded — from any surface, web or API. A user could
not exercise their access right at all.

`POST /privacy/export` takes no body: the subject is always the caller, so there is no
parameter with which to ask for somebody else's data.

`POST /privacy/erase` requires the account's own email in `confirmEmail` — a deliberate
speed bump, not a factor: the caller is already the account and `GET /me` returns the very
address being typed. What authorises the erasure is the emailed one-hour single-use token,
which comes back through `/erase/confirm` — proof of control of the inbox, the
password-reset trust model, and the *verification* in `19`'s "request → verification →
anonymisation" (Q30, closed in Phase 10.3). The emailed link opens a page with a button
rather than acting on `GET`, because mail scanners prefetch URLs and a prefetch must never
erase an account. Both request endpoints sit on the `privacy` rate-limit surface.

**Erasure is anonymisation** (`ADR-011`): consents, contact disclosures, commercial
records, message transcripts and the audit trail survive, stripped of the fields that
identify the subject.

### Deferred — reserved, returns 501

`/subscriptions`, `/payments`, `/plans`, `/configurator/rules`. Reserved so paths do not get
squatted by something else; they return `501 NOT_IMPLEMENTED` in V1 (`ADR-010`).

## Contract discipline

Request and response shapes are Zod schemas in `modules/<m>/application/dto`, shared by the
route handler, the server action and the tests. OpenAPI is **generated** from those schemas
into `openapi.json` at build time. A hand-written spec that drifts from the code is worse
than no spec, so there is not one.
