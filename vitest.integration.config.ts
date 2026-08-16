import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { VALID_ENV } from './test/fixtures/env.js'

/**
 * The integration stage (`20-testing-strategy.md` §Integration,
 * `23-deployment-and-environments.md` §Pipeline). Separate from the unit config because it
 * is a separate stage with a separate cost: it starts a PostGIS container, so it must not
 * run on every `pnpm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.integration.test.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    // A valid environment so modules that parse env at load — `src/shared/db` — can be
    // imported. The DATABASE_URL here is never connected to: every client in these tests is
    // built against the container's URL from `setup.ts`.
    env: { ...VALID_ENV },
    // One container for the whole run, started by the global setup; each test rolls its
    // own transaction back. Files stay sequential because they share that one database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 300_000,
  },
})
