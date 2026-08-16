import { defineConfig, devices } from '@playwright/test'

/**
 * 20-testing-strategy.md §End to end. Chromium only for now: the release gate is about the
 * flow working at all, and a second engine multiplies CI time before there is a single
 * un-skipped step to run in it. Widen when the core flow is green (Phase 6).
 */
const PORT = 3100
const BASE_URL = `http://127.0.0.1:${PORT}`
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * Production build, not `next dev`: the gate has to run against what ships. `pnpm build`
   * needs no secrets (`23` §Configuration), but `next start` does — CI writes `.env` from
   * `.env.example` before this runs.
   */
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    // Phase 3 added sharp and the AWS SDK; `next build` plus type checking plus
    // `next start` no longer fits in three minutes on a cold `.next`.
    timeout: 420_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
