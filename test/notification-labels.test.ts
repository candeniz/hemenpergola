import { describe, expect, it } from 'vitest'

import { ALL_NOTIFICATION_TYPES } from '../src/modules/notification/domain/catalog'
import en from '../src/i18n/messages/en.json'
import tr from '../src/i18n/messages/tr.json'

/**
 * **Every event the inbox can show has a label** — task 14.9.
 *
 * 14.8 decided that a notification whose type the catalogue no longer knows is left out of
 * the inbox, and the reason was what it would look like on screen: both surfaces render a row
 * as `privacy.events.<type>`, and a missing key renders its own path — `next-intl`'s failure
 * mode on the web, and the mobile resolver's deliberately identical one. That decision closed
 * the back door. This test closes the front one: an event ADDED to the catalogue without a
 * label passes the type filter, reaches the list, and prints `privacy.events.the_new_thing`
 * to a customer.
 *
 * Nothing kept the two lists aligned. `messages.test.ts` compares `tr` against `en`, so a key
 * missing from BOTH is invisible to it — and adding an event is exactly the change where both
 * are forgotten together, because one commit touches the catalogue and neither catalogue.
 * `mobile-i18n.test.ts` scans for `t(locale, '…')` with a literal string, and the inbox asks
 * for `` t(locale, `privacy.events.${item.type}`) `` — a template literal no static scan can
 * resolve. Twenty-one and twenty-one, held by nothing but a habit.
 *
 * **Both surfaces in one assertion**, and that is a property rather than a shortcut: mobile
 * imports these same two files through `@messages/*`, which `mobile-boundary.test.ts` pins to
 * `src/i18n/messages/*` (`I18N-01` — imported, never copied). If that ever became a second
 * copy, that test fails first and this one keeps its meaning.
 *
 * Bidirectional, the `nav-items.test.ts` discipline: the catalogue may not outgrow the labels,
 * and the labels may not outlive the catalogue. A one-way check leaves a renamed event's old
 * label sitting in both files forever, which is how a catalogue becomes archaeology.
 */

type Tree = { [key: string]: string | Tree }

const labels = (tree: Tree): Record<string, string | Tree> => {
  const events = (tree.privacy as Tree | undefined)?.events
  if (typeof events !== 'object' || events === null) throw new Error('privacy.events is missing')
  return events
}

const trLabels = labels(tr as Tree)
const enLabels = labels(en as Tree)

describe('14.9 · notification labels are bound to the catalogue', () => {
  it('every catalogue event has a Turkish label', () => {
    const missing = ALL_NOTIFICATION_TYPES.filter((type) => typeof trLabels[type] !== 'string')
    expect(missing, 'an event with no label prints `privacy.events.<type>` to a customer').toEqual(
      [],
    )
  })

  it('every catalogue event has an English label', () => {
    const missing = ALL_NOTIFICATION_TYPES.filter((type) => typeof enLabels[type] !== 'string')
    expect(missing).toEqual([])
  })

  it('has no label for an event the catalogue does not have', () => {
    /*
     * The other direction. A renamed event leaves its old label behind in both files, where it
     * reads like a supported event to anyone auditing the list — and where the next person to
     * add an event copies its shape. `13`'s catalogue is the closed list; this namespace is
     * its rendering, not a second register.
     */
    const dead = Object.keys(trLabels).filter(
      (key) => !(ALL_NOTIFICATION_TYPES as string[]).includes(key),
    )
    expect(dead, 'a label with no event behind it').toEqual([])
  })

  it('the two sides are the same size, so neither can drift quietly', () => {
    expect(Object.keys(trLabels)).toHaveLength(ALL_NOTIFICATION_TYPES.length)
    expect(Object.keys(enLabels)).toHaveLength(ALL_NOTIFICATION_TYPES.length)
  })

  it('no label is the bare event key — a placeholder that would pass the checks above', () => {
    // `"offer_accepted": "offer_accepted"` satisfies every assertion so far and puts the same
    // machine string on screen the missing key would have.
    const placeholders = ALL_NOTIFICATION_TYPES.filter(
      (type) => trLabels[type] === type || enLabels[type] === type,
    )
    expect(placeholders).toEqual([])
  })
})
