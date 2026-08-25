import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import type { MatchResultView } from '@contracts/matching'

import { useMatches } from '../../../../src/api/hooks'
import { formatBand } from '../../../../src/lib/format'
import { t } from '../../../../src/i18n'
import { colors } from '../../../../src/theme'
import { QueryStates } from '../../../../src/ui/primitives'

/**
 * The stored match run (`09` §Pipeline: read, never recompute — the API's `GET` is the
 * stored run and this screen adds no run button on purpose).
 *
 * **Price is the band and nothing else** (`ADR-006`, `CLAUDE.md` 5): `MatchResultView`
 * carries no `netKurus`, no `breakdown`, no score — the API already refuses them and the
 * screen renders only what arrives. `priceOnRequest` rows stay in the list with the label
 * instead of a band (`08` §Failure modes: a pricing failure never removes a match).
 *
 * One selection, two ceilings: compare caps at 3 (`CUS-06`), request at 5 (`11`'s create
 * guard) — the smaller list is a subset of the larger, so one set serves both and the
 * buttons enforce their own caps.
 */
const COMPARE_MAX = 3
const REQUEST_MAX = 5

export default function Eslesmeler() {
  const locale = 'tr'
  const { id } = useLocalSearchParams<{ id: string }>()
  const matches = useMatches(id)
  const [selected, setSelected] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)

  const toggle = (companyId: string) =>
    setSelected((current) =>
      current.includes(companyId)
        ? current.filter((existing) => existing !== companyId)
        : current.length < REQUEST_MAX
          ? [...current, companyId]
          : current,
    )

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t(locale, 'mobile.matches.title') }} />
      <QueryStates
        locale={locale}
        query={matches}
        isEmpty={(data) => data.results.length === 0}
        emptyText={t(locale, 'mobile.matches.empty')}
      >
        {(run) => {
          const pool = comparing
            ? run.results.filter((result) =>
                selected.slice(0, COMPARE_MAX).includes(result.companyId),
              )
            : run.results

          return (
            <>
              <Text style={styles.hint}>
                {t(locale, comparing ? 'mobile.matches.compareHint' : 'mobile.matches.requestHint')}
              </Text>
              <FlatList
                data={pool}
                keyExtractor={(result) => result.companyId}
                renderItem={({ item }) => (
                  <MatchRow
                    result={item}
                    picked={selected.includes(item.companyId)}
                    onToggle={() => toggle(item.companyId)}
                  />
                )}
              />
              <View style={styles.footer}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.compareButton, selected.length === 0 && styles.disabled]}
                  disabled={selected.length === 0}
                  onPress={() => setComparing((current) => !current)}
                >
                  <Text style={styles.compareLabel}>
                    {t(locale, 'mobile.matches.compare', {
                      count: Math.min(selected.length, COMPARE_MAX),
                    })}
                  </Text>
                </Pressable>
                <Link
                  href={{
                    pathname: `/(musteri)/proje/${id}/talep-gonder`,
                    params: { companyIds: selected.join(',') },
                  }}
                  asChild
                >
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.requestButton, selected.length === 0 && styles.disabled]}
                    disabled={selected.length === 0}
                  >
                    <Text style={styles.requestLabel}>
                      {t(locale, 'mobile.matches.requestCta', { count: selected.length })}
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </>
          )
        }}
      </QueryStates>
    </View>
  )
}

function MatchRow({
  result,
  picked,
  onToggle,
}: {
  result: MatchResultView
  picked: boolean
  onToggle: () => void
}) {
  const locale = 'tr'
  const band = formatBand(result.bandLowKurus, result.bandHighKurus)

  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.name}>{result.displayName}</Text>
        <Text style={styles.band}>
          {result.priceOnRequest || band === null
            ? t(locale, 'mobile.matches.priceOnRequest')
            : band}
        </Text>
        {result.incomplete ? (
          <Text style={styles.caveat}>{t(locale, 'mobile.matches.incomplete')}</Text>
        ) : null}
        {result.distanceKm === null ? null : (
          <Text style={styles.muted}>{Math.round(result.distanceKm)} km</Text>
        )}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: picked }}
        style={[styles.pick, picked && styles.pickOn]}
        onPress={onToggle}
      >
        <Text style={picked ? styles.pickOnLabel : styles.pickLabel}>
          {t(locale, picked ? 'mobile.matches.selected' : 'mobile.matches.select')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  hint: { color: colors.muted, padding: 12, fontSize: 13 },
  row: {
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: { flex: 1, gap: 2 },
  name: { color: colors.text, fontWeight: '600' },
  band: { color: colors.text },
  caveat: { color: colors.muted, fontSize: 12 },
  muted: { color: colors.muted, fontSize: 12 },
  pick: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
  },
  pickOn: { backgroundColor: colors.primary },
  pickLabel: { color: colors.primary, fontWeight: '600' },
  pickOnLabel: { color: colors.onPrimary, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.panel,
  },
  compareButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compareLabel: { color: colors.primary, fontWeight: '600' },
  requestButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestLabel: { color: colors.onPrimary, fontWeight: '600' },
  disabled: { opacity: 0.5 },
})
