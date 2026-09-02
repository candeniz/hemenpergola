import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * **Why the web inbox row is not a link** — task 14.10, holding the decision in `13` §Inbox.
 *
 * The mobile inbox navigates on tap; the web one prints the same row as text. That is not a
 * product opinion about what an inbox is, and pretending it were would be inventing a reason.
 * It is the route maps: a notification's payload identifies an **offer request**, expo-router
 * has a flat route keyed by exactly that (`(musteri)/talep/[id]`, `(uretici)/talep/[id]`), and
 * the web route map does not. The web surfaces are nested under a parent the notification does
 * not carry — `hesap/projeler/[id]/talepler` needs the **project**, and
 * `panel/[companyId]/talepler/[requestId]` needs the **company**.
 *
 * So this file pins the fact the decision rests on rather than the decision itself. The day
 * the web map grows a route reachable from an offer request alone, the second test here goes
 * red — and that is the moment to reopen `13` §Inbox, because the cheap version of (a) has
 * become available. Until then, linking would mean widening every payload (frozen, `19`
 * §Export), joining `OfferRequest` for fifty rows on every render, or inventing a redirect
 * screen — three prices for a link, none of them small.
 */

const APP = join(process.cwd(), 'src', 'app', '[locale]')
const MOBILE_APP = join(process.cwd(), 'mobile', 'app')

/** Every route directory under `root`, as `/`-joined segment lists. */
function routes(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string, trail: string[]): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        if (/^(page|index)\.tsx$/.test(entry.name)) found.push(trail.join('/'))
        continue
      }
      walk(join(dir, entry.name), [...trail, entry.name])
    }
    // expo-router files are routes themselves, not folders with an index.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        /\.tsx$/.test(entry.name) &&
        !/^(page|index|_layout)\.tsx$/.test(entry.name)
      ) {
        found.push([...trail, entry.name.replace(/\.tsx$/, '')].join('/'))
      }
    }
  }
  walk(root, [])
  return found
}

const webRoutes = routes(APP)
const mobileRoutes = routes(MOBILE_APP)

describe('14.10 · the web inbox row has nowhere to point', () => {
  it('the fixture found both route trees', () => {
    // A guard against the walk silently returning nothing and every assertion passing.
    expect(webRoutes.length).toBeGreaterThan(20)
    expect(mobileRoutes.length).toBeGreaterThan(10)
  })

  it('mobile has a route keyed by the offer request alone — which is why a tap works there', () => {
    const flat = mobileRoutes.filter((route) => /(^|\/)talep\/\[id\]($|\/)/.test(route))
    expect(flat.length, 'expo-router: /(shell)/talep/[id]').toBeGreaterThan(0)
  })

  it('the web map reaches an offer request only through a parent the payload does not carry', () => {
    /*
     * Two shapes on disk today, and both need an id a notification has never carried:
     *   (customer)     hesap/projeler/[id]/talepler        → the PROJECT
     *   (manufacturer) panel/[companyId]/talepler/[requestId] → the COMPANY
     *
     * A route that needed only the request would look like `…/talepler/[requestId]` with no
     * other dynamic segment before it. There is none — and if one appears, reopen the
     * decision rather than deleting this test.
     */
    const offerRequestRoutes = webRoutes.filter((route) => /talep/.test(route))
    expect(offerRequestRoutes.length, 'the fixture must be looking at something').toBeGreaterThan(0)

    const reachableFromRequestAlone = offerRequestRoutes.filter((route) => {
      const dynamic = [...route.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1] as string)
      return dynamic.length === 1 && /request|talep/i.test(dynamic[0] ?? '')
    })

    expect(
      reachableFromRequestAlone,
      'a web route keyed by the offer request alone would make 13 §Inbox’s option (a) cheap',
    ).toEqual([])
  })
})
