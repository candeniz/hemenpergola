import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { OfferView } from '@contracts/offer'

import { decideOffer, submitReview } from '../../../../src/api/endpoints'
import { useCustomerAction, useEligibility, useOffers } from '../../../../src/api/hooks'
import { formatBand, formatWhen, kurusToTl } from '../../../../src/lib/format'
import { statusLabel } from '../../../../src/lib/status'
import { t, type Locale } from '../../../../src/i18n'
import { colors } from '../../../../src/theme'
import { Badge, Button, ErrorText, Field, QueryStates } from '../../../../src/ui/primitives'

/**
 * The customer's side of one request: the formal offer with its lines and KDV — which is
 * `ADR-006`'s OTHER object, the document a manufacturer wrote to be read, not the internal
 * calculation the band hides — the decision buttons, the original estimate band for the
 * gap `ADR-007` says to explain in place, messaging, and the review once `16` §Eligibility
 * opens it.
 */
export default function TalepDetail() {
  const locale: Locale = 'tr'
  const { id } = useLocalSearchParams<{ id: string }>()

  const offers = useOffers(id)
  const eligibility = useEligibility(id)
  const action = useCustomerAction(null, id)
  const [error, setError] = useState<string | null>(null)

  const decide = (decision: 'accept' | 'reject') => {
    setError(null)
    action.mutate(() => decideOffer(id, decision), {
      onError: () => setError(t(locale, 'mobile.common.error')),
    })
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t(locale, 'mobile.offer.title') }} />
      <QueryStates locale={locale} query={offers}>
        {(view) => {
          const band =
            view.originalEstimate === null
              ? null
              : formatBand(view.originalEstimate.bandLowKurus, view.originalEstimate.bandHighKurus)
          const [latest, ...older] = view.offers

          return (
            <View style={styles.stack}>
              <View style={styles.headerRow}>
                <Text style={styles.company}>{view.companyName}</Text>
                <Badge label={statusLabel(locale, view.requestStatus)} />
              </View>

              {band === null ? null : (
                <View style={styles.card}>
                  <Text style={styles.muted}>
                    {t(locale, 'mobile.offer.originalEstimate', { band })}
                  </Text>
                  <Text style={styles.muted}>{t(locale, 'mobile.offer.estimateNote')}</Text>
                </View>
              )}

              {latest === undefined ? (
                <Text style={styles.muted}>{t(locale, 'mobile.offer.none')}</Text>
              ) : (
                <OfferCard locale={locale} offer={latest} />
              )}
              {older.map((offer) => (
                <View key={offer.offerId} style={styles.superseded}>
                  <Text style={styles.mutedSmall}>{t(locale, 'mobile.offer.superseded')}</Text>
                  <OfferCard locale={locale} offer={offer} />
                </View>
              ))}

              <ErrorText message={error} />

              {view.requestStatus === 'OFFER_SENT' ? (
                <View style={styles.stack}>
                  <Button
                    label={t(locale, 'mobile.offer.accept')}
                    busy={action.isPending}
                    onPress={() => decide('accept')}
                  />
                  <Button
                    kind="destructive"
                    label={t(locale, 'mobile.offer.reject')}
                    busy={action.isPending}
                    onPress={() => decide('reject')}
                  />
                </View>
              ) : null}

              <Link href={`/(musteri)/talep/${id}/mesajlar`} asChild>
                <Pressable accessibilityRole="button" style={styles.messagesLink}>
                  <Text style={styles.messagesLinkText}>{t(locale, 'mobile.messages.title')}</Text>
                </Pressable>
              </Link>

              <QueryStates locale={locale} query={eligibility}>
                {(gate) =>
                  gate.review !== null ? (
                    <Text role="status" style={styles.muted}>
                      {t(locale, 'mobile.review.pending')}
                    </Text>
                  ) : gate.eligible ? (
                    <ReviewForm locale={locale} offerRequestId={id} />
                  ) : (
                    <Text style={styles.mutedSmall}>{t(locale, 'mobile.review.notYet')}</Text>
                  )
                }
              </QueryStates>
            </View>
          )
        }}
      </QueryStates>
    </ScrollView>
  )
}

function OfferCard({ locale, offer }: { locale: Locale; offer: OfferView }) {
  return (
    <View style={styles.card}>
      {offer.lines.map((line, index) => (
        <View key={index} style={styles.lineRow}>
          <Text style={styles.lineText}>
            {line.description} · {line.quantity} {line.unit}
          </Text>
          <Text style={styles.lineText}>{kurusToTl(line.lineNetKurus)}</Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.muted}>{t(locale, 'mobile.offer.net')}</Text>
        <Text style={styles.muted}>{kurusToTl(offer.netKurus)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.muted}>{t(locale, 'mobile.offer.tax', { rate: offer.taxRate })}</Text>
        <Text style={styles.muted}>{kurusToTl(offer.taxKurus)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.total}>{t(locale, 'mobile.offer.total')}</Text>
        <Text style={styles.total}>{kurusToTl(offer.grossKurus)}</Text>
      </View>
      <Text style={styles.mutedSmall}>
        {t(locale, 'mobile.offer.validUntil', { date: formatWhen(offer.validUntil) })}
      </Text>
    </View>
  )
}

function ReviewForm({ locale, offerRequestId }: { locale: Locale; offerRequestId: string }) {
  const action = useCustomerAction(null, offerRequestId)
  const [ratings, setRatings] = useState({
    overall: 0,
    quality: 0,
    communication: 0,
    timeliness: 0,
  })
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const dimensions = [
    ['overall', 'mobile.review.overall'],
    ['quality', 'mobile.review.quality'],
    ['communication', 'mobile.review.communication'],
    ['timeliness', 'mobile.review.timeliness'],
  ] as const

  const complete = Object.values(ratings).every((value) => value > 0) && body.trim().length >= 50

  return (
    <View style={styles.card}>
      <Text style={styles.reviewTitle}>{t(locale, 'mobile.review.title')}</Text>
      {dimensions.map(([key, labelKey]) => (
        <View key={key} style={styles.ratingRow}>
          <Text style={styles.mutedSmall}>{t(locale, labelKey)}</Text>
          <View style={styles.stars} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: ratings[key] === value }}
                style={[styles.star, ratings[key] >= value && styles.starOn]}
                onPress={() => setRatings((current) => ({ ...current, [key]: value }))}
              >
                <Text style={ratings[key] >= value ? styles.starOnLabel : styles.starLabel}>
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Field
        label={t(locale, 'mobile.review.body')}
        value={body}
        onChangeText={setBody}
        multiline
      />
      <ErrorText message={error} />
      <Button
        label={t(locale, 'mobile.review.submit')}
        disabled={!complete}
        busy={action.isPending}
        onPress={() => {
          setError(null)
          action.mutate(
            () =>
              submitReview({
                offerRequestId,
                ratingOverall: ratings.overall,
                ratingQuality: ratings.quality,
                ratingCommunication: ratings.communication,
                ratingTimeliness: ratings.timeliness,
                body: body.trim(),
              }),
            { onError: () => setError(t(locale, 'mobile.common.error')) },
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16 },
  stack: { gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  company: { color: colors.text, fontWeight: '600', fontSize: 17 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 12,
    gap: 6,
  },
  superseded: { opacity: 0.6, gap: 4 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineText: { color: colors.text },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 6,
  },
  total: { color: colors.text, fontWeight: '700' },
  muted: { color: colors.muted },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  messagesLink: { minHeight: 44, justifyContent: 'center' },
  messagesLinkText: { color: colors.primary, fontWeight: '600' },
  reviewTitle: { color: colors.text, fontWeight: '600', fontSize: 16 },
  ratingRow: { gap: 4 },
  stars: { flexDirection: 'row', gap: 8 },
  star: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starOn: { backgroundColor: colors.primary },
  starLabel: { color: colors.primary, fontWeight: '600' },
  starOnLabel: { color: colors.onPrimary, fontWeight: '600' },
})
