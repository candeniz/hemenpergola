/**
 * The boundary rule finally has a real module to protect.
 *
 * Until Phase 1 there was no `modules/*`, so 0.8's rule was proven only against paths that
 * did not exist. These are real files: `modules/iam/infrastructure/identify.ts` reaches the
 * database and `modules/iam/domain/permissions.ts` is the catalogue. A page may call
 * neither — it calls an application service, which asserts a permission first
 * (`02` §Enforcement rule).
 *
 * Linted on purpose by `test/module-boundary.test.ts`. Not compiled, not routed.
 */
import { loadMembership } from '@/modules/iam/infrastructure/identify'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { verifyPassword } from '@/modules/iam/infrastructure/password-hasher'

export default function Page() {
  return { loadMembership, PERMISSIONS, verifyPassword }
}
