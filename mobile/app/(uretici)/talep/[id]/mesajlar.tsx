import { Stack, useLocalSearchParams } from 'expo-router'

import { ThreadScreen } from '../../../../src/screens/ThreadScreen'
import { t } from '../../../../src/i18n'
import { useSession } from '../../../../src/state/session'

export default function UreticiMesajlar() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()
  const companyId = session.state === 'signed-in' ? session.companyId : null

  return (
    <>
      <Stack.Screen options={{ title: t('tr', 'mobile.messages.title') }} />
      <ThreadScreen locale="tr" offerRequestId={id} side="company" companyId={companyId} />
    </>
  )
}
