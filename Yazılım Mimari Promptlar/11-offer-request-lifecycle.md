# 11 — Offer Request Lifecycle

This is the state machine the whole product hangs on. It owns two things nothing else may
touch: **when contact data is disclosed** and **when money becomes a commitment**.

## States

```
                     ┌──────────► DECLINED ──────────┐
                     │                               │
PENDING ─────────────┤                               ▼
   │  (accept)       └──► EXPIRED ─────────────► CLOSED
   ▼                                                 ▲
ACCEPTED ──► SURVEY_SCHEDULED ──► SURVEY_COMPLETED ──┤
   │                                    │            │
   │                                    ▼            │
   └──────────────────────────────► OFFER_SENT ──────┤
                                        │            │
                            ┌───────────┴──────────┐ │
                            ▼                      ▼ │
                     OFFER_ACCEPTED          OFFER_REJECTED
                            │                      │
                            ▼                      │
                           WON ────────────────────┴─► LOST
```

| State | Meaning | Contact visible to manufacturer |
|---|---|---|
| `PENDING` | sent, awaiting response inside the SLA window | **no** |
| `ACCEPTED` | manufacturer took the lead | **yes**, from this moment |
| `DECLINED` | manufacturer declined with a reason | no |
| `EXPIRED` | SLA elapsed with no response | no |
| `SURVEY_SCHEDULED` / `SURVEY_COMPLETED` | site survey booked / done | yes |
| `OFFER_SENT` | formal offer delivered, with KDV and validity | yes |
| `OFFER_ACCEPTED` / `OFFER_REJECTED` | customer decided | yes |
| `WON` / `LOST` | final commercial outcome, recorded by the manufacturer | yes |
| `CANCELLED` | customer withdrew before acceptance | no |
| `CLOSED` | terminal bucket for expired/declined/cancelled after archiving | no |

## Transition table

| From | Event | To | Actor | Guards |
|---|---|---|---|---|
| — | `create` | `PENDING` | customer | project `READY`, consent recorded, ≤ 5 companies, company `VERIFIED` |
| `PENDING` | `accept` | `ACCEPTED` | manufacturer | within SLA, `offer_request.respond`, company not suspended |
| `PENDING` | `decline` | `DECLINED` | manufacturer | reason required |
| `PENDING` | `expire` | `EXPIRED` | system job | `now > slaExpiresAt` |
| `PENDING` | `cancel` | `CANCELLED` | customer | — |
| `ACCEPTED` | `schedule` | `SURVEY_SCHEDULED` | manufacturer | `scheduledAt` in the future |
| `SURVEY_SCHEDULED` | `complete` | `SURVEY_COMPLETED` | manufacturer | `scheduledAt` in the past |
| `SURVEY_SCHEDULED` | `reschedule` | `SURVEY_SCHEDULED` | either | both notified |
| `ACCEPTED` / `SURVEY_*` | `send_offer` | `OFFER_SENT` | manufacturer | ≥ 1 line, `validUntil` future, `taxRate` set |
| `OFFER_SENT` | `accept_offer` | `OFFER_ACCEPTED` | customer | offer not expired |
| `OFFER_SENT` | `reject_offer` | `OFFER_REJECTED` | customer | reason optional |
| `OFFER_SENT` | `revise` | `OFFER_SENT` | manufacturer | previous offer superseded, both versions kept |
| `OFFER_ACCEPTED` | `mark_won` | `WON` | manufacturer | — |
| `OFFER_REJECTED` / `OFFER_ACCEPTED` | `mark_lost` | `LOST` | manufacturer | reason required |

Everything else is a `CONFLICT` error. There is no admin override that skips a guard; an
admin can `CLOSED` a stuck request, with a reason, and that is all
(`17-admin-system.md`).

## Implementation

```ts
// modules/offer/domain/state-machine.ts — pure, no IO
transition(current: Status, event: Event, ctx: GuardContext): Result<Status, DomainError>
```

The application service is the only caller. It runs inside one transaction:

```
1 load request FOR UPDATE
2 transition(...)              -> new status or CONFLICT
3 apply side effects in-tx     (disclosure row, appointment, offer, audit log)
4 enqueue notifications        (after commit, never inside)
```

Concurrency: two manufacturer users clicking accept and decline simultaneously — the row
lock plus the state machine makes one of them a `409`, not a corrupted record.

## Contact disclosure (the KVKK boundary)

Disclosure happens **exactly once**, at `PENDING → ACCEPTED`, and:

1. requires an existing `Consent(type=CONTACT_SHARING)` captured at request creation, with
   its `textVersion`;
2. writes a `ContactDisclosure` row naming the exact fields released;
3. writes an `AuditLog` entry;
4. notifies the customer that their details were shared, with whom, and when.

Before that moment the manufacturer sees project data only: product, dimensions, options,
district, timing, photos — never name, phone, email, or exact address. This is enforced in
the application service by returning a different DTO, not by hiding fields in the UI.
`manufacturer_request_detail_new_lead` and `manufacturer_request_detail` are the two DTOs
rendered (`07-frontend-architecture.md`).

Consent revocation does not un-share what was shared; it stops future disclosures and is
recorded. Say this plainly in the consent text.

## SLA

`slaExpiresAt = createdAt + PlatformSetting('offer_request.sla_hours')`, default 48 h,
business-hours aware for `Europe/Istanbul`. A `offer_request.sla_expire` job is scheduled at
creation.

- Reminder to the manufacturer at 50% and 90% of the window.
- On expiry: auto-decline, both parties notified, response-time analytics updated.
- The customer sees the countdown too. A one-sided countdown is a trust problem.

Expiry never blocks the customer: they may select additional manufacturers from the same
`MatchRun` at any time, up to the per-project cap.

## Offers and KDV

`Offer` carries `netKurus`, `taxRate`, `taxKurus`, `grossKurus` and line items. Rules:

- `taxRate` defaults from `PlatformSetting('tax.kdv_default')` (20%) and is editable, because
  rates change and some line items differ.
- `netKurus = Σ lineNetKurus`; tax computed once on the net total, not per line, then
  `grossKurus = netKurus + taxKurus`. Per-line tax rounding drifts against the total.
- The offer UI must show the estimate the customer originally saw alongside the offer, with
  the note that the estimate was net of KDV (`PRC-05`). The gap between estimate and offer is
  the single most predictable complaint; explaining it in place is cheaper than answering it.
- `number` is a human-readable sequence per company (`GSF-2026-0042`), unique platform-wide.
- A revised offer supersedes but never overwrites: both are retained and both are visible.

## Terminal outcomes and what they unlock

- `SURVEY_COMPLETED` or later makes the engagement **review-eligible**
  (`16-reviews-and-ratings.md`).
- `WON` / `LOST` feed manufacturer analytics (`MFR-12`) and the win-rate component of
  matching (`09-manufacturer-matching.md`).
- `WON` is the platform's value metric and, when monetisation arrives, the natural billing
  event — which is why the state exists in V1 even though nothing charges for it
  (`ADR-010`).

## Disintermediation

Once contact is disclosed the parties can transact off-platform, and some will. V1 does not
fight this with restrictions; it makes staying on-platform the easier path: offers, messages,
appointments, documents and the review in one place. What V1 *does* do is record enough — the
disclosure, the survey, the offer, the outcome — that a later lead-credit or commission model
has a real event stream to attach to instead of an inference.
