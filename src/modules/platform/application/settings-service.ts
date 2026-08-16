import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { requireAdmin } from '@/modules/iam/application/authorization'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import {
  SETTING_DEFINITIONS,
  settingDefinition,
  validateSetting,
} from '../domain/settings-catalogue'

/**
 * `PlatformSetting` read and write — `17-admin-system.md` §Platform settings, `ADM-06`.
 *
 * *"Settings live in `PlatformSetting` and are editable without deployment."* The two things
 * that make that safe rather than reckless are both here: **every value is range-checked
 * against `domain/settings-catalogue.ts`**, and **every change is audited with before and
 * after**.
 */

export const listSettingsSchema = z.object({})
export type ListSettingsInput = z.infer<typeof listSettingsSchema>

export const updateSettingSchema = z.object({
  key: z.string().min(1).max(120),
  /** Every setting in the catalogue is currently a number; the schema per key is the gate. */
  value: z.unknown(),
  /** `17`: writes that affect standing require a reason. Settings move money, so they do. */
  reason: z.string().trim().min(3).max(400),
})
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>

export type SettingView = {
  key: string
  value: unknown
  unit: 'percent' | 'kurus' | 'hours' | 'count'
  rationale: string
  source: string
  updatedAt: Date | null
  updatedBy: string | null
  /** True when the row is missing and the screen is showing nothing rather than a value. */
  unset: boolean
}

export const listSettings = serviceMethod<ListSettingsInput, { settings: SettingView[] }>(
  'platform',
  'listSettings',
  { kind: 'admin' },
  async (actor, input) => {
    void input
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const rows = await prisma.platformSetting.findMany()
    const byKey = new Map(rows.map((row) => [row.key, row]))

    /*
     * Driven by the catalogue, not by the table. A setting the seed never wrote still has to
     * appear — otherwise a key that is missing from the database is invisible on the screen
     * *and* silently defaulted in code, which is the worst of both.
     */
    return ok({
      settings: SETTING_DEFINITIONS.map((definition) => {
        const row = byKey.get(definition.key)
        return {
          key: definition.key,
          value: row?.value ?? null,
          unit: definition.unit,
          rationale: definition.rationale,
          source: definition.source,
          updatedAt: row?.updatedAt ?? null,
          updatedBy: row?.updatedBy ?? null,
          unset: row === undefined,
        }
      }),
    })
  },
)

export type UpdateSettingResult = { key: string; value: unknown; previous: unknown }

export const updateSetting = serviceMethod<UpdateSettingInput, UpdateSettingResult>(
  'platform',
  'updateSetting',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const definition = settingDefinition(input.key)
    if (definition === undefined) {
      /*
       * NOT_FOUND, not VALIDATION: the key does not exist rather than being malformed.
       *
       * Refusing unknown keys at all is the point. `PlatformSetting` is key-value, so nothing
       * in the database stops `pricing.band_percnt` from being created by a typo — it would
       * then sit there being read by nobody while the real setting keeps its old value.
       */
      return err(notFound('PlatformSetting'))
    }

    const validated = validateSetting(input.key, input.value)
    if (!validated.valid) {
      if (validated.reason === 'unknown-key') return err(notFound('PlatformSetting'))
      // PRECONDITION carries the rationale, so the screen can say *why* 900 is refused
      // rather than only that it was.
      return err(precondition(`${validated.message} — ${validated.rationale}`))
    }

    const before = await prisma.platformSetting.findUnique({ where: { key: input.key } })

    await prisma.platformSetting.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        value: validated.value as never,
        updatedBy: actor.userId,
      },
      update: { value: validated.value as never, updatedBy: actor.userId },
    })

    await recordAudit(actor, {
      action: 'setting_changed',
      entityType: 'PlatformSetting',
      entityId: input.key,
      before: { value: before?.value ?? null },
      after: { value: validated.value },
      reason: input.reason,
    })

    return ok({ key: input.key, value: validated.value, previous: before?.value ?? null })
  },
)

export const settingsService = { listSettings, updateSetting } satisfies Record<
  string,
  { meta: unknown }
>
