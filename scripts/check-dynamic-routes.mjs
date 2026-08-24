#!/usr/bin/env node
/**
 * Asserts that every route in `(public-owner)` is **not prerendered** —
 * `07-frontend-architecture.md` §Rendering strategy, `ADR-021`.
 *
 * ## Why this is a build check and not a comment
 *
 * `ADR-021` moved the configurator into a public path so an anonymous visitor can configure.
 * Public routes are ISR-cacheable by default (`SEO-01`), and the configurator carries personal
 * data — dimensions, location, notes, attachments. If one of these routes is ever prerendered
 * or revalidated, **one customer's project is served to another**.
 *
 * The failure is silent in every cheaper check:
 *
 *   `noindex` does not help — it governs indexing, not caching.
 *   A source grep for `force-dynamic` passes while a `revalidate` in a parent layout quietly
 *     overrides the intent.
 *   Types cannot express it; nothing in TypeScript knows what Next did with a route.
 *
 * So this reads Next's own build output and fails the build stage.
 *
 * ## What the 2026-08-24 breakage probe found (Phase 8)
 *
 * Injecting `revalidate = 60` into the group layout did NOT flip the routes: every page
 * in the group calls `cookies()` (the anonymous draft key), and Next ranks dynamic-API
 * usage above `revalidate`. So today this check is the THIRD layer, masked by the first —
 * its own failure path was proven by injecting a route into `.next/prerender-manifest.json`
 * directly (it fails with the message below). It is not redundant: the day a page in the
 * group stops calling `cookies()`, the masking layer evaporates, a parent `revalidate`
 * becomes live, and this check is the only guard left. `07` §Rendering strategy carries
 * the same finding.
 *
 * ## Why it enumerates a directory rather than a list of routes
 *
 * The first version named two routes. The second half of Phase 4 adds `POST /claim`,
 * attachments and probably a summary route, and each would have had to be remembered — the
 * same "guarding a path that moved" failure this check exists to avoid, one step further out.
 *
 * `src/app/[locale]/(public-owner)/` **is** the list. Adding a route there cannot forget the
 * guarantee; adding one outside it is a deliberate statement that it holds no personal data.
 *
 * Run after `pnpm build`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const GROUP_DIR = join('src', 'app', '[locale]', '(public-owner)')
const PRERENDER_MANIFEST = join('.next', 'prerender-manifest.json')
const APP_PATH_MANIFEST = join('.next', 'app-path-routes-manifest.json')

/** Every `page.tsx` / `route.ts` under the group, as its Next route pattern. */
function routesInGroup(dir, prefix = '') {
  const found = []
  if (!existsSync(dir)) return found

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // A nested route group stays out of the URL, exactly as `(public-owner)` does.
      const segment = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`
      found.push(...routesInGroup(join(dir, entry.name), segment))
    } else if (entry.name === 'page.tsx' || entry.name === 'route.ts') {
      found.push(`/[locale]${prefix}`)
    }
  }

  return found
}

const routes = [...new Set(routesInGroup(GROUP_DIR))]

if (routes.length === 0) {
  console.error(
    `check-dynamic-routes: no routes found under ${GROUP_DIR}. Either the group was renamed —` +
      ' in which case this check is guarding nothing and must be updated together with 07' +
      ' §Rendering strategy — or the configurator was moved out of it.',
  )
  process.exit(1)
}

if (!existsSync(PRERENDER_MANIFEST)) {
  console.error(
    `check-dynamic-routes: ${PRERENDER_MANIFEST} not found. Run \`pnpm build\` first — this` +
      ' check reads the real build output rather than the source, because that is the only' +
      ' place the answer actually exists.',
  )
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(PRERENDER_MANIFEST, 'utf8'))

/**
 * `routes` holds statically prerendered paths; `dynamicRoutes` holds ISR route patterns. A
 * route in **either** is cached, which is what must not happen.
 */
const prerendered = new Set([
  ...Object.keys(manifest.routes ?? {}),
  ...Object.keys(manifest.dynamicRoutes ?? {}),
])

const failures = []

for (const route of routes) {
  const withoutLocale = route.replace('/[locale]', '')

  for (const cached of prerendered) {
    // `/tr/proje/yeni` and `/en/proje/yeni` are both instances of `/[locale]/proje/yeni`.
    if (cached === route || cached.endsWith(withoutLocale)) {
      failures.push(`${route} is prerendered as ${cached}`)
    }
  }
}

// Every route in the group must actually be in the build. One that is not means the path
// moved and the check has been silently guarding nothing.
if (existsSync(APP_PATH_MANIFEST)) {
  /*
   * The **values**, not the keys. A key is the source path and still carries the route group
   * — `/[locale]/(public-owner)/proje/yeni/page` — while the value is the URL Next serves,
   * `/[locale]/proje/yeni`. Comparing against keys made this check report every route as
   * missing, which it did on its first real run.
   */
  const served = new Set(Object.values(JSON.parse(readFileSync(APP_PATH_MANIFEST, 'utf8'))))

  for (const route of routes) {
    if (!served.has(route)) {
      failures.push(`${route} is in ${GROUP_DIR} but not in the build — did it move?`)
    }
  }
}

if (failures.length > 0) {
  console.error('check-dynamic-routes: FAILED\n')
  for (const failure of failures) console.error(`  ${failure}`)
  console.error(
    "\nRoutes in (public-owner) carry one customer's personal data. Prerendering or" +
      ' revalidating them serves it to somebody else (07 §Rendering strategy, ADR-021).' +
      " Keep the group layout's `export const dynamic = 'force-dynamic'` and make sure no" +
      ' parent layout sets `revalidate`.',
  )
  process.exit(1)
}

console.log(
  `check-dynamic-routes: OK — ${routes.length} route(s) in (public-owner) are dynamic:` +
    `\n  ${routes.join('\n  ')}`,
)
