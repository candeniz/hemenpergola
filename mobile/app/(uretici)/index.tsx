import { HomeScreen } from '../../src/screens/HomeScreen'
import { useSession } from '../../src/state/session'

export default function UreticiHome() {
  const { session, signOut } = useSession()
  const companyName = session.state === 'signed-in' ? session.companyName : null
  return (
    <HomeScreen
      locale="tr"
      role="manufacturer"
      companyName={companyName}
      onSignOut={() => void signOut()}
    />
  )
}
