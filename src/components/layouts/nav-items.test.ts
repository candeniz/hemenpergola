import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import trMessages from '@/i18n/messages/tr.json'

import { adminNav, customerNav, manufacturerNav, publicNav } from './nav-items'

/**
 * The navigation, pinned — task 2.6.
 *
 * The interesting assertion is the **absence** one. `ADR-010` defers plan management,
 * subscriptions oversight, invoices and the configurator builder: designed, not built, and
 * *"leave them out of the navigation entirely rather than shipping dead links"*
 * (`07-frontend-architecture.md` §Deferred screens).
 *
 * An absence has no code to review. Nothing in a pull request shows that a link is still
 * missing, so the pressure to add "just a placeholder page, it looks unfinished without it"
 * meets no resistance at all — and a placeholder in the navigation is a promise the product
 * has decided not to keep. This test is the resistance.
 */

const DEFERRED = [
  { screen: 'super_admin_plan_management', fragments: ['plan', 'paket'] },
  { screen: 'super_admin_subscriptions_oversight', fragments: ['subscription', 'abonelik'] },
  { screen: 'super_admin_invoices_transactions', fragments: ['invoice', 'fatura', 'odeme'] },
  { screen: 'super_admin_configurator_builder', fragments: ['configurator', 'konfigurator'] },
] as const

describe('deferred screens are absent from navigation (ADR-010)', () => {
  const everyItem = [...publicNav, ...customerNav, ...manufacturerNav, ...adminNav]

  it.each(DEFERRED)('$screen has no navigation entry', ({ fragments }) => {
    const offenders = everyItem.filter((item) =>
      fragments.some(
        (fragment) =>
          item.href.toLowerCase().includes(fragment) ||
          item.labelKey.toLowerCase().includes(fragment),
      ),
    )

    expect(offenders.map((item) => item.href)).toEqual([])
  })

  it('has no route under /yonetim that the route map does not list', () => {
    /*
     * The other direction. A deferred screen could be added under a name none of the
     * fragments above catch, so the admin navigation is checked against `07` §Route map
     * exactly — the document is the list, and adding an entry means editing it there first.
     *
     * `yorumlar` and `icerik` rather than `degerlendirmeler` and `cms`: the pages shipped
     * under those names and the nav pointed at the document's instead, so both links 404'd
     * from Phase 2 until 14.2. `07` now records what was built. This list proves the nav is
     * in the document; the disk check further down proves the document is not fiction.
     */
    const allowed = new Set([
      '/yonetim',
      '/yonetim/ureticiler',
      '/yonetim/musteriler',
      '/yonetim/talepler',
      '/yonetim/katalog',
      '/yonetim/yorumlar',
      '/yonetim/sikayetler',
      '/yonetim/icerik',
      '/yonetim/bildirimler',
      '/yonetim/denetim',
      '/yonetim/metrikler',
      '/yonetim/pazar-fiyatlari',
      '/yonetim/ayarlar',
    ])

    const unexpected = adminNav.map((item) => item.href).filter((href) => !allowed.has(href))
    expect(unexpected).toEqual([])
  })

  it('reads the route map itself, so this test cannot drift from the document', () => {
    // If somebody adds a deferred screen to `07`'s admin table, the allow-list above stops
    // being a defence. Assert the document still calls them deferred.
    const doc = readFileSync(
      fileURLToPath(
        new URL('../../../Yazılım Mimari Promptlar/07-frontend-architecture.md', import.meta.url),
      ),
      'utf8',
    )

    const deferredSection = doc.slice(doc.indexOf('### Deferred screens'))
    for (const { screen } of DEFERRED) {
      expect(deferredSection, screen).toContain(screen)
    }
  })
})

describe('every navigation label is a message key that exists', () => {
  // `I18N-01`: `labelKey` is a key, never a string. A key with no message renders as the key
  // path — visible only to whoever opens that page in that locale.
  const namespaces = {
    public: publicNav,
    customer: customerNav,
    manufacturer: manufacturerNav,
    admin: adminNav,
  } as const

  it.each(Object.entries(namespaces))('nav.%s', (namespace, items) => {
    const nav = (trMessages as { nav: Record<string, Record<string, string>> }).nav[namespace]
    expect(nav, namespace).toBeDefined()

    const missing = items.filter((item) => nav?.[item.labelKey] === undefined)
    expect(missing.map((item) => item.labelKey)).toEqual([])
  })
})

/**
 * **Every navigation link reaches a page on disk** — task 14.2.
 *
 * The existing tests hold `labelKey` to the catalogue and the hrefs to `07`'s route map.
 * Neither asks the only question a person clicking the link cares about: *is there a page
 * there?* So the sidebar has been advertising 404s since Phase 3 — `/takvim`, `/ekip`,
 * `/analitik`, `/yonetim/musteriler` and five more — and the suite stayed green, because a
 * route map is a document and a document can describe a page nobody built.
 *
 * That is the same failure this file's own comment warns about one screen up: *"a link to a
 * 404 advertises a page the same way a disabled link advertises a feature."*
 *
 * The fix is not to delete the links — the information architecture is real and the screens
 * are designed and coming. It is to make the debt **countable and shrinking**: `UNBUILT` is
 * pinned, so building one fails this test until it is struck off the list, and adding a
 * ninth fails it immediately. The same arrangement `api-surface.test.ts` uses for its
 * unreachable-capability inventory.
 */
describe('14.2 · navigation links reach a page', () => {
  const APP = join(process.cwd(), 'src', 'app', '[locale]')

  /**
   * **Empty, and that is the assertion** (task 13.8).
   *
   * It held twelve routes when 14.2 pinned it. One was built (`/panel/[companyId]`, the
   * portal dashboard — the landing point of a manufacturer sign-in, which 404'd) and eleven
   * left the navigation for `07` §Deferred screens with a reason each. A link to a 404 is
   * the promise `07` forbids, so the honest end state is a list with nothing in it.
   *
   * If this ever needs an entry again, the entry is the argument: say why the link ships
   * before the page.
   */
  const UNBUILT: string[] = []

  /**
   * Does a `page.tsx` exist for this route? Segments are matched literally first, then
   * against any single dynamic segment — the router's own precedence, minus the catch-all,
   * which by design matches everything and would make this test always pass.
   */
  function pageExists(route: string): boolean {
    const walk = (dir: string, segments: readonly string[]): boolean => {
      if (segments.length === 0) return existsSync(join(dir, 'page.tsx'))

      const [head, ...rest] = segments as [string, ...string[]]
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return false
      }

      // A literal child, a route group `(x)` that is transparent to the URL, or a single
      // dynamic segment `[x]` — never `[...x]`.
      for (const entry of entries) {
        if (entry === head) return walk(join(dir, entry), rest)
      }
      for (const entry of entries) {
        if (entry.startsWith('(') && walk(join(dir, entry), segments)) return true
      }
      for (const entry of entries) {
        if (entry.startsWith('[') && !entry.startsWith('[...') && walk(join(dir, entry), rest)) {
          return true
        }
      }
      return false
    }

    return walk(APP, route.split('/').filter(Boolean))
  }

  /** The portal hrefs are suffixes after the company id; make them whole routes. */
  const routes = [
    ...publicNav.map((item) => item.href),
    ...customerNav.map((item) => item.href),
    ...manufacturerNav.map((item) => `/panel/[companyId]${item.href}`),
    ...adminNav.map((item) => item.href),
  ]

  it('finds the pages that DO exist, so the scan is not scanning nothing', () => {
    // If this ever breaks, the resolver is wrong and every other assertion here is noise.
    expect(pageExists('/kategoriler')).toBe(true)
    expect(pageExists('/panel/[companyId]/takvim')).toBe(true)
    expect(pageExists('/yonetim/denetim')).toBe(true)
    expect(pageExists('/hesap/verilerim')).toBe(true)
    expect(pageExists('/kesinlikle-boyle-bir-sayfa-yok')).toBe(false)
  })

  it('has no link to a 404 beyond the pinned inventory', () => {
    const missing = routes.filter((route) => !pageExists(route)).sort()
    expect(missing).toEqual([...UNBUILT].sort())
  })

  it('keeps the inventory honest — a route that got built must leave the list', () => {
    const built = UNBUILT.filter((route) => pageExists(route))
    expect(built, 'these are built now; strike them off UNBUILT').toEqual([])
  })
})
