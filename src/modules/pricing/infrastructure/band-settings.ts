import 'server-only'

import { prisma } from '@/shared/db'

import type { BandSettings } from '../domain/engine'

/**
 * Reads the band settings — `08-pricing-engine.md` §Band computation, `ADM-06`.
 *
 * In `infrastructure/` rather than `application/`, for the reason the job handlers moved
 * there in the first half of this phase: it takes no `ActorContext`, asserts no permission
 * and returns no `Result`, so it is not a use case however much a use case needs it. The
 * authorisation-matrix scan is what noticed, and it was right.
 *
 * The engine is pure and takes these as an argument; this is the impure edge that fetches
 * them.
 *
 * **Defaults matter here.** `08`'s documented values are the fallback, so a database with no
 * `PlatformSetting` rows still prices. A missing setting must not mean "no estimate" — a
 * fresh environment would then show every customer nothing, and the cause would look like a
 * pricing bug rather than an unseeded table.
 */

const DEFAULTS: BandSettings = {
  bandPercent: 10,
  bandMinKurus: 500_00,
  roundStepKurus: 500_00,
}

const KEYS = {
  bandPercent: 'pricing.band_percent',
  bandMinKurus: 'pricing.band_min_kurus',
  roundStepKurus: 'pricing.round_step_kurus',
} as const

export async function bandSettings(): Promise<BandSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  })

  const byKey = new Map(rows.map((row) => [row.key, row.value]))

  const read = (key: string, fallback: number): number => {
    const value = byKey.get(key)
    // A row whose JSON value is not a finite number is treated as absent rather than as zero.
    // Zero is a legitimate `band_percent`; it is not a legitimate `round_step`.
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  return {
    bandPercent: read(KEYS.bandPercent, DEFAULTS.bandPercent),
    bandMinKurus: read(KEYS.bandMinKurus, DEFAULTS.bandMinKurus),
    roundStepKurus: Math.max(1, read(KEYS.roundStepKurus, DEFAULTS.roundStepKurus)),
  }
}
