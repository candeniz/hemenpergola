#!/usr/bin/env node
/**
 * The Lighthouse stage of the pipeline (`23` §Pipeline).
 *
 * The budgets are written down in `18-cms-seo.md` §Performance and are Phase 8's gate:
 * LCP <= 2.0s mobile, INP <= 200ms, CLS <= 0.1, TTFB <= 400ms on an ISR hit. Enforcing
 * them against four placeholder pages would measure nothing and would have to be
 * re-tuned when the real templates land.
 *
 * Same contract as the integration stage: skip loudly, with the reason and the phase.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const BUDGET_FILE = 'lighthouse-budgets.json'

if (!existsSync(BUDGET_FILE)) {
  console.log('lighthouse: SKIPPED')
  console.log(`  reason  : ${BUDGET_FILE} does not exist yet`)
  console.log('  blocked : Phase 8 (public site + SEO) — the five templates the budgets')
  console.log('            apply to are placeholders today')
  console.log('  budgets : 18-cms-seo.md §Performance budgets')
  process.exit(0)
}

console.log(`lighthouse: running against ${BUDGET_FILE}`)
const result = spawnSync('pnpm', ['exec', 'lhci', 'autorun'], { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
