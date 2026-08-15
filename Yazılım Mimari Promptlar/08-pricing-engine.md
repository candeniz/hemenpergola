# 08 — Pricing Engine

The engine turns (project, manufacturer price book) into one number, then into a band the
customer is allowed to see. It is pure, versioned and deterministic.

## Position

`calculateEstimate(project, priceBook)` is a **pure function** in
`modules/pricing/domain/engine.ts`. No DB access, no clock, no randomness. The application
service loads the inputs, calls it, persists a `PriceCalculation`, and returns a view model.
Everything about it is unit-testable without a database, and it is (`20-testing-strategy.md`).

## Resolving the contradiction in the brief

Brief §7 describes one estimated price; §32 describes `estimatedMin/Max/Median`. They are
different features and V1 builds the first:

- **Per manufacturer**, the engine produces exactly one net figure, then a rounded band
  around it for display (`PRC-01`, `PRC-03`).
- The **market aggregate** (min/max/median across manufacturers) exists only in the admin
  dashboard `super_admin_market_pricing_dashboard`, computed over stored
  `PriceCalculation` rows. It is never shown to customers or manufacturers (`ADR-006`).

## Inputs

From the project: `productId`, `areaM2` (or length/unit per `Product.basisType`),
`quantity`, selected `ProjectAttributeValue` rows, `cityId` / `districtId`.

From the price book (`PUBLISHED` only): `PriceBookItem` for the product,
`PriceBookOptionPrice` per selected option, `PriceBookRegionAdjustment`, `PriceBookRule` set.
These are the exact fields the manufacturer edits in `manufacturer_pricing_management`:
base price per m², minimum project value, per-option pricing with a mode, and a regional
surcharge table.

## Algorithm

```
1  basis        = areaM2 | lengthM | units          per Product.basisType
2  base         = item.basePriceKurus * basis * quantity
3  options      = Σ optionPrice(option, basis, base) for each selected priced option
4  setup        = item.setupFeeKurus ?? 0
5  subtotal     = base + options + setup
6  rules        = apply PriceBookRule set to subtotal, in ascending `kind` order
7  regional     = regionAdjustment(district ?? city) applied to (subtotal + rules)
8  net          = subtotal + rules + regional
9  net          = max(net, item.minProjectPriceKurus)      <- floor applies last
10 band         = round(net)  ->  { bandLow, bandHigh }
```

Option modes (mirroring the pricing screen):

| Mode | Formula |
|---|---|
| `FLAT` | `valueKurus` |
| `PER_M2` | `valueKurus * areaM2` |
| `PER_M` | `valueKurus * perimeterM` (derived from width/depth) |
| `PER_UNIT` | `valueKurus * quantity` |
| `PERCENT` | `base * percent / 100` |

`PriceBookRule.kind` covers the volume and size cases: `AREA_DISCOUNT`,
`VALUE_DISCOUNT`, `SIZE_SURCHARGE`, `HEIGHT_SURCHARGE`. Each has a threshold window and a
`FLAT` or `PERCENT` effect. Rules are additive against the subtotal, never compounding on
each other, so ordering cannot change the result — that is deliberate; compounding rules are
how price engines become unexplainable.

Regional adjustment supports both `FLAT` (the design shows `+₺10,000` for Kocaeli) and
`PERCENT`. District overrides city when both match.

### Arithmetic rules

- Everything in integer kuruş. Division rounds **half away from zero**, applied once at the
  end of each named step, never mid-expression.
- Percentages are integers of basis points internally (`percent * 100`) to avoid a second
  rounding site.
- KDV is **not** applied. Estimates are net (`PRC-05`). The tax line appears only on a real
  `Offer` (`11-offer-request-lifecycle.md`).

## Band computation (`PRC-03`)

```
bandWidth = max(net * BAND_PERCENT, BAND_MIN_KURUS)
bandLow   = floorTo(net - bandWidth/2, ROUND_STEP)
bandHigh  = ceilTo (net + bandWidth/2, ROUND_STEP)
```

`BAND_PERCENT` (default 10%), `BAND_MIN_KURUS` and `ROUND_STEP` (default ₺500) are
`PlatformSetting` rows, admin-editable without deployment (`ADM-06`). The band exists so a
customer sees a usable number while a competitor cannot read a manufacturer's price book off
the results page by probing configurations.

What each audience sees:

| Audience | Sees |
|---|---|
| Customer | `bandLow–bandHigh`, "Estimated, excl. KDV", no line items |
| Owning manufacturer | full `breakdown` for its own calculations, plus the simulator |
| Other manufacturers | nothing |
| Admin | full breakdown and the market aggregate |

## Failure modes

| Condition | Result |
|---|---|
| No published price book | `priceOnRequest: true`, match still returned, ranked below priced (`PRC-06`) |
| Product not in the price book | same as above, logged as a catalogue gap for the manufacturer |
| Selected option has no price row | option contributes 0 and the calculation is flagged `incomplete` in `breakdown`; still shown |
| Basis missing (no area/length) | `PRECONDITION` — the project is not `READY`, blocked earlier by validation |
| Engine throws | match returned without a price, `system_error_price_unavailable` state, error logged with `engineVersion` |

A pricing failure never removes a manufacturer from the results. Matching and pricing fail
independently — that separation is the point of `09-manufacturer-matching.md`.

## Versioning and immutability

- `PriceCalculation` stores `priceBookVersion` and `engineVersion` and is never updated
  (`PRC-02`). Republishing a price book does not move an old estimate.
- `engineVersion` is a constant bumped whenever the formula changes. A change to the formula
  without a bump is a defect, because it silently invalidates comparisons across time.
- The stored `breakdown` JSON records every step above with its inputs, so any number can be
  explained months later without re-running anything.

## Anti-scraping

Every calculation writes `actorUserId` and `requestIp`. Rate limits are in
`06-api-specification.md`. Detection heuristic (admin alert, not automatic blocking):
one actor producing many calculations against the same company across systematically varied
dimensions. Manufacturers may set `priceOnRequest` on their company to opt out of display
entirely while remaining matchable.

## Simulator

`POST /companies/{id}/price-books/{id}/simulate` runs the same pure function against a draft
book and returns the **full breakdown** — same company, `price_book.read`, no leak. This is
the screen's "Simulator" panel, and it is the only supported way to check a price book
before publishing. Publishing to test is not a workflow.
