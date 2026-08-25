import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { LeadView } from '@contracts/offer'

import * as api from '../../../src/api/endpoints'
import { useLead, useLeadTransition } from '../../../src/api/hooks'
import { formatWhen } from '../../../src/lib/format'
import { statusLabel } from '../../../src/lib/status'
import { t, type Locale } from '../../../src/i18n'
import { useSession } from '../../../src/state/session'
import { colors } from '../../../src/theme'
import { Badge, Button, ErrorText, Field, QueryStates } from '../../../src/ui/primitives'
import { OfferComposer } from '../../../src/screens/OfferComposer'

/**
 * One lead, and every transition `11` allows the manufacturer from its current status.
 *
 * **The status on screen is always the server's answer.** Every action invalidates the
 * query and the screen re-renders from the refetch — no optimistic writes, because a
 * locally-guessed status is how the two parties end up reading different numbers, and the
 * state machine's CONFLICT answers are meaningful only if the screen shows what the server
 * actually holds.
 */
export default function LeadDetail() {
  const locale: Locale = 'tr'
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()
  const companyId = session.state === 'signed-in' ? (session.companyId ?? '') : ''

  const lead = useLead(companyId, id)
  const transition = useLeadTransition(companyId, id)

  const [declineReason, setDeclineReason] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const run = (call: () => Promise<import('../../../src/api/client').ApiResult<unknown>>) => {
    setFormError(null)
    transition.mutate(call, {
      onError: () => setFormError(t(locale, 'mobile.common.error')),
    })
  }

  const schedule = () => {
    const scheduledAt = new Date(`${date.trim()}T${time.trim()}:00+03:00`)
    if (Number.isNaN(scheduledAt.getTime())) {
      setFormError(t(locale, 'mobile.leads.badDate'))
      return
    }
    run(() =>
      api.scheduleAppointment(companyId, { offerRequestId: id, scheduledAt, durationMin: 60 }),
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t(locale, 'mobile.leads.project') }} />
      <QueryStates locale={locale} query={lead}>
        {(view: LeadView) => (
          <View style={styles.stack}>
            <Badge label={statusLabel(locale, view.status)} />

            {/* ── the project, contact-free on PENDING by TYPE (lead-dto) ── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t(locale, 'mobile.leads.project')}</Text>
              <Text style={styles.body}>
                {[view.project.cityName, view.project.districtName]
                  .filter((part) => part !== null)
                  .join(' · ')}
              </Text>
              <Text style={styles.body}>
                {t(locale, 'mobile.leads.dimensions')}:{' '}
                {[view.project.widthMm, view.project.depthMm, view.project.heightMm]
                  .map((mm) => (mm === null ? '—' : `${mm / 1000} m`))
                  .join(' × ')}
                {view.project.areaM2 === null
                  ? ''
                  : ` · ${t(locale, 'mobile.leads.area', { area: view.project.areaM2 })}`}
              </Text>
            </View>

            {/* ── contact: exists only on the accepted shape ── */}
            {view.kind === 'accepted' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t(locale, 'mobile.leads.contactTitle')}</Text>
                {view.contact.fullName === null ? null : (
                  <Text style={styles.body}>{view.contact.fullName}</Text>
                )}
                <Text style={styles.body}>{view.contact.email}</Text>
                {view.contact.phone === null ? null : (
                  <Text style={styles.body}>{view.contact.phone}</Text>
                )}
                {view.customerNote === null ? null : (
                  <Text style={styles.muted}>
                    {t(locale, 'mobile.leads.customerNote')}: {view.customerNote}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.muted}>{t(locale, 'mobile.leads.contactHidden')}</Text>
            )}

            <ErrorText message={formError} />

            {/* ── transitions, by current status — 11's table, no local guessing ── */}
            {view.status === 'PENDING' ? (
              <View style={styles.stack}>
                <Button
                  label={t(locale, 'mobile.leads.accept')}
                  busy={transition.isPending}
                  onPress={() => run(() => api.acceptLead(companyId, id))}
                />
                <Field
                  label={t(locale, 'mobile.leads.declineReason')}
                  value={declineReason}
                  onChangeText={setDeclineReason}
                />
                <Button
                  kind="destructive"
                  label={t(locale, 'mobile.leads.decline')}
                  disabled={declineReason.trim().length === 0}
                  busy={transition.isPending}
                  onPress={() =>
                    run(() =>
                      api.declineLead(companyId, { offerRequestId: id, reason: declineReason }),
                    )
                  }
                />
              </View>
            ) : null}

            {view.status === 'ACCEPTED' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t(locale, 'mobile.leads.schedule')}</Text>
                <Field
                  label={t(locale, 'mobile.leads.scheduleDate')}
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-09-01"
                  autoCapitalize="none"
                />
                <Field
                  label={t(locale, 'mobile.leads.scheduleTime')}
                  value={time}
                  onChangeText={setTime}
                  placeholder="14:30"
                  autoCapitalize="none"
                />
                <Button
                  label={t(locale, 'mobile.leads.scheduleSubmit')}
                  busy={transition.isPending}
                  onPress={schedule}
                />
              </View>
            ) : null}

            {view.status === 'SURVEY_SCHEDULED' ? (
              <Button
                label={t(locale, 'mobile.leads.completeSurvey')}
                busy={transition.isPending}
                onPress={() => run(() => api.completeAppointment(companyId, id))}
              />
            ) : null}

            {['ACCEPTED', 'SURVEY_SCHEDULED', 'SURVEY_COMPLETED', 'OFFER_SENT'].includes(
              view.status,
            ) ? (
              <OfferComposer
                locale={locale}
                companyId={companyId}
                offerRequestId={id}
                onDone={() => transition.reset()}
              />
            ) : null}

            {view.status === 'OFFER_ACCEPTED' || view.status === 'OFFER_REJECTED' ? (
              <View style={styles.stack}>
                {view.status === 'OFFER_ACCEPTED' ? (
                  <Button
                    label={t(locale, 'mobile.leads.markWon')}
                    busy={transition.isPending}
                    onPress={() => run(() => api.markOutcome(companyId, id, 'WON'))}
                  />
                ) : null}
                <Field
                  label={t(locale, 'mobile.leads.lostReason')}
                  value={lostReason}
                  onChangeText={setLostReason}
                />
                <Button
                  kind="destructive"
                  label={t(locale, 'mobile.leads.markLost')}
                  disabled={lostReason.trim().length === 0}
                  busy={transition.isPending}
                  onPress={() => run(() => api.markOutcome(companyId, id, 'LOST', lostReason))}
                />
              </View>
            ) : null}

            {view.kind === 'accepted' ? (
              <Link href={`/(uretici)/talep/${id}/mesajlar`} asChild>
                <Pressable accessibilityRole="button" style={styles.messagesLink}>
                  <Text style={styles.messagesLinkText}>{t(locale, 'mobile.messages.title')}</Text>
                </Pressable>
              </Link>
            ) : null}

            <Text style={styles.muted}>{formatWhen(view.createdAt)}</Text>
          </View>
        )}
      </QueryStates>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16 },
  stack: { gap: 12 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 12,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontWeight: '600', marginBottom: 4 },
  body: { color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  messagesLink: { minHeight: 44, justifyContent: 'center' },
  messagesLinkText: { color: colors.primary, fontWeight: '600' },
})
