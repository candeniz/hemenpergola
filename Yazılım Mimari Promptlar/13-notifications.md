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
                                                 └─ send: in-app | email | SMS
```

## Channels

| Channel | Use | Notes |
|---|---|---|
| In-app | everything | always written, it is the notification history |
| Email | anything actionable or with a deadline | `Mailer` port, Resend or SMTP |
| SMS | disclosure, accept, offer sent, appointment reminder | costly and intrusive — a short list, opt-out except for security |
| Push | — | not in V1, arrives with the mobile app |

In-app is never suppressed; it is the record. Preferences govern email and SMS only.

## Event catalogue

| Event | Customer | Manufacturer | Channels |
|---|---|---|---|
| `offer_request.created` | confirmation | new lead | in-app, email; SMS to manufacturer |
| `offer_request.sla_reminder` | — | 50% / 90% of window | in-app, email |
| `offer_request.accepted` | accepted + **contact shared with X** | — | in-app, email, SMS |
| `offer_request.declined` | declined, suggest others | — | in-app, email |
| `offer_request.expired` | expired, suggest others | expired, affects response time | in-app, email |
| `appointment.scheduled` / `rescheduled` | ✓ | ✓ | in-app, email |
| `appointment.reminder` (24 h, 2 h) | ✓ | ✓ | in-app, SMS |
| `offer.sent` | new offer, validity date | — | in-app, email, SMS |
| `offer.expiring` (48 h before) | ✓ | ✓ | in-app, email |
| `offer.accepted` / `offer.rejected` | — | ✓ | in-app, email, SMS on accept |
| `message.received` | ✓ | ✓ | in-app; email digest after 15 min unread |
| `review.published` | — | ✓ | in-app, email |
| `review.responded` | ✓ | — | in-app, email |
| `company.verified` / `rejected` | — | ✓ | in-app, email |
| `price_book.published` | — | ✓ (confirmation to the publisher) | in-app |
| `auth.*` (reset, new device, lockout) | ✓ | ✓ | email, always on |

`offer_request.accepted` telling the customer their contact details were shared is a KVKK
transparency obligation, not a courtesy (`19-security-and-kvkk.md`).

## Preferences

`NotificationPreference(userId, channel, type, enabled)` — per type and channel, editable in
account settings and in `super_admin_global_notification_settings` at the platform default
level. Security and legal notices ignore preferences.

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
