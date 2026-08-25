import 'server-only'

import { z } from 'zod'

import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import {
  ALL_NOTIFICATION_TYPES,
  isMandatory,
  NOTIFICATION_EVENTS,
  type NotificationType,
} from '../domain/catalog'

/**
 * Notification preferences — `13` §Preferences, task 7.1. The model is deliberately
 * sparse: **absence of a row means enabled**, so a `NotificationPreference` row only
 * exists when a user switched something off (or back on, leaving an `enabled: true`
 * row behind — equivalent to absence, cheaper than a delete-vs-upsert dance).
 *
 * In-app is not a preference: the row IS the in-app delivery and the user's history
 * (`13`). Only `email` and `sms` can be tuned, per event type.
 *
 * `MANDATORY_EVENTS` (`ADR-027`) cannot be switched off, and the refusal happens here at
 * the write — not silently at dispatch — so the user is told "no" instead of holding a
 * preference row the system ignores.
 */

const CHANNELS = ['email', 'sms'] as const

const eventTypes = ALL_NOTIFICATION_TYPES.filter(
  (type) => NOTIFICATION_EVENTS[type].kind === 'event',
)

/**
 * The channels and the event types a preference can address, for a surface that has to
 * render one control per pair.
 *
 * Re-exported from the application layer rather than read from `domain/` by the caller:
 * `app/` may import only from `application/` (`05` §Layers), and the settings page needs
 * the *whole* catalogue, not the stored rows — `listNotificationPreferences` returns only
 * rows that exist, and absence means enabled, so a page driven by its result would render
 * an empty screen for every new account.
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

export const listNotificationPreferences = serviceMethod<
  Record<string, never>,
  NotificationPreferenceView[]
>('notification', 'listNotificationPreferences', { kind: 'authenticated' }, async (actor) => {
  if (actor.userId === null) return err(notFound('NotificationPreference'))

  const rows = await prisma.notificationPreference.findMany({
    where: { userId: actor.userId },
    select: { channel: true, type: true, enabled: true },
    orderBy: [{ type: 'asc' }, { channel: 'asc' }],
  })

  return ok(
    rows
      .filter(
        (row): row is typeof row & { channel: 'email' | 'sms'; type: NotificationType } =>
          (CHANNELS as readonly string[]).includes(row.channel) &&
          (ALL_NOTIFICATION_TYPES as string[]).includes(row.type),
      )
      .map((row) => ({ channel: row.channel, type: row.type, enabled: row.enabled })),
  )
})

export const setNotificationPreference = serviceMethod<
  SetNotificationPreferenceInput,
  NotificationPreferenceView
>('notification', 'setNotificationPreference', { kind: 'authenticated' }, async (actor, input) => {
  if (actor.userId === null) return err(notFound('NotificationPreference'))

  if (!input.enabled && isMandatory(input.type)) {
    return err(precondition('Bu bildirim yasal kaydın parçasıdır ve kapatılamaz (ADR-027).'))
  }

  const row = await prisma.notificationPreference.upsert({
    where: {
      userId_channel_type: {
        userId: actor.userId,
        channel: input.channel,
        type: input.type,
      },
    },
    create: {
      userId: actor.userId,
      channel: input.channel,
      type: input.type,
      enabled: input.enabled,
    },
    update: { enabled: input.enabled },
    select: { channel: true, type: true, enabled: true },
  })

  return ok({
    channel: input.channel,
    type: input.type,
    enabled: row.enabled,
  })
})
