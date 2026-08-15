#!/usr/bin/env node
/**
 * The integration stage of the pipeline (`23` §Pipeline, `20` §Pipeline).
 *
 * Three outcomes, and the middle one is the reason this script exists rather than a plain
 * `pnpm test:integration`:
 *
 *   no schema                  → skip, printing the reason and the phase that opens it
 *   schema, but no integration → FAIL. A database with no tests against it is a gap, not a
 *     tests                      pass, and the stage opens itself the moment 0.4 lands.
 *   schema and tests           → run them
 *
 * As of Phase 0 task 0.4 the schema exists, so this stage runs for real. It needs Docker;
 * a failure to reach the daemon is reported as a failure rather than skipped, because
 * "the runner has no Docker" is a CI configuration bug and silence would hide it.
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
  console.log('  blocked  : Phase 0 task 0.4 (Prisma + migration 1)')
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

console.log(`integration: running ${tests.length} file(s) against a PostGIS container`)
for (const test of tests) console.log(`  · ${test}`)

const result = spawnSync('pnpm', ['run', 'test:integration'], { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
