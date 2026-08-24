import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ALL_NOTIFICATION_TYPES,
  MANDATORY_EVENTS,
  NOTIFICATION_EVENTS,
  type NotificationType,
} from './catalog'
import { channelsFor, renderNotification, TEMPLATES } from './notification-templates'

/**
 * The Phase 7 gate, as a test — `21` §Phase 7: "every event in `13-notifications.md`
 * fires with a rendered `tr` template". The event list is read FROM THE CODE
 * (`NOTIFICATION_EVENTS`), not from a hand-counted list in this file: a new event enters
 * the loops below by existing. Completeness has two layers:
 *
 *   1. compile time — `TEMPLATES` is `Record<NotificationType, …>`, so an event added to
 *      the catalogue without a template entry fails `pnpm typecheck`;
 *   2. run time — each template renders against the catalogue's `sample` payload here, and
 *      an empty body or a leftover `{placeholder}` fails the test.
 */

const EVENT_TYPES = ALL_NOTIFICATION_TYPES.filter(
  (type) => NOTIFICATION_EVENTS[type].kind === 'event',
)

const SUBSCRIPTION_TYPES = ALL_NOTIFICATION_TYPES.filter(
  (type) => NOTIFICATION_EVENTS[type].kind === 'subscription',
)

// `value()` renders a missing payload key as `{key}` on purpose, so this is the
// detector for both a template hole and an incomplete catalogue `sample`.
const LEFTOVER_PLACEHOLDER = /\{[a-zA-Z]/

describe('notification catalogue (phase gate)', () => {
  it('holds every event 13-notifications.md defines, and nothing renders for subscriptions', () => {
    // 13's fifteen rows plus the split lifecycle events and 16's rejection notice;
    // auth.* is deliberately outside the catalogue (direct security mail,
    // domain/templates.ts, covered by templates.test.ts — the gate's other half).
    expect(EVENT_TYPES.length).toBe(20)
    expect(SUBSCRIPTION_TYPES).toEqual(['supply_gap_watch'])

    for (const type of SUBSCRIPTION_TYPES) {
      expect(TEMPLATES[type]).toBeNull()
      expect(renderNotification(type, 'tr', {})).toBeNull()
      expect(NOTIFICATION_EVENTS[type].channels).toEqual([])
    }
  })

  for (const type of EVENT_TYPES) {
    it(`renders a complete tr and en template for ${type}`, () => {
      const sample = NOTIFICATION_EVENTS[type].sample

      for (const locale of ['tr', 'en'] as const) {
        const rendered = renderNotification(type, locale, sample)
        expect(rendered, `${type}/${locale} must render`).not.toBeNull()
        if (rendered === null) return

        expect(rendered.title.trim().length, `${type}/${locale} title`).toBeGreaterThan(0)
        expect(rendered.body.trim().length, `${type}/${locale} body`).toBeGreaterThan(0)
        expect(rendered.title, `${type}/${locale} title placeholder`).not.toMatch(
          LEFTOVER_PLACEHOLDER,
        )
        expect(rendered.body, `${type}/${locale} body placeholder`).not.toMatch(
          LEFTOVER_PLACEHOLDER,
        )

        if (channelsFor(type).includes('sms')) {
          expect(rendered.sms, `${type}/${locale} grants sms but renders none`).toBeDefined()
          expect(rendered.sms ?? '').not.toMatch(LEFTOVER_PLACEHOLDER)
          expect((rendered.sms ?? '').trim().length).toBeGreaterThan(0)
        } else {
          expect(rendered.sms, `${type}/${locale} renders sms it was never granted`).toBe(undefined)
        }
      }
    })
  }

  it('pins the mandatory (non-opt-outable) events as a closed list — ADR-027', () => {
    const pinned: readonly NotificationType[] = ['contact_disclosed']
    expect(MANDATORY_EVENTS).toEqual(pinned)
  })

  it('keeps notify.ts the only Notification writer in src/', () => {
    const writers: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
        const source = readFileSync(full, 'utf8')
        if (/\bnotification\.create(?:Many(?:AndReturn)?)?\s*\(/.test(source)) {
          writers.push(full.replace(/\\/g, '/'))
        }
      }
    }
    walk(join(process.cwd(), 'src'))

    expect(writers).toEqual([
      join(process.cwd(), 'src/modules/notification/infrastructure/notify.ts').replace(/\\/g, '/'),
    ])
  })
})
