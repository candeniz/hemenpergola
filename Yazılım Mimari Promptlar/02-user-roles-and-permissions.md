# 02 — User Roles & Permissions

## Actor model

Three top-level actors. Two of them (`CUSTOMER`, `ADMIN`) are users. The third,
`MANUFACTURER`, is a **company** with several users holding company-scoped roles.

```
User ──< CompanyMembership >── Company
  │            (role)
  └── globalRole: CUSTOMER | ADMIN
```

A `User` therefore has:

- `globalRole` — `CUSTOMER` by default, `ADMIN` only by direct DB/admin grant.
- zero or more `CompanyMembership` rows, each with a company-scoped role.

A single person may be a customer and a member of a manufacturer company. The active
context is resolved per request from the route segment, never from a "current company"
value stored on the session — see `12-authentication-authorization.md` §Context resolution.

## Company-scoped roles

| Role | Can | Cannot |
|---|---|---|
| `OWNER` | everything below, plus billing, company deletion, transferring ownership | — |
| `ADMIN` | manage members, products, price books, service areas, requests, offers, portfolio | delete company, transfer ownership |
| `SALES` | see and answer requests, create offers, message customers, schedule surveys | edit price books, manage members, edit company profile |
| `VIEWER` | read dashboards and analytics | any write |

Exactly one `OWNER` per company at any time (enforced by a partial unique index).

## Permission catalogue

Permissions are string constants (`company:price_book.publish`), not booleans on the user.
The full list lives in `src/modules/iam/domain/permissions.ts`; it is the single source of
truth and this table must be regenerated from it, never hand-edited to diverge.

<!-- BEGIN GENERATED PERMISSION TABLE -->

<!-- Generated from src/modules/iam/domain/permissions.ts by scripts/generate-permission-table.mjs.
     Do not edit by hand: permissions.test.ts fails when this drifts from the code. -->

| Permission | OWNER | ADMIN | SALES | VIEWER |
|---|:--:|:--:|:--:|:--:|
| `company.update` | ✓ | ✓ | — | — |
| `company.delete` | ✓ | — | — | — |
| `member.invite` | ✓ | ✓ | — | — |
| `member.remove` | ✓ | ✓ | — | — |
| `member.change_role` | ✓ | ✓¹ | — | — |
| `product.manage` | ✓ | ✓ | — | — |
| `price_book.read` | ✓ | ✓ | ✓ | ✓ |
| `price_book.write` | ✓ | ✓ | — | — |
| `price_book.publish` | ✓ | ✓ | — | — |
| `service_area.manage` | ✓ | ✓ | — | — |
| `offer_request.read` | ✓ | ✓ | ✓ | ✓ |
| `offer_request.respond` | ✓ | ✓ | ✓ | — |
| `offer.create` | ✓ | ✓ | ✓ | — |
| `offer.send` | ✓ | ✓ | ✓ | — |
| `appointment.manage` | ✓ | ✓ | ✓ | — |
| `message.send` | ✓ | ✓ | ✓ | — |
| `portfolio.manage` | ✓ | ✓ | ✓ | — |
| `review.respond` | ✓ | ✓ | ✓ | — |
| `analytics.read` | ✓ | ✓ | ✓ | ✓ |
| `document.upload` | ✓ | ✓ | — | — |

¹ `ADMIN` cannot grant or revoke `OWNER`.

<!-- END GENERATED PERMISSION TABLE -->

## Customer permissions

A customer needs no permission catalogue: authorisation is **ownership plus state**.

- A `Project` is readable/writable only by `project.customerId`.
- An `OfferRequest` is readable by its customer and by manufacturers it was sent to.
- Contact data on the customer is exposed to a manufacturer **only** when that
  manufacturer's `OfferRequest` is in `ACCEPTED` or later — `11-offer-request-lifecycle.md`.
- Reviews require an eligible completed engagement — `16-reviews-and-ratings.md`.

## Admin

`ADMIN` bypasses company scoping but **not** the audit log. Every admin write records
actor, entity, action, before/after and reason where the action requires one
(`19-security-and-kvkk.md` §Audit).

Deliberate V1 restrictions:

- No impersonation (`REQ-ADM-03`). It is the single largest KVKK exposure for the least
  V1 value; revisit with a consent + audit design, not as a patch.
- Admin cannot read direct messages between a customer and a manufacturer except through
  a complaint case, which records the disclosure.
- Admin cannot see an unpublished price book's line items. It can see that one exists.

## Verification state gates capability

Manufacturer capability is the intersection of role **and** company state:

| Company status | Effect |
|---|---|
| `PENDING` | can complete profile and upload documents; not matchable, not listed |
| `VERIFIED` | fully operational |
| `REJECTED` | read-only, may resubmit documents |
| `SUSPENDED` | read-only, hidden from search and matching, existing requests frozen |

Checked in the application service, not in the UI. The UI mirrors it with
`access_denied_permission_required` (see `07-frontend-architecture.md` §Screen map).

## Enforcement rule

Every application service method takes an `ActorContext` and calls `assert(permission)`
as its first statement. There is no "the route already checked it" exemption — route
handlers, server actions and jobs all reach the same service and the same check.
Tests for this live in `20-testing-strategy.md` §Authorisation matrix.
