import { readFileSync } from 'node:fs'
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
     */
    const allowed = new Set([
      '/yonetim',
      '/yonetim/ureticiler',
      '/yonetim/musteriler',
      '/yonetim/talepler',
      '/yonetim/katalog',
      '/yonetim/degerlendirmeler',
      '/yonetim/sikayetler',
      '/yonetim/cms',
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
