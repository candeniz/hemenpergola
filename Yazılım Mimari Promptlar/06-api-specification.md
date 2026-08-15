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
PATCH  /me                            profile, locale, notification preferences
```

### Catalogue (public)

```
GET    /categories                    ?parent=&locale=
GET    /categories/{slug}
GET    /products                      ?category=&q=&cursor=
GET    /products/{slug}               -> product + attributes + options  (drives the configurator)
GET    /cities                        GET /cities/{id}/districts
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
```

### Matching and estimates (customer)

```
POST   /projects/{id}/matches         run matching + estimates -> MatchRun
GET    /projects/{id}/matches         latest run, ranked
GET    /projects/{id}/matches/compare ?companyIds=a,b,c   (max 3)
```

`MatchResult` in a customer response carries `estimate: { bandLow, bandHigh, currency,
taxIncluded: false, priceOnRequest: bool }`. It never carries `breakdown` (`PRC-03`). The
manufacturer's own endpoint below does return the breakdown for its own calculations.

### Offer requests (customer side)

```
POST   /offer-requests                { projectId, companyIds[], consent: { textVersion, accepted } }
GET    /offer-requests                ?status=&cursor=
GET    /offer-requests/{id}
POST   /offer-requests/{id}/cancel    { reason }
GET    /offer-requests/{id}/offer
POST   /offer-requests/{id}/offer/accept   { note? }
POST   /offer-requests/{id}/offer/reject   { reason }
```

`consent.accepted !== true` → `422`. Consent is stored, versioned and auditable; it is not a
UI checkbox that vanishes after submit (`19-security-and-kvkk.md`).

### Manufacturer portal

```
GET    /companies/{companyId}
PATCH  /companies/{companyId}
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
PATCH  /companies/{companyId}/appointments/{id}                 { status, completedAt }
POST   /companies/{companyId}/offer-requests/{id}/offers        { lines[], taxRate, validUntil, note }
POST   /companies/{companyId}/offers/{id}/send
POST   /companies/{companyId}/offer-requests/{id}/outcome       { result: WON|LOST, note }

GET    /companies/{companyId}/portfolio            POST/PATCH/DELETE items and photos
GET    /companies/{companyId}/reviews              POST /reviews/{id}/response
GET    /companies/{companyId}/analytics            ?from=&to=
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
```

### Admin

Mirrors `17-admin-system.md` under `/admin/*`, all requiring `globalRole = ADMIN`, all
writing an `AuditLog` row. Read the admin doc for semantics; the shapes follow the same
envelope and pagination rules as everything above.

### Deferred — reserved, returns 501

`/subscriptions`, `/payments`, `/plans`, `/configurator/rules`. Reserved so paths do not get
squatted by something else; they return `501 NOT_IMPLEMENTED` in V1 (`ADR-010`).

## Contract discipline

Request and response shapes are Zod schemas in `modules/<m>/application/dto`, shared by the
route handler, the server action and the tests. OpenAPI is **generated** from those schemas
into `openapi.json` at build time. A hand-written spec that drifts from the code is worse
than no spec, so there is not one.
