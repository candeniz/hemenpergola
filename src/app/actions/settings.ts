'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type {
  SettingView,
  UpdateSettingResult,
} from '@/modules/platform/application/settings-service'

/**
 * Platform-setting actions (`ADM-06`). The range check lives in
 * `modules/platform/domain/settings-catalogue.ts` and runs in the service, so this adapter
 * and `/api/v1/admin/settings` cannot disagree about what 900 means.
 */

async function adminActor() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })
}

export async function listSettingsAction(): Promise<ActionResult<{ settings: SettingView[] }>> {
  const { listSettings } = await import('@/modules/platform/application/settings-service')
  return actionResult(await listSettings(await adminActor(), {}))
}

export async function updateSettingAction(
  input: unknown,
): Promise<ActionResult<UpdateSettingResult>> {
  const [{ updateSetting, updateSettingSchema }, { err, validation }] = await Promise.all([
    import('@/modules/platform/application/settings-service'),
    import('@/shared/result'),
  ])

  const parsed = updateSettingSchema.safeParse(input)
  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await updateSetting(await adminActor(), parsed.data))
}
