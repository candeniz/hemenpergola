/**
 * A committed, deliberate violation of the module boundary.
 *
 * `test/module-boundary.test.ts` lints this file with the rules that apply to `src/app/**`
 * and asserts each import is reported. It is not compiled, not routed and not shipped —
 * `tsconfig.json` and `next.config.ts` both exclude it — it exists so the rule is proven to
 * fire rather than assumed to.
 */
import { PrismaClient } from '@prisma/client'

import { prisma } from '@/shared/db'
import { CompanyRepository } from '@/modules/iam/infrastructure/company-repository'
import { assertOwner } from '@/modules/iam/domain/permissions'

export default function Page() {
  return { PrismaClient, prisma, CompanyRepository, assertOwner }
}
