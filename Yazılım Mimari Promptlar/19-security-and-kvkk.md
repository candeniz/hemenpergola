# 19 — Security & KVKK

The brief never mentions KVKK. It has to be here anyway: the core flow transfers a named
person's contact details to a commercial third party in Turkey. Retrofitting consent,
retention and disclosure records after launch means rewriting the lifecycle module and
re-contacting every user. Doing it now costs a few tables.

## KVKK model

| Concept | This platform |
|---|---|
| Data controller | the platform operator, for platform data |
| Separate controller | each manufacturer, for contact data disclosed to it |
| Data subjects | customers, manufacturer users |
| Legal basis — account | contract performance |
| Legal basis — contact disclosure | **explicit consent**, per request |
| Legal basis — audit/finance | legal obligation |
| Legal basis — marketing | separate, revocable consent |

Contact disclosure is a transfer to another controller, which is exactly why it needs its own
explicit, versioned, revocable consent rather than a blanket terms acceptance.

### Consent

```
Consent(id, userId, type: CONTACT_SHARING|MARKETING|TERMS, textVersion,
        grantedAt, revokedAt?, ip, userAgent)
```

- Captured at offer-request creation with the **exact text version** shown
  (`06-api-specification.md`: `consent.accepted !== true` → 422).
- Never pre-checked, never bundled with terms acceptance, never inferred from continued use.
- Revocable in account settings. Revocation stops future disclosures; it cannot recall what
  was already shared, and the consent text says so.
- The consent text lives in the repo, versioned; changing it creates a new `textVersion`.

### Disclosure record

Every release of personal data writes `ContactDisclosure` (who, what fields, when, under
which consent) and an `AuditLog` row, and notifies the data subject
(`13-notifications.md`). Three surfaces disclose: request acceptance, admin reveal of masked
contact details, and admin access to a message thread through a complaint case. All three
are logged identically.

### Data subject rights

| Right | Implementation | SLA |
|---|---|---|
| Access / portability | `/hesap/verilerim` → JSON + PDF export job, emailed as a signed link | 30 days, target 72 h |
| Rectification | profile editing; admin correction with reason | immediate |
| Erasure | account deletion request → verification → anonymisation job | 30 days |
| Objection / restriction | consent revocation, notification preferences | immediate |
| Complaint | contact route in the privacy notice | — |

### Export — what goes in, and the one thing that does not

The package is the answer to an access request, so the rule is simple and the exception is
argued rather than assumed: **data the erasure right reaches, the access right reaches.**
`performAnonymisation` deletes `NotificationPreference`, `Notification` and `PushToken`
alongside the profile, which settles all three — they are personal data by this system's own
reckoning, and an export that omitted them would answer a narrower question than the one
asked. They are in the package and in the PDF (task 14.5, closing `Q33`).

**The raw push token is not.** A `PushToken` row is disclosed — platform, when it was
registered, when it was last seen — but the token string itself is withheld, and the PDF says
so in as many words rather than leaving a silent gap. The reasoning:

- the token is a **live capability**, not a description of one. Whoever holds it can send a
  notification to that handset; it is closer to a session token than to a phone number;
- the export **leaves our custody** — a file behind a signed link, in an inbox, for 30 days;
- what the right owes is knowledge of the processing, and "you have an Android device
  registered, last seen on the 20th" discloses that completely. An opaque
  `ExponentPushToken[…]` string tells the subject nothing further they can act on;
- §Data minimisation applies to *our* answer as much as to our collection.

This is a redaction of an internal identifier on security grounds, not a refusal of the
right. `privacy.integration.test.ts` asserts both halves: the device appears, the address
does not.

**Notifications are exported as they were received, not as they were built.** The package
carries each notification's rendered title and body, in the subject's own locale — the
language it was delivered in — and drops the raw `payload`. A payload is the template's
input; `{"offerRequestId":"cmt…","areaM2":42}` answers an access request with a machine's
working notes, and the right asks for an intelligible copy. Nothing is lost: what the payload
means reaches the reader through the rendered text, and the identifiers that do not are
already in the package's `offerRequests` section, where they can be correlated.

**Every field a notification payload carries passes the same test messages pass:** it must
not be the other side's personal data. An export leaves our custody, so a payload that
carried a customer's name or address would disclose it to whoever holds the file — and, worse,
would do so *before* acceptance for the one event that reaches an un-disclosed manufacturer.
The payloads satisfy this today (`offer_request_received` carries a city, an area and an id),
but they had never been held to it, and a rule that holds by accident holds until the next
field. Two name-shaped fields are on the allowed list and both are argued rather than
assumed: `companyName` is a manufacturer's public directory name, and `senderName` appears
only on `message_received`, which `ADR-028` opens at acceptance — after the disclosure record
and its notification. `notification-catalog.test.ts` pins the vocabulary and fails on a new
key, so adding one asks the question out loud: whose data is this, and has the subject
already been told?

**Erasure is anonymisation, not deletion.** `User` becomes `deleted-{hash}@anonymised.local`
with personal fields nulled; projects, offers, reviews and audit rows keep their ids and
lose their identifiers. Financial and audit records are retained on legal-obligation basis.
Hard-deleting a customer would destroy a manufacturer's commercial record of a real
transaction, which is not what erasure requires.

### Retention

| Data | Retention |
|---|---|
| Active account data | while the account lives |
| Anonymous project drafts | 30 days |
| Closed/lost offer requests | 3 years, then anonymised |
| Won engagements and offers | 10 years (commercial/tax) |
| Consent and disclosure records | 10 years — they are the evidence |
| Audit log | 2 years hot, then cold archive |
| Notification delivery logs | 90 days |
| Device push tokens (`PushToken`) | 180 days idle, by `lastSeenAt` |
| Access logs | 12 months |
| Uploaded project photos | with the project; EXIF stripped on upload |

Enforced by the `audit.retention_sweep` job, not by manual cleanup.

### Data location

Application, database, backups and object storage in the EU or Turkey. Any third-party
processor (mail, SMS, **push**, geocoding, error tracking) is listed in the privacy notice
with its purpose, and each needs a processor agreement before it is wired in. No customer
personal data is sent to a processor for a purpose the notice does not name.

**Expo's push service is a processor** and is in this chain, not beside it (`29` §A7, Phase
12). It handles two classes of personal data: the device token, which identifies an
installation and is stored as `PushToken` (`04`), and the *rendered notification content*,
which carries names and amounts on its way to Apple's and Google's delivery networks. That
content leaves the EU/TR perimeter, which is exactly what makes it a processor question
rather than a transport detail. Same rule as the others: no agreement, no connection —
`PushSender` is the port, and its adapter is the seam where the decision is enforced.

## Application security

**Input.** Every boundary validates with Zod — server actions, route handlers, job payloads.
Prisma parameterises; the two or three raw PostGIS queries use tagged parameters, never
string interpolation.

**Output.** React escapes by default; `dangerouslySetInnerHTML` is banned outside the
sanitised CMS renderer (`18-cms-seo.md`). SVG uploads are sanitised or rejected.

**CSRF.** Server actions carry Auth.js protection; `/api/v1` accepts only Bearer tokens, so
it has no ambient authority to forge (`12-authentication-authorization.md`).

**Headers.** `Content-Security-Policy` with nonces and no `unsafe-inline` for scripts,
`Strict-Transport-Security` with preload, `X-Content-Type-Options`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying
camera/microphone/geolocation except where the map picker asks.

*How the CSP actually ships (task 9.3, 2026-08-24)* — **two profiles**, because a
per-request nonce and an ISR-cached page are mutually exclusive by construction (Next
stamps the nonce onto its inline flight scripts only at request-time render; a cached page
is the same bytes for every request):

- Every personal-data surface — auth (made `force-dynamic` for this), the configurator,
  `/hesap`, `/panel`, `/yonetim` — carries the **strict profile**: nonce'd `script-src`
  with `'strict-dynamic'`, no `unsafe-inline` anywhere near scripts, proven by e2e both at
  the header and by the release gate running under it.
- The ISR public pages carry every directive **except `script-src`** — omitted honestly
  rather than shipped as `'unsafe-inline'` (which a nonce-bearing browser ignores anyway)
  or as a policy the cached HTML cannot satisfy (which kills hydration). `style-src` keeps
  `'unsafe-inline'` on both profiles: style *attributes* are outside CSP entirely, the
  framework's `<style>` tags have no nonce path in Next, and inline style is not script
  execution.
- Closing the public-page gap means a JS-free public shell or PPR — an architecture
  decision on the launch checklist, not a middleware tweak.

**IDOR.** Ownership is expressed in the `where` clause, never checked after fetching
(`12-authentication-authorization.md` §Authorization). This is the failure mode most likely
to leak one customer's project to another, so the authorisation matrix test suite targets it
specifically (`20-testing-strategy.md`).

**Secrets.** Typed env at boot; the process refuses to start with a missing or malformed
variable. No secrets in the repo, in `NEXT_PUBLIC_*`, or in logs. Rotation runbook in
`23-deployment-and-environments.md`.

**Dependencies.** Lockfile committed, `npm audit` and Dependabot in CI, no new runtime
dependency without a note in the PR describing why the platform cannot do it.

**Logging.** Structured, with `requestId`. Never logged: passwords, tokens, OTPs, full
contact details, message bodies, document contents. Personal identifiers appear as ids.

## Audit log

Append-only. The application database role has `INSERT`/`SELECT` on `audit_log` and no
`UPDATE`/`DELETE` — enforced by a grant, so a bug cannot rewrite history.

Logged: authentication events, permission changes, verification decisions, suspensions,
contact disclosures, consent grants and revocations, price book publishes, offer sends and
decisions, review moderation, catalogue and settings changes, admin reveals, data exports and
erasures. Each row: actor, role, company, entity, action, before/after, reason, IP, user
agent, timestamp.

## Incident response

Detect (error rate, failed-auth spike, dead-letter growth) → contain (revoke sessions, block
IPs, disable the affected surface) → assess scope from the audit log → notify. KVKK breach
notification to the Kurum is **72 hours**, and affected subjects "in the shortest time" —
which is why the disclosure and audit records must be queryable, not reconstructable. The
runbook, contacts and template notices live in `23-deployment-and-environments.md`.

## Pre-launch checklist

- [ ] Privacy notice, cookie notice, terms, and the consent text — reviewed by a Turkish
      lawyer, versioned in the repo
- [ ] VERBİS registration assessed
- [ ] Processor agreements signed for mail, SMS, push (Expo), hosting, storage, geocoding
- [ ] Data export and erasure jobs tested end to end
- [ ] Authorisation matrix suite green (`20-testing-strategy.md`)
- [ ] Headers verified in production, CSP without `unsafe-inline`
- [ ] Backup restore rehearsed, including a point-in-time restore
- [ ] Rate limits verified against the live limits, not the defaults
