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

export type PushMessage = {
  /** Expo push tokens — `ExponentPushToken[…]` strings from the device. */
  to: string[]
  title: string
  body: string
  /** Lands in the notification tap handler; `url` is the deep-link path (`ADR-032`). */
  data: Record<string, string>
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
