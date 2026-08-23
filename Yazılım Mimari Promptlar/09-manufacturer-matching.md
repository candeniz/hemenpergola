# 09 — Manufacturer Matching

Matching answers "who can actually do this job", and only then does pricing answer "for how
much". The two run in one request but are independent: a pricing failure never removes a
match (`08-pricing-engine.md` §Failure modes).

## Pipeline

```
Project ──► 1 eligibility filter (SQL, hard) ──► 2 scoring (SQL + app) ──► 3 pricing
        ──► 4 ranking ──► MatchRun + MatchResult[]
```

Persisted as a `MatchRun` so revisiting `/hesap/projeler/[id]/eslesmeler` does not recompute
(`05-system-architecture.md` §Caching). Recompute only when the project changes or the
customer explicitly re-runs.

## 1. Eligibility — hard filters

A company is a candidate only if **all** hold:

1. `Company.status = VERIFIED` and not soft-deleted.
2. `CompanyProduct` exists and `isActive` for `project.productId`.
3. A `ServiceArea` covers the project location.
4. Every project option marked `isRequired` on the product is offered
   (`CompanyProductOption.isOffered`).
5. The company is not `SUSPENDED` and has not blocked this customer.

Not filters: price, rating, response time. Those are scoring inputs. Filtering by them
produces an empty results page for exactly the customers who most need results.

### Service-area coverage (`ADR-002`, `ADR-025`)

```sql
-- CITY
sa.kind = 'CITY'     AND sa.city_id     = :cityId
-- DISTRICT
sa.kind = 'DISTRICT' AND sa.district_id = :districtId
-- RADIUS: two ST_DWithin calls, and the order is the point (ADR-025)
sa.kind = 'RADIUS'
  AND ST_DWithin(sa.center_point, :projectPoint, 500000)              -- constant → GiST
  AND ST_DWithin(sa.center_point, :projectPoint, sa.radius_km * 1000) -- exact, per row
```

`geography` columns, GiST index on `center_point`, metres. The project point comes from the
district centroid when the customer gave no precise location — good enough for a radius
test, and the customer is told the match used their district.

**Why two calls.** The single-call version this section used to show —
`ST_DWithin(…, sa.radius_km * 1000)` — cannot use the GiST index: the expansion distance is
a column of the indexed table, and an index condition must be constant with respect to the
scanned relation, so EXPLAIN demotes the predicate to a row filter and the scan is
sequential. The constant first call is the index condition
(`center_point && _st_expand(:point, 500000)`); the per-row second call is the exact test
the first one over-approximates. The 500 km ceiling is safe because migration 7's
`ServiceArea_radiusKm_range` CHECK makes `radius_km` ≤ 500 a property of the *data*, not of
a validation layer. `ADR-025` records the decision and the alternatives.

## 2. Scoring

Score is 0–100, a weighted sum of normalised components:

| Component | Weight | Source |
|---|---:|---|
| Proximity | 25 | distance company ↔ project, normalised over the service radius |
| Capability match | 20 | share of selected options actually offered |
| Rating | 20 | `avg(Review.ratingOverall)`, Bayesian-smoothed |
| Responsiveness | 15 | median accept/decline time over the last 90 days |
| Win/completion history | 10 | completed engagements, log-scaled |
| Portfolio depth | 5 | portfolio items for this product |
| Freshness | 5 | price book and profile recency |

Weights are `PlatformSetting` rows (`ADM-06`), versioned as `weightsVersion` and stored on
`MatchRun`, so a ranking can be explained after the weights change.

Rules that keep the score honest:

- **Bayesian rating.** `(C*m + Σratings) / (C + n)` with prior `m` = platform mean and
  `C` ≈ 5. A single 5-star review must not outrank fifty 4.8s.
- **New companies are not buried.** A verified company with no history gets the prior, not
  zero, plus a bounded newcomer allowance for its first 30 days. Otherwise no new
  manufacturer can ever get a first lead, and the supply side never grows.
- **Price is not in the score.** It is a sort option the customer chooses. Ranking by price
  by default turns the marketplace into a race to the bottom and makes the estimate the
  product rather than the match.
- **No paid placement in V1.** When monetisation arrives it must be a labelled slot, not a
  weight (`ADR-010`).

## 3. Pricing pass

For each candidate, load the single `PUBLISHED` price book and call the engine. Results
without a price get `priceOnRequest: true` and sort below priced results within the same
score tier (`PRC-06`).

## 4. Ranking and limits

```
ORDER BY priceOnRequest ASC, score DESC, distanceKm ASC, companyId ASC
```

Deterministic — `companyId` breaks ties so the same run never reorders between page loads.

- Default page: top 20, cursor-paginated.
- A customer may send an offer request to at most **5** companies per project
  (`PlatformSetting`), preventing spray-and-pray that trains manufacturers to ignore leads.
- Comparison is capped at 3 side by side (`CUS-06`, `compare_manufacturers_refined_style`).

## Zero-result handling

Never render an empty list silently (`03-user-flows.md` §Failure paths). In order:

1. Re-run with radius filters widened by one step and label the results as widened.
2. Show verified companies that serve the area but do not offer the exact product, as
   "may be able to help", clearly separated.
3. Offer "notify me when a manufacturer covers my area", stored as a `Notification`
   subscription, and surface the gap in `super_admin_platform_metrics_analytics` — repeated
   zero-result districts are the supply-acquisition backlog.

## Explainability

`MatchResult.scoreBreakdown` stores each component's raw and weighted value. The customer UI
shows a short human reason ("Serves your district · 4.8 from 32 reviews · usually replies in
4 hours"), never the numbers. Admin sees the full breakdown. A ranking nobody can explain to
a manufacturer who asks "why am I fourth" is a support burden that compounds.

## Performance

Single SQL query for filter + aggregate score inputs, then in-process weighting and pricing.
Target p95 ≤ 2.5 s end to end for ≤ 200 candidates. Denormalised aggregates
(`Company.avgRating`, `reviewCount`, `medianResponseMinutes`) are maintained by jobs, not
computed per request. If candidate counts grow past a few thousand per district, the fix is a
materialised view, not a search cluster (`00-project-overview.md` §Non-goals).
