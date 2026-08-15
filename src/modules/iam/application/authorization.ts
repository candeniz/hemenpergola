import type { ActorContext } from '@/shared/context/actor'
import { err, forbidden, ok, precondition, type DomainError, type Result } from '@/shared/result'

import {
  companyMemberCan,
  roleHasPermission,
  statusAllowsPermission,
  type Permission,
} from '../domain/permissions'

/**
 * The authorisation check every company-scoped service method makes as its **first
 * statement** (`02-user-roles-and-permissions.md` §Enforcement rule).
 *
 * There is no "the route already checked it" exemption: route handlers, server actions and
 * background jobs all reach the same service and the same check.
 */
export function authorize(actor: ActorContext, permission: Permission): Result<void, DomainError> {
  // A global admin bypasses company scoping — but not the audit log (02 §Admin).
  if (actor.globalRole === 'ADMIN') return ok(undefined)

  if (actor.userId === null) return err(forbidden(permission))
  if (actor.companyId === null || actor.companyRole === null) return err(forbidden(permission))

  // Membership without a loaded status is a resolver bug, not an authorisation decision.
  if (actor.companyStatus === null) return err(forbidden(permission))

  if (!roleHasPermission(actor.companyRole, permission)) {
    return err(forbidden(permission))
  }

  /*
   * Role holds it, status does not. This is `PRECONDITION`, not `FORBIDDEN`, and the
   * difference is the whole point: "your company is suspended" is actionable and
   * "you are not allowed" is not, and the two must not read the same to the person
   * who has to fix it. Both map to their own status in `05` §Errors.
   */
  if (!statusAllowsPermission(actor.companyStatus, permission)) {
    return err(
      precondition(
        `company is ${actor.companyStatus}; ${permission} requires an operational company`,
      ),
    )
  }

  return ok(undefined)
}

/** Boolean form, for UI-shaped questions. The server still calls `authorize`. */
export function can(actor: ActorContext, permission: Permission): boolean {
  if (actor.globalRole === 'ADMIN') return true
  if (actor.companyRole === null || actor.companyStatus === null) return false
  return companyMemberCan(actor.companyRole, actor.companyStatus, permission)
}
