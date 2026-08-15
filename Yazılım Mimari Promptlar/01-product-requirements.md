# 01 — Product Requirements

Requirements are IDs so tests and commits can reference them (`REQ-PRJ-04`).

## Categories (REQ-CAT)

- **CAT-01** Categories, products and options are database rows, never enum literals in code.
- **CAT-02** Seed set: Bioclimatic Pergola, Motorized Pergola, Retractable Pergola, Winter Garden,
  Sliding Glass, Guillotine Glass, Awning, Zip Screen, Outdoor Shading Systems, Other.
- **CAT-03** Admin can add a category/product/option without a deployment.
- **CAT-04** Categories are a tree (max depth 2 in V1) and carry SEO fields.

## Customer (REQ-CUS)

- **CUS-01** Register, verify email, log in, reset password, manage profile.
- **CUS-02** Create a project; save as draft; resume later; delete own draft.
- **CUS-03** Configure a project: product, dimensions, area, project type, installation type,
  options, location, photos, timing, notes.
- **CUS-04** Request offers on a valid project.
- **CUS-05** See ranked matching manufacturers with a per-manufacturer estimated price.
- **CUS-06** Filter, sort and compare (max 3 side-by-side) matches.
- **CUS-07** View a manufacturer's public profile and portfolio.
- **CUS-08** Select a manufacturer and send a contact / site-survey request, with explicit
  consent to share contact details (**KVKK**, see `19-security-and-kvkk.md`).
- **CUS-09** Track status of every request; receive notifications on state changes.
- **CUS-10** Message an accepted manufacturer.
- **CUS-11** View and accept/reject a final offer.
- **CUS-12** Save manufacturers; manage notification preferences.
- **CUS-13** Review a manufacturer only after an eligible completed engagement.

## Manufacturer (REQ-MFR)

- **MFR-01** Register a company; first user becomes company **Owner**.
- **MFR-02** Complete profile; upload verification documents; see verification state.
- **MFR-03** Manage which products it offers and which options per product.
- **MFR-04** Create price books, edit as draft, publish an immutable version, archive.
- **MFR-05** Define base m² price, minimum project price, option prices, regional adjustments, rules.
- **MFR-06** Define service areas by city, district, or radius around a point.
- **MFR-07** Receive matched requests; accept or decline within an SLA window.
- **MFR-08** See project data always; customer contact data **only after accept**.
- **MFR-09** Schedule a site survey; mark it completed.
- **MFR-10** Create and send a final offer with line items, tax and validity.
- **MFR-11** Mark won / lost. Manage portfolio, respond to reviews, invite team members.
- **MFR-12** View analytics: requests, accept rate, win rate, response time.

## Super Admin (REQ-ADM)

- **ADM-01** CRUD on categories, products, options, and their SEO fields.
- **ADM-02** Verify / reject / suspend manufacturers with a reason, recorded in the audit log.
- **ADM-03** Suspend customers. Impersonation is **not** in V1.
- **ADM-04** Monitor projects, offer requests, offers; read-only unless moderating.
- **ADM-05** Moderate reviews and handle complaints.
- **ADM-06** Configure matching weights and platform settings without deployment.
- **ADM-07** Manage CMS pages and SEO metadata.
- **ADM-08** Read the audit log, filterable by actor / entity / action.

## Pricing & estimates (REQ-PRC)

- **PRC-01** Estimates are computed per manufacturer from that manufacturer's published price
  book version. **Decision: per-manufacturer display** (`ADR-006`).
- **PRC-02** Every estimate is stored as an immutable snapshot including the price version id.
  Later price changes never alter a stored estimate.
- **PRC-03** The customer sees a **rounded band**, not the raw internal number, and never a
  competitor-readable line-item breakdown (`ADR-006`).
- **PRC-04** UI must state "Estimated price" and "Final price may change after technical inspection."
- **PRC-05** Estimates are shown **excluding KDV**, labelled as such. Final offers include KDV lines.
- **PRC-06** A manufacturer with no published price book can still be matched, shown as
  "Price on request", and is ranked below priced matches.

## Cross-cutting

- **SEC-01** Every protected operation is authorised server-side (`12-authentication-authorization.md`).
- **SEO-01** Public pages are server-rendered with slug, meta, canonical, JSON-LD (`18-cms-seo.md`).
- **AUD-01** Business-significant actions are audit-logged (`19-security-and-kvkk.md` §Audit).
- **I18N-01** No user-facing string is hardcoded in a component; all strings go through next-intl.

## Explicitly out of scope for V1

Mobile app · working payments · configurator rule engine · multi-currency · public API for
third parties · manufacturer-to-manufacturer features · real-time chat via WebSocket (polling
first, see `15-messaging.md`).
