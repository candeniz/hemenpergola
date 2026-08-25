import { HomeScreen } from '../../src/screens/HomeScreen'
import { useSession } from '../../src/state/session'

export default function MusteriHome() {
  const { signOut } = useSession()
  return (
    <HomeScreen locale="tr" role="customer" companyName={null} onSignOut={() => void signOut()} />
  )
}
