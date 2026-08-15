import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { VALID_ENV } from './test/fixtures/env.js'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    // The reference folders are committed material, not source (CLAUDE.md §Layout).
    exclude: [
      'node_modules/**',
      '.next/**',
      'Frontend Tasarım/**',
      'Yazılım Mimari Promptlar/**',
      // Integration tests are their own pipeline stage and need a container.
      'test/integration/**',
    ],
    // A valid environment, so importing modules that parse env at load does not throw.
    // Tests that need a broken environment build it explicitly.
    env: { ...VALID_ENV },
    alias: {
      // `server-only` is a marker package: it resolves to an empty module under the
      // `react-server` export condition and to a module that throws on import otherwise.
      // Next sets that condition when compiling a Server Component; plain Node does not,
      // so without this every test touching a server-only module fails at import.
      // See test/stubs/server-only.ts for why this weakens nothing.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
})
