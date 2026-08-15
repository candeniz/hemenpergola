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
| Access logs | 12 months |
| Uploaded project photos | with the project; EXIF stripped on upload |

Enforced by the `audit.retention_sweep` job, not by manual cleanup.

### Data location

Application, database, backups and object storage in the EU or Turkey. Any third-party
processor (mail, SMS, geocoding, error tracking) is listed in the privacy notice with its
purpose, and each needs a processor agreement before it is wired in. No customer personal
data is sent to a processor for a purpose the notice does not name.

## Application security

**Input.** Every boundary validates with Zod — server actions, route handlers, job payloads.
Prisma parameterises; the two or three raw PostGIS queries use tagged parameters, never
string interpolation.

**Output.** React escapes by default; `dangerouslySetInnerHTML` is banned outside the
sanitised CMS renderer (`18-cms-seo.md`). SVG uploads are sanitised or rejected.

**CSRF.** Server actions carry Auth.js protection; `/api/v1` accepts only Bearer tokens, so
it has no ambient authority to forge (`12-authentication-authorization.md`).

**Headers.** `Content-Security-Policy` with nonces and no `unsafe-inline` (which the Stitch
mockups rely on and the app does not), `Strict-Transport-Security` with preload,
`X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` denying camera/microphone/geolocation except where the map picker asks.

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
- [ ] Processor agreements signed for mail, SMS, hosting, storage, geocoding
- [ ] Data export and erasure jobs tested end to end
- [ ] Authorisation matrix suite green (`20-testing-strategy.md`)
- [ ] Headers verified in production, CSP without `unsafe-inline`
- [ ] Backup restore rehearsed, including a point-in-time restore
- [ ] Rate limits verified against the live limits, not the defaults
