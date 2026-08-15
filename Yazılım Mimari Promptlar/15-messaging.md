# 15 — Messaging

## Scope

One thread per `OfferRequest`, two participants: the customer and the manufacturer company
(any member with `message.send`). No group threads, no attachments in V1, no manufacturer-to-
manufacturer messaging.

A thread exists only when the request reaches `ACCEPTED`. Before that the manufacturer has
no contact channel at all — messaging is not a side door around
`11-offer-request-lifecycle.md` §Contact disclosure.

## Transport: polling, not WebSocket (`ADR-009`)

```
GET /offer-requests/{id}/messages?after=<messageId>
```

- 5 s interval while the thread is focused, 30 s in the background, stopped on hidden tab.
- Returns only messages after the cursor, so the steady state is a small empty response.
- Unread counts come from the same dashboard query the page already runs.

Why not WebSocket: this is scheduled B2C-to-B2B correspondence measured in hours, not chat.
Sockets would add a stateful component to an otherwise stateless deployment
(`05-system-architecture.md`) for latency nobody in this flow perceives. Revisit only with
evidence from real usage; the API shape above does not change if the transport does.

## Model

```
Thread(id, offerRequestId unique)
Message(id, threadId, senderUserId, body, sentAt, readAt?)
```

`readAt` is per message, set by `POST .../messages/read { upTo }`. Read state is
per-participant-side: the customer marks manufacturer messages read and vice versa; any
company member reading marks it read for the company, because the customer cares that "the
company" saw it.

## Rules

- Plain text, 4000 characters, stored raw and rendered escaped. No HTML, no markdown.
- Rate limit 60 messages/hour/thread (`06-api-specification.md`).
- Sending is blocked in `EXPIRED`, `DECLINED`, `CANCELLED`, `CLOSED`, `WON`, `LOST` — the
  thread stays readable, permanently, because it is part of the engagement record.
- Editing and deleting are not offered. An offer negotiation transcript that can be rewritten
  is worth nothing in a dispute.
- Messages are included in a complaint case when a party escalates
  (`17-admin-system.md` §Complaints), and that admin access is audit-logged as a disclosure.

## Contact-detail leakage

Customers routinely paste phone numbers, and after `ACCEPTED` that is fine — contact is
already disclosed. Before `ACCEPTED` there is no thread, so there is nothing to filter. V1
therefore does **no** content filtering. It is a false-positive machine that breaks legitimate
messages ("the site is at 34. sokak") and protects nothing that the lifecycle does not already
protect.

## Notifications

First unread message notifies immediately in-app; email follows if still unread after 15
minutes, then collapses into a digest (`13-notifications.md` §Digest).

## Screens

`customer_messages_arte_outdoor` is the customer view. The manufacturer side lives inside
`manufacturer_request_detail` rather than as a separate inbox — a manufacturer reading a
message needs the project and the offer in the same view, and a standalone inbox would split
that context.
