import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { calculateEstimate, ENGINE_VERSION } from '../src/modules/pricing/domain/engine'
import { GOLDEN_CASES } from '../src/modules/pricing/domain/goldens/fixtures'

/**
 * Regenerates the committed golden expectations — `pnpm goldens:pricing`.
 *
 * Run this **only** when a formula change is intended, and bump `ENGINE_VERSION` in the same
 * commit. `engine.golden.test.ts` records a checksum per engine version; regenerating without
 * a bump makes that test fail, which is the point (`08` §Versioning: a formula change without
 * a bump silently invalidates every stored comparison).
 */

const OUT = join('src', 'modules', 'pricing', 'domain', 'goldens')

mkdirSync(OUT, { recursive: true })

for (const testCase of GOLDEN_CASES) {
  const result = calculateEstimate(testCase.project, testCase.priceBook, testCase.settings)

  const golden = {
    name: testCase.name,
    covers: testCase.covers,
    engineVersion: ENGINE_VERSION,
    input: {
      project: testCase.project,
      priceBook: testCase.priceBook,
      settings: testCase.settings,
    },
    expected: result,
  }

  writeFileSync(join(OUT, `${testCase.name}.json`), `${JSON.stringify(golden, null, 2)}\n`, 'utf8')
}

console.log(`wrote ${GOLDEN_CASES.length} goldens at engineVersion ${ENGINE_VERSION}`)
