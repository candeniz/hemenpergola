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

## Digest

Message notifications collapse: first unread message notifies immediately, further messages
in the same thread within 15 minutes are folded into one digest. Manufacturers with more than
20 leads a day get a daily lead summary instead of per-lead email, switchable in preferences.
Without this the highest-value manufacturers mute the platform.
