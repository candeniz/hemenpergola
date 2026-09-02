import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ALL_NOTIFICATION_TYPES,
  MANDATORY_EVENTS,
  NOTIFICATION_EVENTS,
  type NotificationChannel,
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

  it('every event has a TRIGGER — a template without a notify() call site cannot stay listed', () => {
    /*
     * The gap Phase 7's gate left and Phase 9 closed: the gate proved every event
     * RENDERS, and `appointment_reminder`/`offer_expiring` lived for two phases with
     * templates and no code that could ever fire them — a product promise with no
     * product. This scan walks src/ for `type: '<event>'` literals (the only way
     * `notify()` is ever called names its event inline), so an event added to the
     * catalogue without a trigger fails HERE, not in a customer conversation.
     */
    const sources: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
        sources.push(readFileSync(full, 'utf8'))
      }
    }
    walk(join(process.cwd(), 'src'))
    const everything = sources.join('\n')

    const untriggered = ALL_NOTIFICATION_TYPES.filter(
      (type) =>
        // The direct form, plus the two arms a ternary call site produces
        // (offer-service's revise-vs-received is real code, not a loophole). Bare
        // string-literal mentions (the audit-action union shares some names) do NOT
        // count — only shapes a notify() type argument can take.
        !everything.includes(`type: '${type}'`) &&
        !everything.includes(`? '${type}'`) &&
        !everything.includes(`: '${type}'`),
    )
    expect(untriggered).toEqual([])
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

  /**
   * `13`'s event catalogue must say what the code sends — task 13.5.
   *
   * It did not. The table was written before Phase 12 added push and still read
   * "in-app, email" for events the dispatcher had been sending four ways for weeks, which
   * is the worst state a document can be in: confidently wrong, and therefore quoted. It is
   * generated now (`scripts/generate-notification-table.mjs`), and this is the check that
   * keeps it so — the arrangement `02`'s permission table has had since Phase 1.
   *
   * Regenerate with: node scripts/generate-notification-table.mjs
   */
  it('13 §Event catalogue names every event with the channels the code sends', () => {
    const document = readFileSync(
      join(process.cwd(), 'Yazılım Mimari Promptlar/13-notifications.md'),
      'utf8',
    )
    const begin = document.indexOf('<!-- BEGIN GENERATED NOTIFICATION TABLE -->')
    const end = document.indexOf('<!-- END GENERATED NOTIFICATION TABLE -->')

    expect(begin, 'generated block missing from 13').toBeGreaterThan(-1)
    const block = document.slice(begin, end)

    const LABEL: Record<NotificationChannel, string> = {
      in_app: 'in-app',
      push: 'push',
      email: 'email',
      sms: 'SMS',
    }

    for (const type of ALL_NOTIFICATION_TYPES) {
      const row = block.split('\n').find((line) => line.startsWith('| `' + type + '` |'))
      expect(row, `no row for ${type} in 13`).toBeDefined()
      if (row === undefined) continue

      const entry = NOTIFICATION_EVENTS[type]
      const cells = row.split('|').map((cell) => cell.trim())
      const customer = cells[2]
      const manufacturer = cells[3]
      const channels = cells[4] ?? ''

      expect(customer === '✓', `${type} customer audience disagrees with the code`).toBe(
        entry.audience === 'customer' || entry.audience === 'both',
      )
      expect(manufacturer === '✓', `${type} manufacturer audience disagrees`).toBe(
        entry.audience === 'manufacturer' || entry.audience === 'both',
      )

      // Every channel the code sends is named, and no channel it does not send is.
      const named = channels.split(',').map((part) => part.trim().replace(/\s.*$/, ''))
      for (const channel of ['in_app', 'push', 'email', 'sms'] as const) {
        const sends = (entry.channels as readonly string[]).includes(channel)
        expect(named.includes(LABEL[channel]), `${type} × ${channel} disagrees`).toBe(sends)
      }

      expect(channels.includes('**(mandatory)**'), `${type} mandatory flag`).toBe(
        (MANDATORY_EVENTS as readonly string[]).includes(type),
      )
    }
  })

  /**
   * **Every payload field passes the "other side's data" test** — task 14.6.
   *
   * The KVKK export renders these payloads into the subject's own copy, and messages have
   * had this rule since Phase 7: an export carries what the subject WROTE, never what the
   * other side wrote, because a copy that leaves our custody must not carry a third party's
   * personal data. Payloads had never been held to it. They pass today by accident — the one
   * pre-disclosure event, `offer_request_received`, carries a city, an area and an id — and
   * an accident is not a rule.
   *
   * So the allowed vocabulary is pinned. The two name-shaped fields on it are argued rather
   * than assumed:
   *
   *   `companyName`   a manufacturer's display name, which is public directory data — the
   *                   same field `/ureticiler` lists to anonymous visitors.
   *   `senderName`    only on `message_received`, and messaging opens at acceptance
   *                   (`ADR-028`), so by the time it can be sent the contact disclosure has
   *                   already happened with its record and its notification.
   *
   * A new key fails here and the failure is the question: whose data is this, and has the
   * subject already been told? `19` §Export carries the rule in prose.
   */
  it('19 §Export · no payload field carries a third party’s personal data', () => {
    const ALLOWED = new Set([
      // Counts, times and machine references — nobody's personal data.
      'companyCount',
      'hoursLeft',
      'offerNumber',
      'rating',
      'validUntil',
      'version',
      'when',
      // Place, not person: a city is where the work is, at city granularity.
      'cityName',
      'areaM2',
      // A moderator's published grounds for rejecting a review — about the text, not a person.
      'reason',
      // Argued above.
      'companyName',
      'senderName',
    ])

    const offenders: string[] = []
    for (const type of ALL_NOTIFICATION_TYPES) {
      for (const key of Object.keys(NOTIFICATION_EVENTS[type].sample)) {
        if (!ALLOWED.has(key)) offenders.push(`${type}.${key}`)
      }
    }

    expect(
      offenders,
      'a new payload field: whose data is it, and has the subject been told? See 19 §Export.',
    ).toEqual([])
  })

  /**
   * The blunt half of the same rule: whatever the vocabulary says, an address or a number
   * must never appear. This catches a field that slips onto the list above by looking
   * harmless — `contact`, say — and then carries an email.
   */
  it('19 §Export · no payload SAMPLE contains an email or a phone number', () => {
    const offenders: string[] = []
    for (const type of ALL_NOTIFICATION_TYPES) {
      const serialised = JSON.stringify(NOTIFICATION_EVENTS[type].sample)
      if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(serialised)) offenders.push(`${type} · email`)
      if (/(\+90|0)\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/.test(serialised)) {
        offenders.push(`${type} · phone`)
      }
    }
    expect(offenders).toEqual([])
  })
})
