#!/usr/bin/env node
/**
 * Run with: node scripts/generate-notification-table.mjs
 *
 * Regenerates the event catalogue in `13-notifications.md` from
 * `src/modules/notification/domain/catalog.ts`.
 *
 * The sibling of `generate-permission-table.mjs`, and it exists for the same reason and one
 * more. `13`'s table was written before Phase 12 added the push channel and was still
 * listing "in-app, email" for events the dispatcher had been sending four ways for weeks —
 * a document that is confidently wrong is worse than one that is missing, because it gets
 * quoted. Hand-editing it back would have been correct for exactly as long as the catalogue
 * stayed still.
 *
 *   node scripts/generate-notification-table.mjs           # rewrite the document
 *   node scripts/generate-notification-table.mjs --check    # exit 1 if it would change
 *
 * `notification-catalog.test.ts` runs the check, so the instruction is enforced rather than
 * written down.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const { NOTIFICATION_EVENTS, ALL_NOTIFICATION_TYPES, isMandatory } =
  await import('../src/modules/notification/domain/catalog.ts')

const DOC = 'Yazılım Mimari Promptlar/13-notifications.md'
const BEGIN = '<!-- BEGIN GENERATED NOTIFICATION TABLE -->'
const END = '<!-- END GENERATED NOTIFICATION TABLE -->'

const CHANNEL_LABEL = {
  in_app: 'in-app',
  push: 'push',
  email: 'email',
  sms: 'SMS',
}

const AUDIENCE_MARK = {
  customer: ['✓', '—'],
  manufacturer: ['—', '✓'],
  both: ['✓', '✓'],
}

export function renderTable() {
  const rows = ALL_NOTIFICATION_TYPES.map((type) => {
    const entry = NOTIFICATION_EVENTS[type]
    const [customer, manufacturer] = AUDIENCE_MARK[entry.audience]

    const channels =
      entry.kind === 'subscription'
        ? '— (standing intent, never dispatched)'
        : entry.channels.map((channel) => CHANNEL_LABEL[channel]).join(', ')

    const mandatory = isMandatory(type) ? ' **(mandatory)**' : ''

    return `| \`${type}\` | ${customer} | ${manufacturer} | ${channels}${mandatory} |`
  })

  return [
    BEGIN,
    '',
    '<!-- Generated from src/modules/notification/domain/catalog.ts by',
    '     scripts/generate-notification-table.mjs. Do not edit by hand:',
    '     notification-catalog.test.ts fails when this drifts from the code. -->',
    '',
    '| Event | Customer | Manufacturer | Channels |',
    '|---|:--:|:--:|---|',
    ...rows,
    '',
    '**(mandatory)** — `ADR-027`: no preference row can switch it off, because the',
    'notification is a leg of the disclosure’s legal record (`19` §Disclosure).',
    '',
    'The `auth.*` family is deliberately absent: password reset, new device and lockout are',
    'direct security emails (`domain/templates.ts`), never `Notification` rows, and they ignore',
    'preferences by construction.',
    '',
    END,
  ].join('\n')
}

const document = readFileSync(DOC, 'utf8')
const begin = document.indexOf(BEGIN)
const end = document.indexOf(END)

if (begin === -1 || end === -1) {
  console.error(`Markers not found in ${DOC}. Add:\n  ${BEGIN}\n  ${END}`)
  process.exit(1)
}

const next = document.slice(0, begin) + renderTable() + document.slice(end + END.length)

if (process.argv.includes('--check')) {
  if (next !== document) {
    console.error(`${DOC} is out of date. Run: node scripts/generate-notification-table.mjs`)
    process.exit(1)
  }
  console.log(`${DOC} is up to date.`)
  process.exit(0)
}

writeFileSync(DOC, next)
console.log(`${DOC} regenerated from the catalogue.`)
