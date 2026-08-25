import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { sendOffer } from '../api/endpoints'
import { tlToKurus } from '../lib/format'
import { t, type Locale } from '../i18n'
import { colors } from '../theme'
import { Button, ErrorText, Field } from '../ui/primitives'

/**
 * The offer form — lines, validity, note (`11` §`send_offer`, `06`).
 *
 * Money crosses exactly one boundary here: the person types TL, `tlToKurus` makes it an
 * integer, and everything after — the schema, the wire, the database — is kuruş
 * (`ADR-005`). `taxRate` is deliberately absent from the form: it defaults from
 * `PlatformSetting` on the server (Q6), and a client that lets a manufacturer type a rate
 * is a client that lets two documents disagree about the law.
 *
 * From `OFFER_SENT` the same call is `revise` — the machine supersedes the old version and
 * keeps both, so this component does not care which of the two it is performing.
 */

type Line = { description: string; quantity: string; unit: string; unitPrice: string }

const emptyLine: Line = { description: '', quantity: '1', unit: '', unitPrice: '' }

export function OfferComposer({
  locale,
  companyId,
  offerRequestId,
  onDone,
}: {
  locale: Locale
  companyId: string
  offerRequestId: string
  onDone: () => void
}) {
  const client = useQueryClient()
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }])
  const [validUntil, setValidUntil] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const patch = (index: number, part: Partial<Line>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...part } : line)))

  const submit = async () => {
    setError(null)

    const parsedLines = []
    for (const line of lines) {
      const unitPriceKurus = tlToKurus(line.unitPrice)
      const quantity = Number(line.quantity.replace(',', '.'))
      if (unitPriceKurus === null || Number.isNaN(quantity)) {
        setError(t(locale, 'mobile.offerForm.badMoney'))
        return
      }
      if (line.description.trim() === '') continue
      parsedLines.push({
        description: line.description.trim(),
        quantity,
        unit: line.unit.trim() || 'adet',
        unitPriceKurus,
      })
    }
    if (parsedLines.length === 0) {
      setError(t(locale, 'mobile.offerForm.needLine'))
      return
    }

    const until = new Date(`${validUntil.trim()}T23:59:59+03:00`)
    if (Number.isNaN(until.getTime())) {
      setError(t(locale, 'mobile.leads.badDate'))
      return
    }

    setBusy(true)
    const result = await sendOffer(companyId, {
      offerRequestId,
      lines: parsedLines,
      validUntil: until,
      ...(note.trim() === '' ? {} : { note: note.trim() }),
    })
    setBusy(false)

    if (!result.ok) {
      setError(t(locale, 'mobile.common.error'))
      return
    }

    await client.invalidateQueries({ queryKey: ['lead', companyId, offerRequestId] })
    await client.invalidateQueries({ queryKey: ['leads', companyId] })
    onDone()
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t(locale, 'mobile.offerForm.title')}</Text>

      {lines.map((line, index) => (
        <View key={index} style={styles.line}>
          <Text style={styles.lineTitle}>
            {t(locale, 'mobile.offerForm.line', { n: index + 1 })}
          </Text>
          <Field
            label={t(locale, 'mobile.offerForm.description')}
            value={line.description}
            onChangeText={(value) => patch(index, { description: value })}
          />
          <Field
            label={t(locale, 'mobile.offerForm.quantity')}
            value={line.quantity}
            keyboardType="decimal-pad"
            onChangeText={(value) => patch(index, { quantity: value })}
          />
          <Field
            label={t(locale, 'mobile.offerForm.unit')}
            value={line.unit}
            onChangeText={(value) => patch(index, { unit: value })}
          />
          <Field
            label={t(locale, 'mobile.offerForm.unitPrice')}
            value={line.unitPrice}
            keyboardType="decimal-pad"
            onChangeText={(value) => patch(index, { unitPrice: value })}
          />
          {lines.length > 1 ? (
            <Button
              kind="outline"
              label={t(locale, 'mobile.offerForm.removeLine')}
              onPress={() => setLines((current) => current.filter((_, i) => i !== index))}
            />
          ) : null}
        </View>
      ))}

      <Button
        kind="outline"
        label={t(locale, 'mobile.offerForm.addLine')}
        onPress={() => setLines((current) => [...current, { ...emptyLine }])}
      />
      <Field
        label={t(locale, 'mobile.offerForm.validUntil')}
        value={validUntil}
        onChangeText={setValidUntil}
        placeholder="2026-09-15"
        autoCapitalize="none"
      />
      <Field
        label={t(locale, 'mobile.offerForm.note')}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <ErrorText message={error} />
      <Button
        label={t(locale, 'mobile.offerForm.submit')}
        busy={busy}
        onPress={() => void submit()}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 12,
    gap: 12,
  },
  title: { color: colors.text, fontWeight: '600', fontSize: 16 },
  line: { gap: 4, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: 12 },
  lineTitle: { color: colors.muted, fontSize: 13, fontWeight: '600' },
})
