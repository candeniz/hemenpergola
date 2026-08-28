import 'server-only'

/**
 * The push port — the same swap-point shape as `mailer.ts` and `sms-sender.ts`, and for
 * the same reason: the dispatch job's discipline (claim-then-send, at-least-once for
 * mandatory events) is tested against a recorder, never against Expo's servers.
 *
 * The default adapter talks to Expo's push API. It works in development against Expo Go
 * with no credentials; a standalone Android build needs FCM credentials wired through EAS,
 * which is Q32's user-side chain — the code path is identical either way.
 */

/**
 * The Android notification channel the app creates on registration
 * (`mobile/src/push/register.ts`), and the one this message must name.
 *
 * Verified against the installed `expo-notifications` (task 13.4):
 * `FirebaseNotificationTrigger.kt` resolves the channel as
 * `remoteMessage.notification?.channelId ?: remoteMessage.data["channelId"]`, and
 * `BaseNotificationBuilder.kt` falls back to its own
 * `expo_notifications_fallback_notification_channel` when that is null. So a message with
 * no `channelId` did NOT land on the channel the app configured — it landed on a channel
 * expo-notifications creates for itself, carrying neither the app's importance setting nor
 * anything the user tuned on the configured one. The channel existed and was unused.
 */
export const ANDROID_CHANNEL_ID = 'default'

export type PushMessage = {
  /** Expo push tokens — `ExponentPushToken[…]` strings from the device. */
  to: string[]
  title: string
  body: string
  /** Lands in the notification tap handler; `url` is the deep-link path (`ADR-032`). */
  data: Record<string, string>
  /** Android only, ignored by iOS. See `ANDROID_CHANNEL_ID`. */
  channelId: string
}

export type PushSender = {
  name: string
  send(message: PushMessage): Promise<void>
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const expoPushSender: PushSender = {
  name: 'expo',
  async send(message) {
    if (message.to.length === 0) return

    // Expo accepts up to 100 messages per request; one recipient list rarely nears it,
    // but the chunking costs one line and removes the cliff.
    for (let start = 0; start < message.to.length; start += 100) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          message.to.slice(start, start + 100).map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data: message.data,
            channelId: message.channelId,
          })),
        ),
      })
      if (!response.ok) {
        throw new Error(`expo push: HTTP ${response.status}`)
      }
    }
  },
}

let sender: PushSender = expoPushSender

export function getPushSender(): PushSender {
  return sender
}

/** Tests swap in a recorder — the same arrangement as `setMailer`. */
export function setPushSender(next: PushSender): void {
  sender = next
}
