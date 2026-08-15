import type { PrismaClient } from '@prisma/client'

/**
 * Platform settings, seeded from the defaults the documents state — never left as a
 * constant in code (`17-admin-system.md` §Platform settings: these are editable without a
 * deployment, which is the entire point of the table).
 *
 * Every value here is a default, not a decision. `25-progress.md` §Open questions tracks
 * the ones still awaiting a human answer: Q6 (KDV) and Q7 (SLA window).
 */
export const PLATFORM_SETTINGS: readonly { key: string; value: unknown; source: string }[] = [
  // 08-pricing-engine.md §Band computation — what the customer sees instead of the raw
  // number, and the lever that trades price privacy against usefulness (ADR-006).
  { key: 'pricing.band_percent', value: 10, source: '08 §Band computation' },
  { key: 'pricing.band_min_kurus', value: 500_000, source: '08 §Band computation (₺5 000)' },
  { key: 'pricing.round_step_kurus', value: 50_000, source: '08 §Band computation (₺500)' },

  // 11-offer-request-lifecycle.md §SLA. Q7: 48 h is a guess about manufacturer behaviour,
  // to be tuned once there is real data.
  { key: 'offer_request.sla_hours', value: 48, source: '11 §SLA' },

  // 11 §Offers and KDV. Q6: 20% is the current Turkish standard rate covering pergola
  // supply and installation; confirm with an accountant before Phase 6.
  { key: 'tax.kdv_default_percent', value: 20, source: '11 §Offers and KDV' },

  // 09-manufacturer-matching.md §Ranking and limits — stops spray-and-pray, which is what
  // trains manufacturers to ignore leads.
  { key: 'matching.max_companies_per_project', value: 5, source: '09 §Ranking and limits' },
] as const

export async function seedPlatformSettings(prisma: PrismaClient): Promise<number> {
  for (const setting of PLATFORM_SETTINGS) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      create: { key: setting.key, value: setting.value as never },
      // Deliberately not overwriting on re-run: an admin may have tuned a value, and a
      // seed that silently reverted it would be worse than one that did nothing.
      update: {},
    })
  }

  return PLATFORM_SETTINGS.length
}
