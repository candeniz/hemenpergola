import { defineConfig } from 'vitest/config'

import { VALID_ENV } from './test/fixtures/env.ts'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    // The reference folders are committed material, not source (CLAUDE.md §Layout).
    exclude: ['node_modules/**', '.next/**', 'Frontend Tasarım/**', 'Yazılım Mimari Promptlar/**'],
    // A valid environment, so importing modules that parse env at load does not throw.
    // Tests that need a broken environment build it explicitly.
    env: { ...VALID_ENV },
  },
})
