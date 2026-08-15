import type { NextConfig } from 'next'

// The env parse deliberately does NOT run here. 23-deployment-and-environments.md
// §Configuration says a bad variable fails *startup*, not the build, and §Runtime builds
// one image that later runs as web and as worker — production secrets do not exist at
// image-build time. The parse runs from `src/instrumentation.ts`, which Next calls once
// per server process.

/**
 * Reference material that is committed but is not source
 * (CLAUDE.md §Layout). Kept out of the build, the trace and the dev watcher.
 */
const REFERENCE_DIRS = ['Frontend Tasarım', 'Yazılım Mimari Promptlar'] as const

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Never ship reference material in the standalone server trace.
  outputFileTracingExcludes: {
    '*': REFERENCE_DIRS.map((dir) => `./${dir}/**/*`),
  },

  // Do not rebuild because a 25 000-line design mockup was touched.
  webpack(config) {
    const ignored = REFERENCE_DIRS.map((dir) => `**/${dir}/**`)
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/.git/**', ...ignored],
    }
    return config
  },

  typescript: {
    // Type errors fail the build. `pnpm typecheck` is the same check, run earlier.
    ignoreBuildErrors: false,
  },
  eslint: {
    // Linting is a separate pipeline stage (`pnpm lint`), not a build step.
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
