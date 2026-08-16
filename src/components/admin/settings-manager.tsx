'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { listSettingsAction, updateSettingAction } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { SettingView } from '@/modules/platform/application/settings-service'

/**
 * The `PlatformSetting` surface — `ADM-06`, `17-admin-system.md` §Platform settings.
 *
 * Two things this screen does that a plain key-value editor would not:
 *
 *   **It shows the rationale next to the field.** The service refuses 900 for
 *   `band_percent`; a screen that only says "refused" invites the next person to widen the
 *   bound. Saying *why* it is 50 is what makes the bound survive.
 *
 *   **It requires a reason before saving.** `17`: every write is audited, and a write that
 *   changes what customers are shown is one somebody will want to explain later.
 */

type Outcome = { status: number } & (
  { data: unknown; meta: unknown } | { error: { code: string; message: string } }
)

const isError = (
  outcome: Outcome,
): outcome is { status: number } & { error: { code: string; message: string } } =>
  'error' in outcome

export function SettingsManager({ settings: initial }: { settings: SettingView[] }) {
  const t = useTranslations('admin.settings')
  const [settings, setSettings] = useState(initial)

  return (
    <div className="flex flex-col gap-md">
      {settings.map((setting) => (
        <SettingRow
          key={setting.key}
          setting={setting}
          onSaved={async () => {
            const next = (await listSettingsAction()) as Outcome
            if (!isError(next) && 'data' in next) {
              setSettings((next.data as { settings: SettingView[] }).settings)
            }
          }}
        />
      ))}
      {settings.length === 0 ? <p className="text-body-sm text-muted">{t('unset')}</p> : null}
    </div>
  )
}

const UNIT_KEY = {
  percent: 'unitPercent',
  kurus: 'unitKurus',
  hours: 'unitHours',
  count: 'unitCount',
} as const

function SettingRow({ setting, onSaved }: { setting: SettingView; onSaved: () => Promise<void> }) {
  const t = useTranslations('admin.settings')
  const [value, setValue] = useState(setting.value === null ? '' : String(setting.value))
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const fieldId = `setting-${setting.key.replaceAll('.', '-')}`

  return (
    <Card density="dense">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-base">
          <code className="text-body-md">{setting.key}</code>
          <span className="text-body-sm text-muted">{t(UNIT_KEY[setting.unit])}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-md">
        <p className="text-body-sm text-muted">{setting.rationale}</p>

        <form
          className="grid gap-md md:grid-cols-3"
          action={() => {
            setProblem(null)
            setSaved(false)
            start(async () => {
              const outcome = (await updateSettingAction({
                key: setting.key,
                // Every setting in the catalogue is numeric today; the per-key Zod schema in
                // the service is the gate, not this cast.
                value: Number(value),
                reason,
              })) as Outcome

              if (isError(outcome)) {
                setProblem(outcome.error.message)
                return
              }
              setSaved(true)
              setReason('')
              await onSaved()
            })
          }}
        >
          <div className="flex flex-col gap-xs">
            <Label htmlFor={fieldId}>{t('value')}</Label>
            <Input
              id={fieldId}
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-xs">
            <Label htmlFor={`${fieldId}-reason`}>{t('reason')}</Label>
            <Input
              id={`${fieldId}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`${fieldId}-reason-hint`}
              required
            />
            <p id={`${fieldId}-reason-hint`} className="text-body-sm text-muted">
              {t('reasonHint')}
            </p>
          </div>

          <div className="flex items-start pt-lg">
            <Button type="submit" variant="confirm" size="dense" disabled={pending}>
              {pending ? t('saving') : t('save')}
            </Button>
          </div>
        </form>

        {problem === null ? null : (
          <p role="alert" className="flex items-start gap-base text-body-sm text-destructive">
            <Icon name="error" dense />
            {t('rejected')}: {problem}
          </p>
        )}
        {saved ? (
          <p role="status" className="flex items-center gap-base text-body-sm text-confirm">
            <Icon name="check_circle" dense />
            {t('saved')}
          </p>
        ) : null}

        <p className="text-body-sm text-muted">
          {t('source')}: {setting.source} ·{' '}
          {setting.updatedAt === null
            ? t('never')
            : `${t('lastChanged')}: ${new Date(setting.updatedAt).toISOString().slice(0, 10)}`}
        </p>
      </CardContent>
    </Card>
  )
}
