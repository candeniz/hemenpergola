/**
 * The third committed boundary violation: the layering bans, evaded by deferring.
 *
 * Every import here is dynamic, and until Phase 4 every one of them passed the pipeline.
 * `no-restricted-imports` inspects **static** `import` declarations; `await import('...')`
 * is an `ImportExpression` and is simply not a thing it looks at. Four real violations were
 * living in the tree behind exactly this shape — an admin dashboard counting rows off
 * Prisma, a manufacturer page doing the same, and two dev routes reaching into a module's
 * infrastructure.
 *
 * The distinction the rules encode, and the reason this fixture exists beside
 * `app-imports-env-at-module-scope.tsx` rather than replacing it:
 *
 *   **Non-negotiable 9 is about *timing*.** Deferring the import is the prescribed fix, so
 *   a dynamic import of `env` or an application service must keep passing — asserted in
 *   `module-boundary.test.ts` by a test that would fail if this fixture's rules were applied
 *   too broadly.
 *
 *   **These four are about *dependency*.** `app/` may not reach Prisma, a repository or a
 *   domain internal, and waiting until request time does not unmake the layer crossing. It
 *   only hides it.
 *
 * `test/module-boundary.test.ts` lints this and expects all four to be reported.
 * Not compiled, not routed, not shipped.
 */
export default async function Page() {
  const { PrismaClient } = await import('@prisma/client')
  const { prisma } = await import('@/shared/db')
  const { CompanyRepository } = await import('@/modules/iam/infrastructure/company-repository')
  const { assertOwner } = await import('@/modules/iam/domain/permissions')

  return { PrismaClient, prisma, CompanyRepository, assertOwner }
}
