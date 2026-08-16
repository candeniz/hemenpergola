import { describe, expect, it } from 'vitest'

import { isAttributeVisible } from '@/modules/catalog/domain/authoring-rules'

import { checkReadiness, type ReadinessInput } from './readiness'
import { deriveAreaM2, derivePerimeterM, dimensionBounds, STEP_STAGE, STEPS } from './steps'

/**
 * `10-project-configurator.md` §Validation, task 4.7.
 *
 * Pure, so no database. The interesting assertions are the ones about *which step* an issue
 * belongs to, and about `showIf` — a hidden attribute that is nevertheless required is the
 * most confusing failure a form can produce, and the wizard and the server have to agree
 * about which attributes are hidden.
 */

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    project: {
      productId: 'prd',
      widthMm: 5000,
      depthMm: 4000,
      heightMm: 2800,
      areaM2: 20,
      projectType: 'NEW_BUILD',
      installationType: 'FREESTANDING',
      cityId: 'city',
      districtId: 'district',
      pointPrecision: 'DISTRICT',
    },
    attributes: [],
    answers: {},
    answeredAttributeIds: new Set(),
    customer: { emailVerified: true },
    maxAreaM2: 500,
    ...overrides,
  }
}

describe('a complete project', () => {
  it('is ready with no issues', () => {
    const result = checkReadiness(input())
    expect(result.issues).toEqual([])
    expect(result.ready).toBe(true)
  })
})

describe('every issue carries its step and stage', () => {
  it('names a step that exists, and the stage that step belongs to', () => {
    // `10` §Validation asks for the step by name so the summary can link to the field. The
    // stage comes with it because the stepper shows stages, not steps (`ADR-013`).
    const result = checkReadiness(
      input({
        project: {
          ...input().project,
          productId: null,
          widthMm: null,
          cityId: null,
          projectType: null,
          installationType: null,
        },
        customer: { emailVerified: false },
      }),
    )

    expect(result.ready).toBe(false)
    expect(result.issues.length).toBeGreaterThan(4)

    for (const issue of result.issues) {
      expect(STEPS, issue.code).toContain(issue.step)
      expect(issue.stage, issue.code).toBe(STEP_STAGE[issue.step])
    }
  })

  it('points dimension issues at the dimensions step and names the field', () => {
    const result = checkReadiness(input({ project: { ...input().project, depthMm: null } }))

    const issue = result.issues.find((row) => row.code === 'dimensions-missing')
    expect(issue?.step).toBe('dimensions')
    expect(issue?.field).toBe('depthMm')
  })
})

describe('dimension bounds — Q18’s single read point', () => {
  it('uses the catalogue bound when the attribute states one', () => {
    const result = checkReadiness(
      input({
        attributes: [
          {
            id: 'attr_width',
            key: 'widthMm',
            isRequired: false,
            min: 1000,
            max: 4000,
            showIfAttributeKey: null,
            showIfValue: null,
          },
        ],
      }),
    )

    const issue = result.issues.find((row) => row.code === 'dimension-out-of-range')
    expect(issue?.field).toBe('widthMm')
    expect(issue?.detail).toMatchObject({ value: 5000, minMm: 1000, maxMm: 4000 })
  })

  it('falls back to the documented global default when it does not', () => {
    // The Q18 assumption, asserted rather than left implicit: bounds are global today.
    expect(dimensionBounds(null)).toEqual({ minMm: 500, maxMm: 30_000 })
    expect(dimensionBounds({ min: null, max: 9000 })).toEqual({ minMm: 500, maxMm: 9000 })
  })

  it('ignores the location, because bounds are global today', () => {
    // The signature already carries the context so a caller cannot forget it when the answer
    // arrives. Until then the two must be identical.
    expect(dimensionBounds({ min: 1000, max: 2000 }, { cityId: 'a', districtId: 'b' })).toEqual(
      dimensionBounds({ min: 1000, max: 2000 }),
    )
  })
})

describe('showIf', () => {
  const conditional = {
    id: 'attr_motor_brand',
    key: 'motorBrand',
    isRequired: true,
    min: null,
    max: null,
    showIfAttributeKey: 'motorised',
    showIfValue: 'true',
  }

  it('does not demand an answer to a question that was never shown', () => {
    const result = checkReadiness(
      input({ attributes: [conditional], answers: { motorised: 'false' } }),
    )

    expect(result.issues.filter((row) => row.code === 'required-attribute-missing')).toEqual([])
    expect(result.ready).toBe(true)
  })

  it('demands it once the parent makes it visible', () => {
    const result = checkReadiness(
      input({ attributes: [conditional], answers: { motorised: 'true' } }),
    )

    const issue = result.issues.find((row) => row.code === 'required-attribute-missing')
    expect(issue?.step).toBe('options')
    expect(issue?.field).toBe('motorBrand')
  })

  it('is satisfied once answered', () => {
    const result = checkReadiness(
      input({
        attributes: [conditional],
        answers: { motorised: 'true' },
        answeredAttributeIds: new Set(['attr_motor_brand']),
      }),
    )

    expect(result.ready).toBe(true)
  })

  it('agrees with the wizard, because both call the same function', () => {
    /*
     * `10` §Validation: client and server evaluate *from the same data in the same way*. The
     * wizard filters its fields with `isAttributeVisible` and `checkReadiness` skips required
     * checks with the same call, so this asserts they cannot disagree — a wizard that hid a
     * field the server then demanded is the failure being prevented.
     */
    const answerSets = [
      {},
      { motorised: 'true' },
      { motorised: 'false' },
      { motorised: '' },
      { somethingElse: 'true' },
    ]

    for (const answers of answerSets) {
      const shownInWizard = isAttributeVisible(conditional, answers)

      const demanded = checkReadiness(input({ attributes: [conditional], answers })).issues.some(
        (issue) => issue.code === 'required-attribute-missing',
      )

      // Demanded implies shown. The converse does not hold — a shown attribute that has been
      // answered is not demanded — so this is the direction that matters.
      expect(demanded && !shownInWizard, JSON.stringify(answers)).toBe(false)
      expect(demanded, JSON.stringify(answers)).toBe(shownInWizard)
    }
  })
})

describe('location', () => {
  it('accepts a district-precision point — a customer who gave no pin is ready', () => {
    expect(checkReadiness(input()).ready).toBe(true)
  })

  it('reports an unresolvable pair, which is not the same as a missing pin', () => {
    const result = checkReadiness(input({ project: { ...input().project, pointPrecision: null } }))

    const issue = result.issues.find((row) => row.code === 'location-unresolvable')
    expect(issue?.step).toBe('location')
  })
})

describe('derived values', () => {
  it('computes area from millimetres', () => {
    expect(deriveAreaM2(5000, 4000)).toBe(20)
    expect(deriveAreaM2(3500, 2500)).toBe(8.75)
  })

  it('returns null rather than zero for an absent dimension', () => {
    // Zero is a real answer; absent is not. Conflating them turns "not filled in yet" into a
    // project with no area.
    expect(deriveAreaM2(null, 4000)).toBeNull()
    expect(deriveAreaM2(5000, null)).toBeNull()
    expect(deriveAreaM2(0, 4000)).toBeNull()
  })

  it('computes the perimeter Phase 5 prices PER_M options against', () => {
    expect(derivePerimeterM(5000, 4000)).toBe(18)
  })
})
