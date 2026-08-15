#!/usr/bin/env node
/**
 * Guards the guard.
 *
 * `20-testing-strategy.md` §End to end makes `e2e/core-flow.spec.ts` the single release
 * gate. A gate that can be deleted, emptied or renamed without anything noticing is not a
 * gate, so CI asserts that the file exists and still contains the nine steps of
 * `03-user-flows.md` §F1 — skipped or not.
 */
import { existsSync, readFileSync } from 'node:fs'

const SPEC = 'e2e/core-flow.spec.ts'
const EXPECTED_STEPS = 9

if (!existsSync(SPEC)) {
  console.error(`release gate: FAILED — ${SPEC} does not exist.`)
  console.error('  20-testing-strategy.md §End to end: this spec is the release gate.')
  process.exit(1)
}

const source = readFileSync(SPEC, 'utf8')
const tests = [...source.matchAll(/\btest(?:\.(?:skip|fixme|only))?\s*\(/g)].length
const steps = [...source.matchAll(/\btest\.skip\s*\(\s*['"`]\d /g)].length

if (tests === 0) {
  console.error(`release gate: FAILED — ${SPEC} contains no tests.`)
  process.exit(1)
}

if (source.includes('test.only')) {
  console.error(`release gate: FAILED — ${SPEC} contains test.only, which hides the rest.`)
  process.exit(1)
}

const numbered = [...source.matchAll(/test(?:\.skip)?\s*\(\s*['"`](\d)\s·/g)].map((m) =>
  Number(m[1]),
)
const missing = Array.from({ length: EXPECTED_STEPS }, (_, i) => i + 1).filter(
  (step) => !numbered.includes(step),
)

if (missing.length > 0) {
  console.error(`release gate: FAILED — F1 steps missing from ${SPEC}: ${missing.join(', ')}`)
  console.error('  03-user-flows.md §F1 has nine steps and the spec walks exactly those.')
  process.exit(1)
}

console.log(`release gate: present — ${tests} tests, ${steps} of the nine F1 steps still skipped`)
