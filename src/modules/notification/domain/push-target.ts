import { NOTIFICATION_EVENTS, type NotificationType } from './catalog'

/**
 * Where a notification tap lands — `ADR-032`'s payoff: expo-router made every screen a
 * URL, so this map is the WHOLE of deep-link wiring. The audience comes from the
 * catalogue (each event already declares who it addresses), which picks the shell; the
 * payload's ids pick the screen.
 *
 * Pure domain: the worker calls it to stamp `data.url` on the push, and nothing else is
 * needed on the device beyond `router.push(url)`.
 */
export function pushTargetPath(
  type: NotificationType,
  payload: Record<string, unknown>,
): string | null {
  const entry = NOTIFICATION_EVENTS[type]
  const offerRequestId = typeof payload.offerRequestId === 'string' ? payload.offerRequestId : null

  const shell = entry.audience === 'manufacturer' ? '(uretici)' : '(musteri)'

  if (type === 'message_received' && offerRequestId !== null) {
    return `/${shell}/talep/${offerRequestId}/mesajlar`
  }
  if (offerRequestId !== null) {
    return `/${shell}/talep/${offerRequestId}`
  }

  // Account-level events (verification, price book, supply watch): the shell's home.
  return `/${shell}`
}
