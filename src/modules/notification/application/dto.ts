import { z } from 'zod'

import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_EVENTS,
  type NotificationType,
} from '../domain/catalog'

/**
 * The preference contract (`13` §Preferences), extracted from `preference-service.ts` in
 * Phase 11.2. Runtime-pure — the domain catalogue it derives from is pure TypeScript —
 * and pinned by `dto-purity.test.ts`.
 */

const CHANNELS = ['email', 'sms'] as const

const eventTypes = ALL_NOTIFICATION_TYPES.filter(
  (type) => NOTIFICATION_EVENTS[type].kind === 'event',
)

/**
 * The channels and the event types a preference can address, for a surface that has to
 * render one control per pair.
 *
 * Exported from the contract rather than read from `domain/` by the caller: `app/` may
 * import only from `application/` (`05` §Layers), and the settings page needs the *whole*
 * catalogue, not the stored rows — `listNotificationPreferences` returns only rows that
 * exist, and absence means enabled, so a page driven by its result would render an empty
 * screen for every new account.
 */
export const PREFERENCE_CHANNELS = CHANNELS
export const PREFERENCE_EVENT_TYPES: readonly NotificationType[] = eventTypes
export { isMandatory } from '../domain/catalog'

export const setNotificationPreferenceSchema = z.object({
  channel: z.enum(CHANNELS),
  type: z.enum(eventTypes as [NotificationType, ...NotificationType[]]),
  enabled: z.boolean(),
})
export type SetNotificationPreferenceInput = z.infer<typeof setNotificationPreferenceSchema>

export type NotificationPreferenceView = {
  channel: (typeof CHANNELS)[number]
  type: NotificationType
  enabled: boolean
}
