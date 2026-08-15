#!/usr/bin/env node
/**
 * Runs every `run:` step of `.github/workflows/ci.yml`, in job order, on this machine.
 *
 * It is not a substitute for GitHub: it does not exercise the runner, the actions, the
 * cache or the matrix. It does exercise every command the workflow issues, which is the
 * part that can be wrong in a way GitHub would only tell you about after a push.
 *
 * `act` would be the real answer and cannot run here — it needs Docker, and Docker needs
 * firmware virtualization that is disabled on this machine (25-progress.md Q8).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'))
const skip = new Set([
  'pnpm install --frozen-lockfile',
  'pnpm exec playwright install --with-deps chromium',
])

let failed = 0
const results = []

for (const [jobId, job] of Object.entries(workflow.jobs)) {
  for (const step of job.steps) {
    if (!step.run) continue

    const command = step.run.trim()
    const label = `${jobId} · ${step.name ?? command}`

    if (skip.has(command)) {
      results.push({ label, status: 'already done' })
      continue
    }

    process.stdout.write(`\n=== ${label}\n$ ${command}\n`)
    const started = process.hrtime.bigint()
    const result = spawnSync(command, { stdio: 'inherit', shell: true })
    const seconds = Number(process.hrtime.bigint() - started) / 1e9
    const ok = result.status === 0

    if (!ok) failed += 1
    results.push({
      label,
      status: ok ? `ok (${seconds.toFixed(1)}s)` : `FAILED (exit ${result.status})`,
    })
  }
}

console.log('\n' + '─'.repeat(72))
for (const row of results) {
  console.log(`  ${row.status.padEnd(18)} ${row.label}`)
}
console.log('─'.repeat(72))
console.log(failed === 0 ? 'all workflow steps passed locally' : `${failed} step(s) failed`)

process.exit(failed === 0 ? 0 : 1)
