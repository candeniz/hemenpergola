/**
 * The permission catalogue — `02-user-roles-and-permissions.md` §Permission catalogue.
 *
 * **This file is the single source of truth.** The table in `02` is regenerated from it by
 * `scripts/generate-permission-table.mjs`, and `permissions.test.ts` fails if the document
 * has drifted. Editing the table by hand is how a document starts lying.
 *
 * Domain layer: pure. No Prisma, no Next, no imports from `application/` or
 * `infrastructure/` (`05-system-architecture.md` §Shape).
 */

/** Company-scoped roles, mirroring the `CompanyRole` enum in the schema. */
export const COMPANY_ROLES = ['OWNER', 'ADMIN', 'SALES', 'VIEWER'] as const
export type CompanyRole = (typeof COMPANY_ROLES)[number]

/** Company lifecycle states, mirroring `CompanyStatus`. */
export const COMPANY_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'] as const
export type CompanyStatus = (typeof COMPANY_STATUSES)[number]

/**
 * Permissions are strings, not booleans on a user. The `company:` prefix marks them as
 * company-scoped: they are meaningless without a `companyId` in the actor context.
 */
export const PERMISSIONS = {
  COMPANY_UPDATE: 'company:company.update',
  COMPANY_DELETE: 'company:company.delete',
  /**
   * Reading the roster. `02`'s table does not list it — the same omission as
   * `document.upload` — but every role needs it: SALES has to see who to hand a lead to, and
   * VIEWER sees the team on the company page. Gating the roster behind `member.invite` would
   * mean only OWNER and ADMIN can see who is in the company they work for (`ADR-016`).
   */
  MEMBER_READ: 'company:member.read',
  MEMBER_INVITE: 'company:member.invite',
  MEMBER_REMOVE: 'company:member.remove',
  MEMBER_CHANGE_ROLE: 'company:member.change_role',
  PRODUCT_MANAGE: 'company:product.manage',
  PRICE_BOOK_READ: 'company:price_book.read',
  PRICE_BOOK_WRITE: 'company:price_book.write',
  PRICE_BOOK_PUBLISH: 'company:price_book.publish',
  SERVICE_AREA_MANAGE: 'company:service_area.manage',
  OFFER_REQUEST_READ: 'company:offer_request.read',
  OFFER_REQUEST_RESPOND: 'company:offer_request.respond',
  OFFER_CREATE: 'company:offer.create',
  OFFER_SEND: 'company:offer.send',
  APPOINTMENT_MANAGE: 'company:appointment.manage',
  MESSAGE_SEND: 'company:message.send',
  PORTFOLIO_MANAGE: 'company:portfolio.manage',
  REVIEW_RESPOND: 'company:review.respond',
  ANALYTICS_READ: 'company:analytics.read',
  DOCUMENT_UPLOAD: 'company:document.upload',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as readonly Permission[]

/**
 * How a permission behaves against `Company.status` (`02` §Verification state).
 *
 *   read        always allowed for a role that holds it, in every status
 *   onboarding  allowed while `PENDING` — the work a company does to become verified
 *   write       requires `VERIFIED`; `REJECTED` and `SUSPENDED` are read-only, and a
 *               `PENDING` company cannot yet operate
 */
export type PermissionKind = 'read' | 'onboarding' | 'write'

export const PERMISSION_KIND: Record<Permission, PermissionKind> = {
  // Reads
  [PERMISSIONS.PRICE_BOOK_READ]: 'read',
  [PERMISSIONS.OFFER_REQUEST_READ]: 'read',
  [PERMISSIONS.ANALYTICS_READ]: 'read',
  [PERMISSIONS.MEMBER_READ]: 'read',

  // The onboarding path: a PENDING company must be able to finish its profile and upload
  // documents, or it can never reach VERIFIED (02 §Verification state).
  [PERMISSIONS.COMPANY_UPDATE]: 'onboarding',
  [PERMISSIONS.DOCUMENT_UPLOAD]: 'onboarding',
  /*
   * Member management is onboarding, not operational (`ADR-016`).
   *
   * `02` §Verification state summarises `PENDING` as "can complete profile and upload
   * documents", and the first reading of that makes inviting a colleague a `write` — which
   * means a newly registered company is one person until an administrator verifies it. In a
   * real firm the founder is not the person who scans the tax certificate. Building the team
   * *is* the work that gets a company verified, so it belongs on the onboarding path.
   *
   * `SUSPENDED` and `REJECTED` are unaffected: neither permits onboarding work, so a frozen
   * company still cannot change who its members are.
   */
  [PERMISSIONS.MEMBER_INVITE]: 'onboarding',
  [PERMISSIONS.MEMBER_REMOVE]: 'onboarding',
  [PERMISSIONS.MEMBER_CHANGE_ROLE]: 'onboarding',

  // Everything operational
  [PERMISSIONS.COMPANY_DELETE]: 'write',
  [PERMISSIONS.PRODUCT_MANAGE]: 'write',
  [PERMISSIONS.PRICE_BOOK_WRITE]: 'write',
  [PERMISSIONS.PRICE_BOOK_PUBLISH]: 'write',
  [PERMISSIONS.SERVICE_AREA_MANAGE]: 'write',
  [PERMISSIONS.OFFER_REQUEST_RESPOND]: 'write',
  [PERMISSIONS.OFFER_CREATE]: 'write',
  [PERMISSIONS.OFFER_SEND]: 'write',
  [PERMISSIONS.APPOINTMENT_MANAGE]: 'write',
  [PERMISSIONS.MESSAGE_SEND]: 'write',
  [PERMISSIONS.PORTFOLIO_MANAGE]: 'write',
  [PERMISSIONS.REVIEW_RESPOND]: 'write',
}

/**
 * Role → permissions, from `02` §Permission catalogue.
 *
 * Written as explicit lists rather than as "ADMIN = OWNER minus two": an inheritance chain
 * makes it impossible to read off what a role can do without evaluating the chain, and the
 * one thing this table has to be is readable.
 */
const OWNER_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS

const ADMIN_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.COMPANY_UPDATE,
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.MEMBER_INVITE,
  PERMISSIONS.MEMBER_REMOVE,
  PERMISSIONS.MEMBER_CHANGE_ROLE,
  PERMISSIONS.PRODUCT_MANAGE,
  PERMISSIONS.PRICE_BOOK_READ,
  PERMISSIONS.PRICE_BOOK_WRITE,
  PERMISSIONS.PRICE_BOOK_PUBLISH,
  PERMISSIONS.SERVICE_AREA_MANAGE,
  PERMISSIONS.OFFER_REQUEST_READ,
  PERMISSIONS.OFFER_REQUEST_RESPOND,
  PERMISSIONS.OFFER_CREATE,
  PERMISSIONS.OFFER_SEND,
  PERMISSIONS.APPOINTMENT_MANAGE,
  PERMISSIONS.MESSAGE_SEND,
  PERMISSIONS.PORTFOLIO_MANAGE,
  PERMISSIONS.REVIEW_RESPOND,
  PERMISSIONS.ANALYTICS_READ,
  PERMISSIONS.DOCUMENT_UPLOAD,
]

const SALES_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.PRICE_BOOK_READ,
  PERMISSIONS.OFFER_REQUEST_READ,
  PERMISSIONS.OFFER_REQUEST_RESPOND,
  PERMISSIONS.OFFER_CREATE,
  PERMISSIONS.OFFER_SEND,
  PERMISSIONS.APPOINTMENT_MANAGE,
  PERMISSIONS.MESSAGE_SEND,
  PERMISSIONS.PORTFOLIO_MANAGE,
  PERMISSIONS.REVIEW_RESPOND,
  PERMISSIONS.ANALYTICS_READ,
]

const VIEWER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.PRICE_BOOK_READ,
  PERMISSIONS.OFFER_REQUEST_READ,
  PERMISSIONS.ANALYTICS_READ,
]

export const ROLE_PERMISSIONS: Record<CompanyRole, readonly Permission[]> = {
  OWNER: OWNER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SALES: SALES_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
}

const ROLE_PERMISSION_SETS: Record<CompanyRole, ReadonlySet<Permission>> = {
  OWNER: new Set(OWNER_PERMISSIONS),
  ADMIN: new Set(ADMIN_PERMISSIONS),
  SALES: new Set(SALES_PERMISSIONS),
  VIEWER: new Set(VIEWER_PERMISSIONS),
}

/** Does this role hold this permission, ignoring company status? */
export function roleHasPermission(role: CompanyRole, permission: Permission): boolean {
  return ROLE_PERMISSION_SETS[role].has(permission)
}

/** Does this company status permit this permission, ignoring role? */
export function statusAllowsPermission(status: CompanyStatus, permission: Permission): boolean {
  const kind = PERMISSION_KIND[permission]

  if (kind === 'read') return true
  if (status === 'VERIFIED') return true
  // A PENDING company may only do the work that gets it verified.
  if (status === 'PENDING') return kind === 'onboarding'
  // REJECTED may resubmit documents; SUSPENDED is frozen. Both are otherwise read-only.
  if (status === 'REJECTED') return permission === PERMISSIONS.DOCUMENT_UPLOAD
  return false
}

/**
 * **Capability is role ∩ status** (`02` §Verification state). Both halves are checked here
 * so no service can accidentally check only one.
 */
export function companyMemberCan(
  role: CompanyRole,
  status: CompanyStatus,
  permission: Permission,
): boolean {
  return roleHasPermission(role, permission) && statusAllowsPermission(status, permission)
}

/**
 * `ADMIN` cannot grant or revoke `OWNER` — footnote 1 in `02`'s table. Exactly one `OWNER`
 * exists per company (a partial unique index enforces the count); this rule is about who is
 * allowed to move it.
 */
export function canAssignRole(actorRole: CompanyRole, targetRole: CompanyRole): boolean {
  if (!roleHasPermission(actorRole, PERMISSIONS.MEMBER_CHANGE_ROLE)) return false
  if (targetRole === 'OWNER') return actorRole === 'OWNER'
  return true
}

/** The same rule from the other direction: taking `OWNER` away is transferring ownership. */
export function canRevokeRole(actorRole: CompanyRole, targetRole: CompanyRole): boolean {
  return canAssignRole(actorRole, targetRole)
}

/** Human-readable permission name, for the generated table and for error messages. */
export function permissionLabel(permission: Permission): string {
  return permission.replace(/^company:/, '')
}
