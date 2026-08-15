# 12 — Authentication & Authorization

## Two surfaces, one identity

| Surface | Mechanism | Why |
|---|---|---|
| Web (`app/`) | Auth.js v5, httpOnly cookie session, rotating | CSRF-protected server actions, no token in JS |
| `/api/v1` | `Authorization: Bearer <JWT>` | mobile-ready; cookies are not accepted here |

Both resolve to the same `User` and the same `ActorContext`
(`05-system-architecture.md`). A capability that exists on one surface and not the other is
a bug, not a scope decision.

## Credentials

- Argon2id password hashing (`memoryCost` 19 MiB, `timeCost` 2, `parallelism` 1).
- Minimum 10 characters, checked against a common-password list. No composition rules —
  they produce `Password1!` and nothing else.
- Timing-safe comparison; identical response shape and latency for unknown email and wrong
  password. Registration returns the same message whether or not the email exists, and the
  truth arrives by email.
- Social login is not in V1. It is additive later via Auth.js providers.

## Tokens

| Token | Lifetime | Storage |
|---|---|---|
| Web session | 30 days, sliding, rotated on privilege change | httpOnly, `Secure`, `SameSite=Lax` cookie |
| Access JWT | 15 min | client memory |
| Refresh JWT | 30 days, single-use, rotating with reuse detection | client secure storage |
| Email verification | 24 h, single-use | DB, hashed |
| Password reset | 1 h, single-use, invalidates other sessions on use | DB, hashed |
| Phone OTP | 5 min, 6 digits, 5 attempts, 60 s resend | DB, hashed |

Refresh reuse detection: a replayed refresh token revokes the whole family and alerts the
user. JWT claims stay minimal — `sub`, `role`, `iat`, `exp`, `jti`. **No `companyId` in the
token**: company scope is resolved per request from the path, so revoking a membership takes
effect immediately instead of at token expiry.

## Verification gates

| Action | Requires |
|---|---|
| browse, configure a draft | nothing |
| save a project to an account | email verified |
| request offers | email verified |
| have contact disclosed to a manufacturer | phone verified |
| manufacturer: receive matches | company `VERIFIED` |
| manufacturer: publish a price book | company `VERIFIED` + `price_book.publish` |

Phone verification before disclosure is the only real defence manufacturers have against
junk leads; it is a hard gate, not a nudge (`03-user-flows.md` §F2).

## Context resolution

```ts
// src/shared/context/actor.ts
export async function resolveActor(req, params): Promise<ActorContext>
```

1. Identify the user (cookie session or Bearer JWT). No user → anonymous context.
2. If the route has `[companyId]`, load the `CompanyMembership` for (user, company).
   Missing → `FORBIDDEN`, not `NOT_FOUND`, and not a redirect.
3. Load `Company.status` into the context — capability is role ∩ status
   (`02-user-roles-and-permissions.md` §Verification state).
4. Attach `locale`, `ip`, `userAgent` for audit and consent records.

Never store a "current company" in the session. A user with two companies open in two tabs
must not have one tab silently rewrite the other's scope.

## Authorization

```ts
const ctx = await resolveActor(req, params)
const result = await offerService.accept(ctx, requestId)   // asserts inside
```

Three rules:

1. Every application service method asserts its permission as its **first statement**.
2. Ownership checks are queries, not post-filters: `where: { id, customerId: ctx.userId }`.
   Fetch-then-compare leaks existence through timing and error shape.
3. Middleware handles authentication and redirects only. It never authorises — Next.js
   middleware runs on the edge without DB access, and authorisation needs the database.

The UI hides what a user cannot do, and the server rejects it anyway. `access_denied_permission_required`
renders the 403 (`07-frontend-architecture.md`).

## Sessions and revocation

- Session list with device/IP, revoke individually or all.
- Password change or reset revokes every other session and refresh family.
- Role change or membership removal takes effect on the next request (no token cache).
- Company `SUSPENDED` → all its members drop to read-only immediately.

## Abuse controls

Rate limits per `06-api-specification.md`. Additionally: progressive delay after 5 failed
logins per account, CAPTCHA after 10 from one IP, lockout notification email on the 5th
failure, and every auth event (`login`, `login_failed`, `password_reset`, `session_revoked`)
written to `AuditLog` with IP and user agent.

## Admin

`globalRole = ADMIN` is granted only by another admin or by a seeded bootstrap account, never
by self-service, and every grant is audit-logged with a reason. Admin sessions are 8 hours,
non-sliding. Impersonation is not in V1 (`REQ-ADM-03`).
