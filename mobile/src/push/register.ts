import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { request } from '../api/client'

/**
 * Register this device for the push channel (12.3), best-effort by design.
 *
 * Every early return is a NORMAL state, not an error: an emulator has no push transport,
 * a person may refuse permission, and `getExpoPushTokenAsync` needs an EAS `projectId` —
 * which needs an Expo account, which is Q32's user-side chain. In development against
 * Expo Go the classic flow works; in a standalone Android build FCM credentials join the
 * same chain. The app must work identically WITHOUT push: it is a channel, not a spine.
 */

let registeredToken: string | null = null

export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return // emulators have no push transport

    if (Platform.OS === 'android') {
      // The channel Android files everything under; the plugin's icon/colour apply to it.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Hemen Pergola',
        importance: Notifications.AndroidImportance.HIGH,
      })
    }

    const existing = await Notifications.getPermissionsAsync()
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync()
    if (!permission.granted) return

    const { data: token } = await Notifications.getExpoPushTokenAsync()
    registeredToken = token

    await request('/me/push-tokens', {
      method: 'POST',
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    })
  } catch {
    // Q32: no projectId / no FCM yet. The chain is recorded; the app carries on silent.
  }
}

/** Sign-out's leg: this device stops being an address for the account. */
export async function unregisterPush(): Promise<void> {
  if (registeredToken === null) return
  const token = registeredToken
  registeredToken = null
  try {
    await request('/me/push-tokens', { method: 'DELETE', body: { token } })
  } catch {
    // Best-effort: the server's 180-day sweep prunes what a flaky sign-out leaves.
  }
}
