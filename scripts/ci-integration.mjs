#!/usr/bin/env node
/**
 * The integration stage of the pipeline (`23` §Pipeline, `20` §Pipeline).
 *
 * Nothing to run today: integration tests need a database, and Prisma arrives in task 0.4.
 * A job that quietly passes with nothing in it is worse than no job — it reads green and
 * proves nothing. So this script decides between three outcomes and says which:
 *
 *   no schema                     → skip, with the reason printed
 *   schema, but no integration    → FAIL. The moment 0.4 lands, this turns red and stays
 *     tests                         red until the tests it implies are written. That is the
 *                                   point: CI opens the stage by itself.
 *   schema and tests              → run them
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const SCHEMA = 'prisma/schema.prisma'
const TEST_DIRS = ['test/integration', 'src']
const TEST_PATTERN = /\.integration\.(test|spec)\.ts$/

function findIntegrationTests(dir) {
  if (!existsSync(dir)) return []
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...findIntegrationTests(path))
    else if (TEST_PATTERN.test(entry.name)) found.push(path)
  }
  return found
}

const hasSchema = existsSync(SCHEMA)
const tests = TEST_DIRS.flatMap(findIntegrationTests)

if (!hasSchema) {
  console.log('integration: SKIPPED')
  console.log(`  reason   : ${SCHEMA} does not exist yet`)
  console.log('  blocked  : Phase 0 task 0.4 (Prisma + migration 1), which needs Docker')
  console.log(
    '  see      : 25-progress.md Q8 — virtualization is disabled in this machine’s firmware',
  )
  console.log('  when 0.4 lands, this stage fails until integration tests exist. By design.')
  process.exit(0)
}

if (tests.length === 0) {
  console.error('integration: FAILED')
  console.error(`  ${SCHEMA} exists, so there is a database to test against,`)
  console.error(`  but no *.integration.test.ts was found under ${TEST_DIRS.join(', ')}.`)
  console.error('')
  console.error('  20-testing-strategy.md §Integration lists the suites this stage owes:')
  console.error('    service areas · matching · authorisation matrix · disclosure ·')
  console.error('    concurrency · price book immutability')
  process.exit(1)
}

console.log(`integration: running ${tests.length} file(s)`)
const result = spawnSync('pnpm', ['vitest', 'run', ...tests], { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
