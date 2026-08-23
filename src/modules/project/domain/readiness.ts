import { isAttributeVisible, type AnswersByKey } from '@/modules/catalog/domain/authoring-rules'

import {
  DIMENSION_ATTRIBUTE_KEYS,
  dimensionBounds,
  dimensionFieldFor,
  stageOf,
  type Stage,
  type Step,
} from './steps'

/**
 * The readiness check — `10-project-configurator.md` §Validation, task 4.7.
 *
 * The whole-project rule set that promotes `DRAFT` → `READY`. Distinct from the per-step
 * schemas, which are allowed to pass on a half-filled step: a draft may be invalid, a
 * `READY` project may not.
 *
 * **Every issue carries the step it belongs to.** `10` asks for it explicitly so the summary
 * screen can link straight to the offending field, and it is the sort of thing that is
 * painful to retrofit — by the time the UI wants it, the issues have been flattened into
 * strings at half a dozen call sites.
 *
 * Pure: no database, no clock. The service loads the project and its catalogue rows and calls
 * this, exactly as the pricing engine is called.
 */

export type IssueCode =
  | 'product-missing'
  | 'dimensions-missing'
  | 'dimension-out-of-range'
  | 'area-invalid'
  | 'required-attribute-missing'
  | 'location-missing'
  | 'location-unresolvable'
  | 'project-type-missing'
  | 'installation-type-missing'
  | 'email-unverified'

export type ReadinessIssue = {
  code: IssueCode
  /** Where the summary screen sends the customer. */
  step: Step
  stage: Stage
  /** The field, when the issue is about one — used to focus it after the jump. */
  field?: string
  /** Machine-readable detail for the message, never a formatted sentence (`I18N-01`). */
  detail?: Record<string, string | number>
}

export type ReadinessInput = {
  project: {
    productId: string | null
    widthMm: number | null
    depthMm: number | null
    heightMm: number | null
    areaM2: number | null
    projectType: string | null
    installationType: string | null
    cityId: string | null
    districtId: string | null
    /**
     * How `Project.point` was obtained, or null if it could not be resolved at all.
     *
     * The service fills the point **when the location step is saved** — from the map pin if
     * there is one, otherwise from the district centroid — so a null here means the city and
     * district pair does not resolve, not that the customer declined to drop a pin. That is
     * the distinction `10` §Validation's "resolvable to a point" is actually about.
     */
    pointPrecision: 'EXACT' | 'DISTRICT' | 'CITY' | null
  }
  /** The product's attributes, with the bounds and the `showIf` pair. */
  attributes: readonly {
    id: string
    key: string
    isRequired: boolean
    min: number | null
    max: number | null
    showIfAttributeKey: string | null
    showIfValue: string | null
  }[]
  /** Answers keyed by attribute key, for `showIf` evaluation. */
  answers: AnswersByKey
  /** Which attribute ids have at least one `ProjectAttributeValue` row. */
  answeredAttributeIds: ReadonlySet<string>
  customer: {
    emailVerified: boolean
  }
  /** `10` §Validation: area must be > 0 and within the platform maximum. */
  maxAreaM2: number
}

export type ReadinessResult = {
  ready: boolean
  issues: ReadinessIssue[]
}

function issue(
  code: IssueCode,
  step: Step,
  extra: { field?: string; detail?: Record<string, string | number> } = {},
): ReadinessIssue {
  return { code, step, stage: stageOf(step), ...extra }
}

export function checkReadiness(input: ReadinessInput): ReadinessResult {
  const issues: ReadinessIssue[] = []
  const { project } = input

  if (project.productId === null) {
    issues.push(issue('product-missing', 'product'))
  }

  // ── dimensions ──────────────────────────────────────────────────────────────
  const missingDimension =
    project.widthMm === null || project.depthMm === null || project.heightMm === null

  if (missingDimension) {
    issues.push(
      issue('dimensions-missing', 'dimensions', {
        field:
          project.widthMm === null ? 'widthMm' : project.depthMm === null ? 'depthMm' : 'heightMm',
      }),
    )
  } else {
    /*
     * Bounds come from `dimensionBounds`, which is Q18's single read point. The attribute
     * whose key matches the dimension supplies them when the catalogue states them; otherwise
     * the documented global default applies. Nothing here knows whether the bound is regional,
     * which is the point.
     */
    const context = { cityId: project.cityId, districtId: project.districtId }

    for (const [field, value] of [
      ['widthMm', project.widthMm],
      ['depthMm', project.depthMm],
      ['heightMm', project.heightMm],
    ] as const) {
      // Narrowed by `missingDimension` above; the tuple loses that, so restate it.
      if (value === null) continue

      // Resolved through the key table in `steps.ts`: the catalogue names these attributes
      // `genislik_mm` etc., and looking them up by the field name alone is the miss that
      // left every catalogue bound unenforced through Phase 4.
      const attribute =
        input.attributes.find((row) => DIMENSION_ATTRIBUTE_KEYS[field].includes(row.key)) ?? null
      const bounds = dimensionBounds(attribute, context)

      if (value < bounds.minMm || value > bounds.maxMm) {
        issues.push(
          issue('dimension-out-of-range', 'dimensions', {
            field,
            detail: { value, minMm: bounds.minMm, maxMm: bounds.maxMm },
          }),
        )
      }
    }
  }

  if (project.areaM2 !== null && (project.areaM2 <= 0 || project.areaM2 > input.maxAreaM2)) {
    issues.push(
      issue('area-invalid', 'dimensions', {
        field: 'areaM2',
        detail: { areaM2: project.areaM2, maxAreaM2: input.maxAreaM2 },
      }),
    )
  }

  // ── required attributes, but only the ones actually shown ───────────────────
  for (const attribute of input.attributes) {
    if (!attribute.isRequired) continue

    /*
     * A dimension attribute is answered by the dimensions step — its whole existence is the
     * bounds read above — and demanding a second, `optionId`-shaped answer to it made every
     * real catalogue product permanently un-READY (see `DIMENSION_ATTRIBUTE_KEYS`). The
     * dimensions rules a few lines up are its required-ness.
     */
    if (dimensionFieldFor(attribute.key) !== null) continue

    /*
     * A hidden attribute cannot be required. `showIf` means the customer was never asked, and
     * demanding an answer to a question that was not on screen is the single most confusing
     * validation failure a form can produce.
     */
    if (!isAttributeVisible(attribute, input.answers)) continue

    if (!input.answeredAttributeIds.has(attribute.id)) {
      issues.push(
        issue('required-attribute-missing', 'options', {
          field: attribute.key,
          detail: { attributeId: attribute.id, key: attribute.key },
        }),
      )
    }
  }

  // ── the rest ────────────────────────────────────────────────────────────────
  if (project.cityId === null || project.districtId === null) {
    issues.push(
      issue('location-missing', 'location', {
        field: project.cityId === null ? 'cityId' : 'districtId',
      }),
    )
  } else if (project.pointPrecision === null) {
    /*
     * `10`: city and district must be *resolvable to a point*. Resolution happens at save
     * time, so reaching here means the pair genuinely did not resolve — a district with no
     * seeded centroid — rather than that the customer skipped the map. A customer who gave no
     * pin has `DISTRICT` precision and is perfectly ready.
     */
    issues.push(issue('location-unresolvable', 'location'))
  }

  if (project.projectType === null) issues.push(issue('project-type-missing', 'projectType'))
  if (project.installationType === null) {
    issues.push(issue('installation-type-missing', 'installationType'))
  }

  /*
   * `03` §F2: email verified to request offers, phone verified before contact disclosure.
   * Only the first is a readiness rule — the phone gate belongs to acceptance, in Phase 6,
   * and checking it here would block a customer months before it applies.
   */
  if (!input.customer.emailVerified) {
    issues.push(issue('email-unverified', 'summary'))
  }

  return { ready: issues.length === 0, issues }
}
