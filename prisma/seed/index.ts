import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

import { isProfileName, PROFILES, type ProfileName } from './profiles'

/**
 * Seed entry point. `20-testing-strategy.md` §Test data: three profiles, in the repository,
 * part of the build — *"a demo dataset that only exists on someone's laptop is how the
 * first demo goes wrong."*
 *
 *   pnpm seed             → minimal
 *   pnpm seed demo
 *   pnpm seed e2e
 *
 * Reads DATABASE_URL from the environment directly rather than through the typed env: this
 * is a CLI script, like `prisma.config.ts`, and it must run against an arbitrary database
 * (a container, a scratch copy) that the application's configuration does not describe.
 */
async function main(): Promise<void> {
  const requested = process.argv[2] ?? 'minimal'

  if (!isProfileName(requested)) {
    console.error(
      `unknown profile "${requested}" — expected one of: ${Object.keys(PROFILES).join(', ')}`,
    )
    process.exit(1)
  }

  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined || connectionString.length === 0) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const profile: ProfileName = requested
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const started = Date.now()
  try {
    const summary = await PROFILES[profile](prisma)
    const seconds = ((Date.now() - started) / 1000).toFixed(1)

    console.log(`seeded "${summary.profile}" in ${seconds}s`)
    console.log(`  cities      ${summary.cities}`)
    console.log(`  districts   ${summary.districts}`)
    console.log(`  settings    ${summary.settings}`)
    console.log(`  users       ${summary.users}`)
    console.log(`  companies   ${summary.companies}`)
    console.log(`  memberships ${summary.memberships}`)
    console.log(`  categories  ${summary.categories}`)
    console.log(`  products    ${summary.products} (${summary.fullySpecified} fully specified)`)
    console.log(`  attributes  ${summary.attributes}`)
    console.log(`  options     ${summary.options}`)
  } finally {
    await prisma.$disconnect()
  }
}

await main()
