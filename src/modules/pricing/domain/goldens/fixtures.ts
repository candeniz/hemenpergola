import type { BandSettings, PriceBookInput, ProjectInput } from '../engine'

/**
 * The golden fixtures — `20-testing-strategy.md` §Unit:
 * *"a set of (project, price book) fixtures with expected breakdowns, committed."*
 *
 * The **inputs** live here, in TypeScript, so the compiler catches a fixture that names a
 * mode the engine does not have. The **expected outputs** are committed JSON next to this
 * file, because that is the artefact a reviewer reads: a formula change shows up as a diff of
 * real numbers rather than as a green tick on a snapshot nobody opened.
 *
 * Regenerate with `pnpm goldens:pricing`. Changing any expected value is an intentional line
 * in the PR and must bump `ENGINE_VERSION` — `engine.golden.test.ts` enforces it.
 */

export type GoldenCase = {
  name: string
  /** What this case is here to pin. One sentence; it ends up in the JSON. */
  covers: string
  project: ProjectInput
  priceBook: PriceBookInput
  settings: BandSettings
}

const DEFAULT_SETTINGS: BandSettings = {
  bandPercent: 10,
  bandMinKurus: 500_00,
  roundStepKurus: 500_00,
}

const ISTANBUL = { cityId: 'city_istanbul', districtId: 'dst_kadikoy' }

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: '01-base-only',
    covers: 'The simplest priced project: base × area, nothing else.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 24,
      quantity: 1,
      selectedOptionIds: [],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [],
      regionAdjustments: [],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '02-all-option-modes',
    covers: 'All five option modes priced together against one project.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 30,
      perimeterM: 22,
      heightM: 2.8,
      quantity: 2,
      selectedOptionIds: ['opt_flat', 'opt_m2', 'opt_m', 'opt_unit', 'opt_pct'],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 0, setupFeeKurus: 2_500_00 },
      optionPrices: [
        { optionId: 'opt_flat', mode: 'FLAT', valueKurus: 8_000_00 },
        { optionId: 'opt_m2', mode: 'PER_M2', valueKurus: 350_00 },
        { optionId: 'opt_m', mode: 'PER_M', valueKurus: 900_00 },
        { optionId: 'opt_unit', mode: 'PER_UNIT', valueKurus: 1_750_00 },
        { optionId: 'opt_pct', mode: 'PERCENT', percent: 6 },
      ],
      regionAdjustments: [],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '03-all-rule-kinds',
    covers: 'All four rule kinds firing at once, additively against the subtotal.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 80,
      perimeterM: 36,
      heightM: 4.2,
      quantity: 1,
      selectedOptionIds: [],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [],
      regionAdjustments: [],
      rules: [
        { id: 'rule_area', kind: 'AREA_DISCOUNT', thresholdMin: 50, mode: 'PERCENT', percent: 7 },
        {
          id: 'rule_value',
          kind: 'VALUE_DISCOUNT',
          thresholdMin: 200_000_00,
          mode: 'FLAT',
          valueKurus: 5_000_00,
        },
        {
          id: 'rule_size',
          kind: 'SIZE_SURCHARGE',
          thresholdMin: 60,
          mode: 'FLAT',
          valueKurus: 12_000_00,
        },
        {
          id: 'rule_height',
          kind: 'HEIGHT_SURCHARGE',
          thresholdMin: 4,
          mode: 'PERCENT',
          percent: 3,
        },
      ],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '04-floor-binds-last',
    covers: 'Discounts and a negative regional adjustment pushed below the floor; floor wins.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 6,
      quantity: 1,
      selectedOptionIds: [],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 35_000_00, setupFeeKurus: 0 },
      optionPrices: [],
      regionAdjustments: [{ districtId: 'dst_kadikoy', mode: 'FLAT', valueKurus: -5_000_00 }],
      rules: [
        { id: 'rule_value', kind: 'VALUE_DISCOUNT', thresholdMin: 0, mode: 'PERCENT', percent: 40 },
      ],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '05-regional-flat-city',
    covers: 'The design’s “Kocaeli +₺10 000” case — a flat surcharge matched on the city.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 30,
      quantity: 1,
      selectedOptionIds: [],
      cityId: 'city_kocaeli',
      districtId: 'dst_izmit',
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [],
      regionAdjustments: [{ cityId: 'city_kocaeli', mode: 'FLAT', valueKurus: 10_000_00 }],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '06-regional-district-overrides-city',
    covers: 'Both a city and a district row match; the district one is used.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 30,
      quantity: 1,
      selectedOptionIds: [],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [],
      regionAdjustments: [
        { cityId: 'city_istanbul', mode: 'PERCENT', percent: 20 },
        { districtId: 'dst_kadikoy', mode: 'PERCENT', percent: 5 },
      ],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '07-length-basis',
    covers: 'A LENGTH_M product, with a per-metre option pricing off the perimeter.',
    project: {
      productId: 'prd_glass_railing',
      basisType: 'LENGTH_M',
      lengthM: 18.5,
      perimeterM: 18.5,
      quantity: 1,
      selectedOptionIds: ['opt_m'],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 3_200_00, minProjectPriceKurus: 15_000_00, setupFeeKurus: 1_500_00 },
      optionPrices: [{ optionId: 'opt_m', mode: 'PER_M', valueKurus: 480_00 }],
      regionAdjustments: [],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '08-unit-basis-with-quantity',
    covers: 'A UNIT product ordered four times, with a per-unit option.',
    project: {
      productId: 'prd_sun_sail',
      basisType: 'UNIT',
      units: 4,
      quantity: 4,
      selectedOptionIds: ['opt_unit'],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 12_000_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [{ optionId: 'opt_unit', mode: 'PER_UNIT', valueKurus: 2_000_00 }],
      regionAdjustments: [],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '09-incomplete-missing-option-price',
    covers: 'A selected option the book does not price: contributes 0, flagged incomplete.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 20,
      quantity: 1,
      selectedOptionIds: ['opt_flat', 'opt_unpriced'],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [{ optionId: 'opt_flat', mode: 'FLAT', valueKurus: 3_000_00 }],
      regionAdjustments: [],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '10-band-minimum-width',
    covers: 'A small project where the percentage band is narrower than the minimum width.',
    project: {
      productId: 'prd_sun_sail',
      basisType: 'UNIT',
      units: 1,
      quantity: 1,
      selectedOptionIds: [],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 2_500_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [],
      regionAdjustments: [],
      rules: [],
    },
    settings: { bandPercent: 10, bandMinKurus: 2_000_00, roundStepKurus: 500_00 },
  },

  {
    name: '11-fractional-arithmetic',
    covers: 'Awkward areas and prices, to pin rounding at every named step.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: 17.35,
      perimeterM: 16.7,
      heightM: 3.15,
      quantity: 3,
      selectedOptionIds: ['opt_m2', 'opt_pct'],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 3_333_33, minProjectPriceKurus: 0, setupFeeKurus: 777 },
      optionPrices: [
        { optionId: 'opt_m2', mode: 'PER_M2', valueKurus: 111_11 },
        { optionId: 'opt_pct', mode: 'PERCENT', percent: 7.5 },
      ],
      regionAdjustments: [{ districtId: 'dst_kadikoy', mode: 'PERCENT', percent: 13 }],
      rules: [
        { id: 'rule_area', kind: 'AREA_DISCOUNT', thresholdMin: 10, mode: 'PERCENT', percent: 2.5 },
      ],
    },
    settings: { bandPercent: 9, bandMinKurus: 333_00, roundStepKurus: 250_00 },
  },

  {
    name: '12-product-not-in-book',
    covers: 'The manufacturer has a book but not this product: price on request.',
    project: {
      productId: 'prd_not_offered',
      basisType: 'AREA_M2',
      areaM2: 20,
      quantity: 1,
      selectedOptionIds: [],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: null,
      optionPrices: [],
      regionAdjustments: [],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },

  {
    name: '13-missing-basis',
    covers: 'No area on an AREA_M2 product: unpriceable, not a free project.',
    project: {
      productId: 'prd_pergola_bioclimatic',
      basisType: 'AREA_M2',
      areaM2: null,
      quantity: 1,
      selectedOptionIds: [],
      ...ISTANBUL,
    },
    priceBook: {
      version: 1,
      item: { basePriceKurus: 4_500_00, minProjectPriceKurus: 0, setupFeeKurus: 0 },
      optionPrices: [],
      regionAdjustments: [],
      rules: [],
    },
    settings: DEFAULT_SETTINGS,
  },
]
