# 10 — Project Configurator

The configurator is the wizard that produces a `Project` complete enough to match and price.
It is the highest-traffic authoring surface in the product and the biggest scope trap in the
brief.

## What V1 builds (`ADR-008`)

A **schema-driven form**, not a rules engine. The server loads
`Product` → `ProductAttribute[]` → `ProductOption[]` and renders fields from those rows. Adding
a product or an option is a data change, no deployment (`CAT-03`).

Not in V1: `ConfiguratorQuestion` / `ConfiguratorRule` from brief §27 — conditional question
graphs, cross-option compatibility rules, dynamic pricing rules per answer. The tables are
modelled, the admin screen `super_admin_configurator_builder` exists as a design, and neither
is built. Every product in the seed catalogue is expressible as a flat attribute set, so the
engine would carry cost with no V1 payoff.

The one exception, which is not a rules engine: an attribute may declare
`showIfAttributeKey` + `showIfValue` for simple one-level dependency (e.g. show "motor brand"
only when "motorised" is true). One level, no chaining, evaluated client- and server-side
from the same data.

## Step structure — resolving the two designs

The screens disagree. `dimensions_area_step_2` / `project_options_step_5` /
`project_summary_step_10` show a 10-step flow; `create_project_wizard_refined_style` shows
three (Product Selection → Technical Specs → Summary). The refined screen is the later
direction and the better one: ten steps on a mobile form is where drop-off happens.

**Decision:** three visible stages, ten logical steps, one progress indicator showing stages.

| Stage | Steps | Data written |
|---|---|---|
| 1 · Product | 1 category, 2 product | `productId` |
| 2 · Specs | 3 dimensions, 4 project type, 5 installation type, 6 options, 7 location, 8 timing | dimensions, attributes, city/district/point, timing |
| 3 · Review | 9 attachments + notes, 10 summary | attachments, note, then submit |

Each step persists immediately (`PATCH /projects/{id}`). Server state, not client state
(`07-frontend-architecture.md` §Forms). "Save Draft" is therefore already true at all times;
the button exists to reassure, and to exit.

## Field specifics from the designs

- **Dimensions in millimetres**, entered as width / projection / height, outer-to-outer.
  Area is **derived and displayed live** (`width × projection`), stored as `areaM2`
  alongside the raw `*Mm` values. The customer never types the area — a typed area that
  disagrees with the dimensions is a support ticket waiting to happen.
- **Location** is city + district, optionally a map point. The copy in the screens explains
  why (wind/snow load, logistics), and that copy earns the field: asking for location without
  a reason lowers completion.
- **Options** are `ProductAttribute` rows of type `MULTISELECT` rendered as cards. The
  designs show a price next to each option — V1 does **not**, because option prices are
  per manufacturer and no manufacturer has been chosen yet (`ADR-006`). Show the option and
  its description; price appears at the results step, as a band.
- **Attachments** accept photos and documents (`site_plan_v2.pdf` in the summary screen), so
  the model is `ProjectAttachment(kind: PHOTO|DOCUMENT)`. Limits in `14-file-storage-and-media.md`.
- **Summary** shows every value with an "edit" jump back to its step, then `GET OFFERS`.

## Validation

Two layers, one schema:

1. **Per-step Zod schema** — the client validates on blur, the server validates on `PATCH`.
   A step may be saved incomplete; a draft is allowed to be invalid.
2. **Readiness check** (`POST /projects/{id}/validate`) — the whole-project rule set that
   promotes `DRAFT` → `READY`. Only a `READY` project can request offers.

Readiness rules:

- product set; all `isRequired` attributes answered
- dimensions within `ProductAttribute.min`/`max`; area > 0 and ≤ platform maximum
- city and district set and resolvable to a point
- installation type and project type set
- attachments within count/size limits
- customer email verified; phone verified before contact disclosure (`03-user-flows.md` §F2)

`validate` returns `{ ready, issues[] }` where each issue carries the step it belongs to, so
the summary screen can link directly to the offending field.

## Anonymous drafts

A visitor can configure without an account. The wizard creates a `Project` with
`anonymousKey` (httpOnly cookie, 30-day TTL), and no `customerId`.

On register/login, `POST /projects/{id}/claim` attaches the draft. Rules: a key claims at
most 3 drafts; claiming requires the cookie to still match; unclaimed anonymous drafts are
purged after 30 days (`19-security-and-kvkk.md` §Retention). Offers cannot be requested
anonymously — the account wall sits between "configure" and "get offers", which is the point
in the funnel where intent is highest.

## Reuse

"Duplicate project" copies everything except attachments and status. Customers who compare
two sizes of the same pergola should not retype ten steps; this is cheap and prevents a
second class of half-filled drafts.

## Admin authoring

Attributes and options are managed in `super_admin_product_catalog_management`
(`17-admin-system.md`). Changing an attribute after projects exist:

- adding an optional attribute — safe
- adding a required one — applies to new projects only; existing `READY` projects stay valid
- deactivating an option — hidden from new projects; existing `ProjectAttributeValue` rows
  keep referencing it and still render

Never delete a `ProductOption` that has been referenced. Deactivate. History has to stay
readable, including inside a `PriceCalculation.breakdown` from six months ago.
