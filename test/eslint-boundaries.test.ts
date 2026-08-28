import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Pins the `src/**` subset of `ENV_BOUNDARY_FILES` — the files allowed to read
 * `process.env` directly. The `OPERATIONAL_PROBES` / `DEPLOY_WORD_EXEMPTIONS` /
 * `SAME_IN_BOTH` discipline applied to the lint boundary: config files and test tooling
 * are structural and pinning them is noise, but every `src/` entry is a DECISION — a file
 * that bypasses the typed environment — and the next one is a diff to argue in review,
 * not a line to slip into the eslint config.
 */
describe('eslint env-boundary exemptions', () => {
  it('keeps the src/** exemption list to the six decided files', () => {
    const config = readFileSync(join(process.cwd(), 'eslint.config.mjs'), 'utf8')

    const listMatch = /const ENV_BOUNDARY_FILES = \[([\s\S]*?)\n\]/.exec(config)
    expect(listMatch).not.toBeNull()

    const srcEntries = [...(listMatch?.[1] ?? '').matchAll(/'(src\/[^']+)'/g)].map(
      (match) => match[1],
    )

    expect(srcEntries).toEqual([
      // The typed environment itself — the boundary these files ARE.
      'src/shared/config/env.ts',
      'src/shared/config/env.client.ts',
      'src/shared/config/env.test.ts',
      // Creates the typed env at startup; must branch on NEXT_RUNTIME before it exists.
      'src/instrumentation.ts',
      // The site origin for canonical/sitemap/JSON-LD — read at build-time prerender,
      // where the eager Zod parse cannot run (23 §Configuration). See the file's comment.
      'src/shared/seo/site-url.ts',
      // The CSP's storage origin (13.4) and its NODE_ENV branch (13.5). Runs in the Edge
      // runtime on every request, so the eager parse would turn any unrelated missing
      // variable into a site-wide outage; S3_ENDPOINT/CDN_BASE_URL are public hostnames.
      // Argued in the file, and the same argument next.config.ts makes for the image host.
      'src/shared/security/csp.ts',
    ])
  })
})
