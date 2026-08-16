import { beforeAll, describe, expect, it } from 'vitest'

import { listSettings, updateSetting } from '@/modules/platform/application/settings-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * `PlatformSetting` read and write — task 2.7, `ADM-06`,
 * `17-admin-system.md` §Platform settings.
 */

const admin: ActorContext = anonymousActor({
  userId: 'usr_settings_admin',
  globalRole: 'ADMIN',
  ip: '203.0.113.20',
  userAgent: 'integration-suite',
})

const customer: ActorContext = anonymousActor({ userId: 'usr_nobody', globalRole: 'CUSTOMER' })

beforeAll(async () => {
  await getPrisma().user.upsert({
    where: { id: 'usr_settings_admin' },
    create: { id: 'usr_settings_admin', email: 'settings-admin@example.com', globalRole: 'ADMIN' },
    update: {},
  })
}, 60_000)

describe('reading', () => {
  it('lists every setting in the catalogue, including ones with no row yet', async () => {
    // Driven by the catalogue rather than the table: a key the seed never wrote must still
    // appear, or it is invisible on the screen *and* silently defaulted in code.
    const result = await listSettings(admin, {})

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const keys = result.value.settings.map((setting) => setting.key)
    expect(keys).toContain('pricing.band_percent')
    expect(keys).toContain('offer_request.sla_hours')
    expect(result.value.settings.every((setting) => setting.rationale.length > 20)).toBe(true)
  }, 60_000)

  it('refuses a caller who is not a platform admin', async () => {
    const result = await listSettings(customer, {})

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('FORBIDDEN')
  }, 30_000)
})

describe('writing', () => {
  it('stores a value inside the range and records who changed it', async () => {
    const result = await updateSetting(admin, {
      key: 'offer_request.sla_hours',
      value: 72,
      reason: 'Pilot manufacturers asked for three days',
    })

    expect(result.ok).toBe(true)

    const row = await getPrisma().platformSetting.findUnique({
      where: { key: 'offer_request.sla_hours' },
    })
    expect(row?.value).toBe(72)
    expect(row?.updatedBy).toBe('usr_settings_admin')
  }, 60_000)

  it('refuses 900 for band_percent, and says why', async () => {
    /*
     * The assertion the range check exists for. A setting that accepts 900 is not a setting.
     */
    const result = await updateSetting(admin, {
      key: 'pricing.band_percent',
      value: 900,
      reason: 'testing the bound',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('PRECONDITION')
    if (result.error.kind !== 'PRECONDITION') return
    // The message carries the rationale, not only the refusal.
    expect(result.error.reason).toContain('half the estimate')

    // And nothing was written.
    const row = await getPrisma().platformSetting.findUnique({
      where: { key: 'pricing.band_percent' },
    })
    expect(row?.value).not.toBe(900)
  }, 60_000)

  it('refuses an unknown key rather than creating a row nobody reads', async () => {
    const result = await updateSetting(admin, {
      key: 'pricing.band_percnt',
      value: 10,
      reason: 'typo',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('NOT_FOUND')

    expect(
      await getPrisma().platformSetting.findUnique({ where: { key: 'pricing.band_percnt' } }),
    ).toBeNull()
  }, 60_000)

  it('refuses a customer, even with a valid value', async () => {
    const result = await updateSetting(customer, {
      key: 'tax.kdv_default_percent',
      value: 1,
      reason: 'not my table',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('FORBIDDEN')
  }, 30_000)

  it('audits the change with before, after and the reason', async () => {
    await updateSetting(admin, {
      key: 'matching.max_companies_per_project',
      value: 3,
      reason: 'Supply is thin in the pilot districts',
    })
    await updateSetting(admin, {
      key: 'matching.max_companies_per_project',
      value: 4,
      reason: 'One more, after two weeks of data',
    })

    const entries = await getPrisma().auditLog.findMany({
      where: { entityType: 'PlatformSetting', entityId: 'matching.max_companies_per_project' },
      orderBy: { createdAt: 'asc' },
    })

    expect(entries.length).toBeGreaterThanOrEqual(2)

    const last = entries[entries.length - 1]
    expect((last?.before as { value?: number } | null)?.value).toBe(3)
    expect((last?.after as { value?: number } | null)?.value).toBe(4)
    expect(last?.reason).toBe('One more, after two weeks of data')
    expect(last?.actorUserId).toBe('usr_settings_admin')
  }, 120_000)
})
