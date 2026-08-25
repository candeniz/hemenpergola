import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

import { REFERENCE_DIRS as SHARED_REFERENCE_DIRS } from './reference-dirs.mjs'

// The env parse deliberately does NOT run here. 23-deployment-and-environments.md
// §Configuration says a bad variable fails *startup*, not the build, and §Runtime builds
// one image that later runs as web and as worker — production secrets do not exist at
// image-build time. The parse runs from `src/instrumentation.ts`, which Next calls once
// per server process.

/**
 * Reference material that is committed but is not source (CLAUDE.md §Layout). Kept out of
 * the build, the trace and the dev watcher. The names come from the shared list — this
 * file used to carry its own copy, and the copies drifted (`ADR-029`).
 */
const REFERENCE_DIRS = SHARED_REFERENCE_DIRS

/**
 * Where `next/image` is allowed to fetch from.
 *
 * Non-negotiable 9 bans module-scope configuration reads under `src/app`, because Next walks
 * a route's module graph at *build* time and a static import of anything that parses `env`
 * would make `pnpm build` require production secrets again. **This file is not under
 * `src/app`** — it is the build configuration, it is evaluated exactly once by the build, and
 * `CDN_BASE_URL` is a public hostname rather than a secret. So the host belongs here.
 *
 * It is read from `process.env` directly rather than through `shared/config/env`: that module
 * parses the *whole* environment and throws on the first missing secret, which would reinstate
 * precisely the failure `23` §Configuration removed. An unset `CDN_BASE_URL` — which is what
 * CI's no-`.env` build job has — falls back to the local MinIO origin, so the build succeeds
 * and development works.
 *
 * `18` §Performance's image budgets are enforced in CI from Phase 8, and a portfolio gallery
 * of unoptimised originals is the thing most likely to miss them.
 */
function imageHosts(): NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> {
  const configured = process.env.CDN_BASE_URL
  const fallback = 'http://localhost:9000'

  const patterns = new Set([fallback])
  if (configured !== undefined && configured !== '') patterns.add(configured)

  return [...patterns].flatMap((origin) => {
    try {
      const url = new URL(origin)
      return [
        {
          protocol: url.protocol.replace(':', '') as 'http' | 'https',
          hostname: url.hostname,
          ...(url.port === '' ? {} : { port: url.port }),
          pathname: '/**',
        },
      ]
    } catch {
      // A malformed URL here must not take the build down; the host simply is not allowed,
      // and `next/image` reports it at request time with the offending URL.
      return []
    }
  })
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /*
   * Phase 8's gate (`18` §Performance budgets) — `experimental.inlineCss` was TRIED here
   * and reverted: it removed the render-blocking CSS fetch, but Next also serialises the
   * inlined stylesheet into the RSC flight payload, so every page carried the full 136 KB
   * raw Tailwind sheet TWICE (a <style> tag + the flight copy) — the homepage HTML grew
   * from ~60 KB to ~340 KB and LCP got worse, not better. The external stylesheet (~21 KB
   * compressed, cached across navigations) wins.
   */

  images: {
    remotePatterns: imageHosts(),
    // The ladder `media.process` already renders (`IMAGE_VARIANTS`), so the optimiser and the
    // job agree instead of each inventing widths and doubling the stored bytes.
    imageSizes: [320, 640],
    deviceSizes: [1280, 1920],
  },

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

/** Wires `src/i18n/request.ts` into the server components request pipeline. */
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
