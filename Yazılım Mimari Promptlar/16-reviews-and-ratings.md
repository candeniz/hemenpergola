# 16 — Reviews & Ratings

Reviews feed the matching score (`09-manufacturer-matching.md`) and the public profile, so
their integrity is a marketplace-integrity problem, not a content feature.

## Eligibility

A review is possible only when an `OfferRequest` reached `SURVEY_COMPLETED` or later
(`11-offer-request-lifecycle.md`). One review per `OfferRequest` — enforced by a unique
index, not by a UI check.

`GET /offer-requests/{id}/review/eligibility` returns `{ eligible, reason }`. Reasons that
block: engagement never reached survey, review already submitted, window closed.

Window: opens at `SURVEY_COMPLETED`, closes 90 days after the terminal state. Open-ended
review windows collect retaliation, not information.

**Deliberate choice:** a review does not require `WON`. A manufacturer who surveyed and then
disappeared is exactly the experience customers most need to be able to report.

## Content

```
ratingOverall, ratingQuality, ratingCommunication, ratingTimeliness   1..5 each
title           ≤ 100 chars
body            50..2000 chars
```

`ratingOverall` is entered, not derived — customers weigh dimensions differently and a
computed overall reads as dishonest when it disagrees with the sub-scores.

## Moderation

```
submit ──► PENDING ──► admin ──► PUBLISHED
                            └──► REJECTED (reason, notified, one appeal)
```

All reviews are moderated before publication in V1 (`super_admin_reviews_moderation`).
Rejection grounds are narrow and published in the help pages: personal data of third
parties, profanity, off-topic content, no evidence of a real engagement, or an obvious
conflict of interest. **A negative review is not a rejection ground.** A manufacturer
disputing a published review opens a complaint case; it does not get unpublished by request.

Target moderation SLA: 2 business days, tracked on the admin dashboard.

## Manufacturer response

One response per review (`ReviewResponse` unique on `reviewId`), no threading, published
immediately, moderatable after the fact. Publishing a response does not re-open the review
for editing.

## Aggregates

`Company.avgRating` and `reviewCount` are denormalised, recomputed by a job on publish,
reject or response. Public display rules:

- Show `avgRating` only from 3 published reviews onward; below that show "New on the
  platform" — an average of one is noise that decides rankings.
- Matching uses the Bayesian-smoothed value, always (`09-manufacturer-matching.md`).
- Profiles show the distribution and the sub-score breakdown, newest first, with a "verified
  engagement" badge on every review because every review is one.

## Anti-gaming

- No review without an `OfferRequest` that passed survey — no free-text reviews, ever.
- One customer account cannot review the same company more than twice in 12 months.
- Reviews from accounts that never verified their phone are held for stricter moderation.
- Sudden rating-velocity changes surface on the admin dashboard.
- Manufacturers cannot delete reviews, cannot pay for placement, and cannot see who is about
  to review them before publication.

## Editing and removal

The author may edit within 7 days of publication; the edit returns to `PENDING` and the
public copy is marked as edited. Deletion is available to the author (their personal data,
KVKK) and to admin with a reason; a deleted review is excluded from aggregates and the
company is notified so a mysterious rating change does not become a support ticket.
