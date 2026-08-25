import { useRouter } from 'expo-router'

import { LoginScreen } from '../src/screens/LoginScreen'
import { useSession } from '../src/state/session'

/** The wall. On success the session re-derives and `/` forks to the right shell. */
export default function Giris() {
  const router = useRouter()
  const { refresh } = useSession()

  return (
    <LoginScreen
      locale="tr"
      onSignedIn={() => {
        void refresh().then(() => router.replace('/'))
      }}
    />
  )
}
