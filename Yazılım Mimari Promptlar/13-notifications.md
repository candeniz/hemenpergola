# 13 — Notifications

## Principle

Notifications are emitted by **domain events**, never by UI code. A service that changes
state enqueues an event after commit; the notification module decides who hears about it and
through which channel. This is why a state change triggered by a job, a route handler and a
server action all notify identically.

```
service (in tx) ──commit──► enqueue(event) ──► notification.dispatch job
                                                 ├─ resolve recipients
                                                 ├─ apply preferences + quiet hours
                                                 ├─ render template (tr | en)
                                                 └─ send: in-app | push | email | SMS
```

## Channels

| Channel | Use | Notes |
|---|---|---|
| In-app | everything | always written, it is the notification history. Read through `GET /me/notifications` (`06`), rendered by the web inbox and the mobile one |
| Push | everything the inbox carries, on a device | `PushSender` port → Expo's push service (`19` §Processors). Android files it under the `default` channel the app creates; the message names that channel explicitly (13.4). Silent without credentials — a channel, not a spine (Q32) |
| Email | anything actionable or with a deadline | `Mailer` port, Resend or SMTP |
| SMS | disclosure, accept, offer sent, appointment reminder | costly and intrusive — a short list, opt-out except for security |

In-app is never suppressed; it is the record. **Preferences govern push, email and SMS**
(`NotificationPreference(userId, channel, type, enabled)` carries a `push` row like any
other) — `ADR-027`'s mandatory events ignore all three.

## Event catalogue

<!-- BEGIN GENERATED NOTIFICATION TABLE -->

<!-- Generated from src/modules/notification/domain/catalog.ts by
     scripts/generate-notification-table.mjs. Do not edit by hand:
     notification-catalog.test.ts fails when this drifts from the code. -->

| Event | Customer | Manufacturer | Channels |
|---|:--:|:--:|---|
| `offer_request_created` | ✓ | — | in-app, push, email |
| `offer_request_received` | — | ✓ | in-app, push, email, SMS |
| `offer_request_sla_reminder` | — | ✓ | in-app, push, email |
| `contact_disclosed` | ✓ | — | in-app, push, email, SMS **(mandatory)** |
| `offer_request_declined` | ✓ | — | in-app, push, email |
| `offer_request_expired` | ✓ | ✓ | in-app, push, email |
| `survey_scheduled` | ✓ | ✓ | in-app, push, email |
| `appointment_reminder` | ✓ | ✓ | in-app, push, SMS |
| `offer_received` | ✓ | — | in-app, push, email, SMS |
| `offer_revised` | ✓ | — | in-app, push, email |
| `offer_expiring` | ✓ | ✓ | in-app, push, email |
| `offer_accepted` | — | ✓ | in-app, push, email, SMS |
| `offer_rejected` | — | ✓ | in-app, push, email |
| `message_received` | ✓ | ✓ | in-app, push |
| `review_published` | — | ✓ | in-app, push, email |
| `review_responded` | ✓ | — | in-app, push, email |
| `review_rejected` | ✓ | — | in-app, push, email |
| `company_verified` | — | ✓ | in-app, push |
| `company_rejected` | — | ✓ | in-app, push |
| `price_book_published` | — | ✓ | in-app, push |
| `supply_gap_watch` | ✓ | — | — (standing intent, never dispatched) |

**(mandatory)** — `ADR-027`: no preference row can switch it off, because the
notification is a leg of the disclosure’s legal record (`19` §Disclosure).

The `auth.*` family is deliberately absent: password reset, new device and lockout are
direct security emails (`domain/templates.ts`), never `Notification` rows, and they ignore
preferences by construction.

<!-- END GENERATED NOTIFICATION TABLE -->

`contact_disclosed` telling the customer their contact details were shared is a KVKK
transparency obligation, not a courtesy (`19-security-and-kvkk.md`) — which is why it is the
one mandatory event.

## Preferences

`NotificationPreference(userId, channel, type, enabled)` — per type and channel (`push`,
`email`, `sms`; `in_app` has no row because it is never suppressed), editable in account
settings on the web and in the mobile app's own settings screen, and in
`super_admin_global_notification_settings` at the platform default level. Absence of a row
means enabled. Security and legal notices ignore preferences (`ADR-027`).

A device becomes an address for an account through `POST /me/push-tokens` and stops being
one through `DELETE /me/push-tokens` (`04` §PushToken, `06`). Sign-out deletes the token;
`19`'s retention sweep prunes what a flaky sign-out leaves.

Quiet hours: 22:00–08:00 `Europe/Istanbul` for SMS; queued, not dropped. Appointment
reminders and security alerts ignore quiet hours.

## Templates

- One template per (event, locale, channel), stored in the repo, not the database. They
  contain legal wording and belong in review and version control.
- Rendered with the recipient's `locale`, defaulting to `tr`.
- Every template has a plain-text part, a deep link into the app, and no tracking pixels.
- Money in emails is formatted from kuruş at render time; templates never receive floats.

## Delivery

- pg-boss job with exponential retry (1 m, 5 m, 30 m, 2 h, 6 h), then dead-letter with an
  admin alert.
- Idempotency key `(eventId, userId, channel)` — a retried job never double-sends.
- Bounces and complaints from the mail provider mark the address and stop non-critical mail;
  the user sees the state in settings.
- Delivery attempts are logged with status; the log holds the event type and recipient id,
  **not** the rendered body.

## Inbox

The in-app inbox (`/hesap/bildirimler`, and the mobile screen) is the newest fifty
notifications, newest first. It is a **reading list**, not the record — a point that only
matters once, and it matters then.

**An event that has been renamed leaves rows the build can no longer name, and the inbox
omits them.** Templates live in this repository rather than the database, so a rename is a
pure code change with no migration for rows already written; those rows keep the old string
and, because `ADR-027` exempts mandatory events from the ninety-day sweep, they keep it
indefinitely. On the day of the rename they are also the newest rows a user has.

The inbox hides them and the KVKK export carries them (`19` §Export), and the two answers are
consistent because the questions differ:

- the **export** answers a statutory access request and owes completeness. A row omitted
  there is data withheld from its subject, so it goes in with its type and its dates even
  when nothing can render it;
- the **inbox** owes intelligibility. Both surfaces render a row as `privacy.events.<type>`,
  so an unnamed row is a raw message key on screen; on mobile it is worse, because the tap
  target derives its destination from the type and would go nowhere. Inventing a generic
  label ("a notification") would put a row on screen that says nothing and leads nowhere,
  which is not a better answer than absence — and the subject can still see it, in full, in
  the export.

**Every event the inbox can show has a label, and a test holds it** (`notification-labels.test.ts`,
14.9). The catalogue above and the `privacy.events.*` namespace in `src/i18n/messages/{tr,en}.json`
are one list rendered twice, and the binding is asserted in both directions: an event added
without a label fails, and a label left behind by a rename fails. Nothing had kept them
aligned — `messages.test.ts` compares the two locales against each other, so a key missing
from both is invisible to it, and that is precisely the shape of the mistake, since one commit
adds the event and forgets both files together. Mobile is covered by the same assertion rather
than a second one: it imports these files through `@messages/*` (`I18N-01`, pinned in
`mobile-boundary.test.ts`), so there is one catalogue, not two.

**A row navigates on mobile and does not on the web, and the reason is the route maps**
(14.10). It is tempting to explain this as a difference in what an inbox *is* — an action
list on the phone, a record on the desktop — and that explanation would be invented after the
fact. The real reason is smaller and checkable: a notification's payload identifies an **offer
request**, expo-router has a route keyed by exactly that (`(musteri)/talep/[id]`,
`(uretici)/talep/[id]`), and the web map has none. The web surfaces sit under a parent the
notification has never carried — `hesap/projeler/[id]/talepler` needs the *project*,
`panel/[companyId]/talepler/[requestId]` needs the *company*.

**Resolving the parent id is cheap, and 14.10 said otherwise — that was wrong.**
`OfferRequest.projectId`, `.customerId` and `.companyId` are all non-null, so one query per
rendered page resolves every row's parent for both shells at once:
`findMany({ where: { id: { in: offerRequestIds } }, select: { id: true, projectId: true, companyId: true } })`.
Not per row, and not a join per render — one statement, on a primary key, for at most fifty
ids. The corrected cost of (a) is one query, one DTO field and a path map.

**What still stops it is the destination, not the price.** On the web a customer has no
per-request surface at all: `hesap/projeler/[id]/talepler` is the *list* of a project's
requests, and `/hesap/talepler` was removed from the navigation in 13.8 because it does not
exist (`25` §Q37, class (b)). So a `message_received` row would tell the reader they have a
message and land them on a list of requests with no message on it — a link *near* the thing,
which is worse than text because it looks like it worked. Mobile has `talep/[id]` and lands on
the request itself; that is the whole of the difference.

This makes the trigger precise, and it is not "some route keyed by a request": **build the
customer per-request surface (Q37 (b)) and option (a) becomes both cheap and correct.** Until
then the third option — a redirect route that resolves an id and bounces — would only move the
same wrong landing behind an extra hop.

### Which rows could be linked today, and why none of them are

Measured in 14.11, from the `notify()` call sites rather than the catalogue's samples:

| event | audience | ids in the payload | needs | resolvable today |
|---|---|---|---|---|
| `offer_request_created` | customer | `projectId` | `projectId` | **free** |
| `supply_gap_watch` | customer | `projectId`, `productId`, `cityId`, `districtId` | `projectId` | **free** |
| `contact_disclosed` | customer | `offerRequestId`, `companyId` | `projectId` | one batched query |
| `offer_request_declined` | customer | `offerRequestId` | `projectId` | one batched query |
| `offer_received`, `offer_revised` | customer | `offerRequestId` | `projectId` | one batched query |
| `offer_request_expired`, `survey_scheduled`, `message_received` | both | `offerRequestId` | `projectId` / `companyId` | one batched query |
| `appointment_reminder` | both | `appointmentId`, `offerRequestId` | ” | one batched query |
| `offer_expiring` | both | `offerId` | ” | two queries (`Offer` → `OfferRequest`) |
| `offer_request_received` | manufacturer | `offerRequestId`, `projectId` | `companyId` | one batched query |
| `offer_request_sla_reminder`, `offer_accepted`, `offer_rejected` | manufacturer | `offerRequestId` | `companyId` | one batched query |
| `company_verified`, `company_rejected`, `price_book_published` | manufacturer | `companyId` | `companyId` | **free** |
| `review_published`, `review_responded`, `review_rejected` | both sides | `reviewId`, `rating`/`reason`/`companyName` | a review surface | no target either way |

Five events are free of any query. Three of those are manufacturer-audience and therefore moot
on the web, where the manufacturer has no inbox at all (below). On the only web inbox that
exists, the free subset is exactly **two** events.

**And the free subset is not shipped on its own.** Two reasons, and the second is the one that
decides it. A list of identical dated rows where some are links and some are not gives the
reader no way to tell which is which before clicking — an unpredictable affordance is worse
than a uniform absence of one. And the two free rows are precisely the least useful
destinations: `offer_request_created` would return the customer to the request list they just
created, and `supply_gap_watch` is standing intent rather than an event, whose "destination" is
a project with no supply behind it. The batched query makes (a) available for every row at
once; there is no reason to special-case the two that need no query, and a good reason not to.

`notification-target-web.test.ts` pins the fact rather than the decision: if the web map ever
grows a route reachable from an offer request alone, it goes red, and this paragraph should be
reopened rather than the test deleted.

**On the web the manufacturer has no inbox at all** — `/hesap/bildirimler` is a customer
route, and nothing under `/panel/[companyId]` lists notifications. Mobile shows one screen to
both shells. That is a missing surface rather than a difference in behaviour, and it is
recorded as such (`25` §Open questions), not built here.

**The filter belongs in the query, not after the take.** Filtering the fifty rows after
fetching them spends the quota on rows that are then discarded: twelve orphans cost the
reader twelve real notifications, and fifty cost the whole screen — an inbox reporting
"empty" with readable rows directly beneath it. This was the shipped behaviour from 12.2
until 14.8.

## Digest

Message notifications collapse: first unread message notifies immediately, further messages
in the same thread within 15 minutes are folded into one digest. Manufacturers with more than
20 leads a day get a daily lead summary instead of per-lead email, switchable in preferences.
Without this the highest-value manufacturers mute the platform.
