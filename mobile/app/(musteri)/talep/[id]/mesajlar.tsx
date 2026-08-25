import { Stack, useLocalSearchParams } from 'expo-router'

import { ThreadScreen } from '../../../../src/screens/ThreadScreen'
import { t } from '../../../../src/i18n'

export default function MusteriMesajlar() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <>
      <Stack.Screen options={{ title: t('tr', 'mobile.messages.title') }} />
      <ThreadScreen locale="tr" offerRequestId={id} side="customer" companyId={null} />
    </>
  )
}
