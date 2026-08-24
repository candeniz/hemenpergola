#!/usr/bin/env node
/**
 * The Lighthouse stage — Phase 8's gate (`21`: "five main templates meet the budgets in
 * `18`, in CI").
 *
 * ## What this stage used to do, honestly
 *
 * Until 2026-08-24 it checked whether `lighthouse-budgets.json` existed, printed SKIPPED
 * (it never existed), and exited 0 — 0.4 minutes of green that measured nothing. That was
 * defensible while the templates were placeholders and indefensible after; `28` §6: "a
 * stage that quietly passes with nothing in it reads green and proves nothing."
 *
 * ## What it does now
 *
 * Reads the five templates and the budgets from `scripts/performance-budget.mjs` (the
 * machine-readable form of `18` §Performance budgets — a unit test welds the two), then
 * for each template:
 *
 *   1. resolves a representative URL against the seeded database (`sampleSql`);
 *   2. warms the page once so the measured request is an ISR HIT, and measures TTFB on
 *      the second request;
 *   3. runs Lighthouse (mobile emulation, performance category) and reads LCP, TBT
 *      (INP's lab proxy — the doc says so) and CLS.
 *
 * **It cannot pass empty** (the `ci-integration.mjs` contract): a template whose sample
 * query finds no row, an unreachable server, or a missing database all exit 1 with the
 * reason. There is no skip path left — the templates exist now.
 *
 * Requires: a running server (`LH_BASE_URL`, default http://127.0.0.1:3100), a seeded
 * database (`DATABASE_URL`), and a Chrome (`chrome-launcher` finds it; CI runners carry
 * one).
 */
import { BUDGETS, TEMPLATES, THROTTLING } from './performance-budget.mjs'

const BASE_URL = process.env.LH_BASE_URL ?? 'http://127.0.0.1:3100'
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola'

async function sample(sql) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    const result = await client.query(sql)
    return result.rows[0] ? Object.values(result.rows[0])[0] : null
  } finally {
    await client.end()
  }
}

async function ttfbOnIsrHit(url) {
  // Warm once: the first request may render; the second is the ISR hit the budget names.
  await fetch(url)
  const started = performance.now()
  const response = await fetch(url)
  const ttfb = performance.now() - started // headers received when fetch resolves
  await response.arrayBuffer()
  return { ttfbMs: Math.round(ttfb), status: response.status }
}

async function main() {
  const { default: lighthouse } = await import('lighthouse')
  const chromeLauncher = await import('chrome-launcher')

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
    // Sandboxed local runs may not own the system temp dir; CI never sets this.
    ...(process.env.CHROME_USER_DATA_DIR === undefined
      ? {}
      : { userDataDir: process.env.CHROME_USER_DATA_DIR }),
  })

  const failures = []
  const rows = []
  let lastBenchmarkIndex

  try {
    for (const template of TEMPLATES) {
      let value = null
      if (template.sampleSql !== undefined) {
        value = await sample(template.sampleSql)
        if (value === null || value === undefined) {
          failures.push(`${template.key}: sample query found no row — a template with no`)
          failures.push(`  representative page cannot be measured, and skipping it would`)
          failures.push(`  make the gate prove less than its name. Seed the database.`)
          continue
        }
      }
      const url = `${BASE_URL}${template.path(value)}`

      const { ttfbMs, status } = await ttfbOnIsrHit(url)
      if (status !== 200) {
        failures.push(`${template.key}: ${url} answered ${status}`)
        continue
      }

      // Median of three runs: simulated throttling still inherits trace noise from the
      // host, and a gate that flakes at the boundary teaches people to re-run it, not
      // to trust it.
      const samples = []
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const run = await lighthouse(url, {
          port: chrome.port,
          onlyCategories: ['performance'],
          output: 'json',
          // Mobile emulation (Lighthouse's default device) with the 4G network model the
          // budget names — see THROTTLING in performance-budget.mjs and 18 §Performance.
          throttling: THROTTLING,
        })
        const audits = run.lhr.audits
        lastBenchmarkIndex = run.lhr.environment?.benchmarkIndex ?? lastBenchmarkIndex
        samples.push({
          lcp: (audits['largest-contentful-paint']?.numericValue ?? Infinity) / 1000,
          tbt: audits['total-blocking-time']?.numericValue ?? Infinity,
          cls: audits['cumulative-layout-shift']?.numericValue ?? Infinity,
        })
      }
      const median = (key) => samples.map((s) => s[key]).sort((a, b) => a - b)[1]
      const lcpSeconds = median('lcp')
      const tbtMs = median('tbt')
      const cls = median('cls')

      rows.push({ key: template.key, url, lcpSeconds, tbtMs, cls, ttfbMs })

      if (lcpSeconds > BUDGETS.lcpSeconds)
        failures.push(`${template.key}: LCP ${lcpSeconds.toFixed(2)}s > ${BUDGETS.lcpSeconds}s`)
      if (tbtMs > BUDGETS.tbtMs)
        failures.push(`${template.key}: TBT ${Math.round(tbtMs)}ms > ${BUDGETS.tbtMs}ms`)
      if (cls > BUDGETS.cls)
        failures.push(`${template.key}: CLS ${cls.toFixed(3)} > ${BUDGETS.cls}`)
      if (ttfbMs > BUDGETS.ttfbMs)
        failures.push(`${template.key}: TTFB(hit) ${ttfbMs}ms > ${BUDGETS.ttfbMs}ms`)
    }
  } finally {
    chrome.kill()
  }

  if (lastBenchmarkIndex !== undefined) {
    // Interpretability: observed TBT scales with host speed even under simulated
    // throttling — a healthy runner sits ~1000+, a low index inflates TBT, and the gate
    // is only reproducible against a comparable index. Emitted as an ::notice so an
    // anonymous reader of the public repository can see the number (annotations are the
    // one channel they get), and 25-progress.md records the runner's baseline.
    const index = Math.round(lastBenchmarkIndex)
    console.log(`\nlighthouse: host benchmarkIndex ${index}`)
    console.log(`::notice title=lighthouse host::benchmarkIndex ${index}`)
  }
  console.log('\nlighthouse: five-template gate (18 §Performance budgets)')
  console.log('  template               LCP(s)  TBT(ms)  CLS     TTFB-hit(ms)')
  for (const row of rows) {
    console.log(
      `  ${row.key.padEnd(22)} ${row.lcpSeconds.toFixed(2).padStart(5)}  ${String(
        Math.round(row.tbtMs),
      ).padStart(7)}  ${row.cls.toFixed(3)}  ${String(row.ttfbMs).padStart(8)}`,
    )
  }

  if (rows.length !== TEMPLATES.length) {
    failures.push(
      `measured ${rows.length}/${TEMPLATES.length} templates — the gate covers five or it is not the gate`,
    )
  }

  if (failures.length > 0) {
    console.error('\nlighthouse: FAILED')
    for (const failure of failures) console.error(`  ${failure}`)
    process.exit(1)
  }

  // The whole result table as one annotation too — anonymous readers of the public repo
  // see only annotations, and a passing gate should still show its numbers.
  const summary = rows
    .map(
      (row) =>
        `${row.key}: LCP ${row.lcpSeconds.toFixed(2)}s TBT ${Math.round(row.tbtMs)}ms CLS ${row.cls.toFixed(3)} TTFB ${row.ttfbMs}ms`,
    )
    .join('%0A')
  console.log(`::notice title=lighthouse five-template gate::${summary}`)

  console.log('\nlighthouse: OK — all five templates within budget')
}

main().catch((error) => {
  console.error('lighthouse: FAILED —', error.message)
  console.error('  (no skip path exists: the five templates are built, so the gate must run)')
  process.exit(1)
})
