import { describe, expect, it } from 'vitest'

import { validateShowIf } from '@/modules/catalog/domain/authoring-rules'

import { CATALOGUE, FULLY_SPECIFIED_SLUGS, type ProductSpec } from './catalogue-data'

/**
 * The seed catalogue, and the claim `ADR-008` rests on.
 *
 * `10-project-configurator.md` §What V1 builds: *"Every product in the seed catalogue is
 * expressible as a flat attribute set, so the engine would carry cost with no V1 payoff."*
 * That sentence is the entire justification for not building a rules engine, and until there
 * was a seed catalogue it was a prediction. This file is where it stops being one.
 */

const products = CATALOGUE.flatMap((category) => category.products)
const specified = products.filter((product) => product.fullySpecified)

describe('D2 · two products fully specified, the rest at name level', () => {
  it('specifies exactly the two 26 §D2 asks for', () => {
    expect(specified.map((product) => product.slug.tr).sort()).toEqual(
      [...FULLY_SPECIFIED_SLUGS].sort(),
    )
  })

  it('leaves the others with no attributes at all', () => {
    /*
     * Not "fewer attributes" — *none*. A half-specified product looks finished in a list and
     * becomes a surprise in Phase 4; an empty one cannot be mistaken for a specification.
     */
    for (const product of products.filter((p) => !p.fullySpecified)) {
      expect(product.attributes, product.slug.tr).toEqual([])
    }
  })

  it('covers the seven systems product_selection_step_1 shows', () => {
    expect(products).toHaveLength(7)
  })
})

describe('every field 04 §Catalogue defines is filled on the specified two', () => {
  it.each(specified.map((product) => [product.slug.tr, product] as const))(
    '%s',
    (_slug, product: ProductSpec) => {
      expect(product.basisType).toBeTruthy()
      expect(product.name.tr.length).toBeGreaterThan(2)
      expect(product.name.en.length).toBeGreaterThan(2)
      expect(product.description?.tr.length ?? 0).toBeGreaterThan(200)
      expect(product.attributes.length).toBeGreaterThanOrEqual(8)

      for (const attribute of product.attributes) {
        expect(attribute.label.tr.length, attribute.key).toBeGreaterThan(2)
        expect(attribute.label.en.length, attribute.key).toBeGreaterThan(2)
        expect(typeof attribute.isRequired, attribute.key).toBe('boolean')
        expect(typeof attribute.affectsPrice, attribute.key).toBe('boolean')

        if (attribute.inputType === 'NUMBER') {
          // A numeric field with no bounds is a field `10` §Validation cannot check
          // readiness against — the min/max it reads live here and nowhere else.
          expect(attribute.unit, attribute.key).toBeTruthy()
          expect(attribute.min, attribute.key).toBeTypeOf('number')
          expect(attribute.max, attribute.key).toBeTypeOf('number')
          expect(attribute.step, attribute.key).toBeTypeOf('number')
          expect(attribute.min ?? 0).toBeLessThan(attribute.max ?? 0)
        }

        if (attribute.inputType === 'SELECT' || attribute.inputType === 'MULTISELECT') {
          expect((attribute.options ?? []).length, attribute.key).toBeGreaterThanOrEqual(2)
          for (const option of attribute.options ?? []) {
            expect(option.label.tr.length, `${attribute.key}.${option.value}`).toBeGreaterThan(1)
            expect(option.label.en.length, `${attribute.key}.${option.value}`).toBeGreaterThan(1)
          }
        }
      }
    },
  )

  it('gives every attribute and option a distinct key within its parent', () => {
    for (const product of products) {
      const keys = product.attributes.map((attribute) => attribute.key)
      expect(new Set(keys).size, product.slug.tr).toBe(keys.length)

      for (const attribute of product.attributes) {
        const values = (attribute.options ?? []).map((option) => option.value)
        expect(new Set(values).size, `${product.slug.tr}.${attribute.key}`).toBe(values.length)
      }
    }
  })

  it('keeps sort orders distinct, so the form has a defined order', () => {
    for (const product of products) {
      const orders = product.attributes.map((attribute) => attribute.sortOrder)
      expect(new Set(orders).size, product.slug.tr).toBe(orders.length)
    }
  })
})

describe('ADR-008 · the catalogue is expressible as a flat attribute set', () => {
  it('passes the same showIf validation the service enforces', () => {
    /*
     * Through `validateShowIf`, not a re-implementation of it. If the catalogue and the
     * service ever disagree about what one level means, this is where it shows — and a
     * second copy of the rule would agree with itself forever.
     */
    for (const product of products) {
      const siblings = product.attributes.map((attribute) => ({
        key: attribute.key,
        showIfAttributeKey: attribute.showIfAttributeKey ?? null,
      }))

      for (const attribute of product.attributes) {
        const problems = validateShowIf(
          { key: attribute.key, showIfAttributeKey: attribute.showIfAttributeKey ?? null },
          siblings.filter((sibling) => sibling.key !== attribute.key),
        )
        expect(problems, `${product.slug.tr}.${attribute.key}`).toEqual([])
      }
    }
  })

  it('uses conditionality at all, and only one level of it', () => {
    // A catalogue with no `showIf` would prove nothing: the claim is that one level is
    // *enough*, and that is only tested if one level is actually needed somewhere.
    const conditional = products.flatMap((product) =>
      product.attributes.filter((attribute) => attribute.showIfAttributeKey !== undefined),
    )

    expect(conditional.length).toBeGreaterThanOrEqual(2)

    for (const attribute of conditional) {
      expect(attribute.showIfValue, attribute.key).toBeTruthy()
    }
  })

  it('points every showIf at an unconditional sibling on the same product', () => {
    for (const product of products) {
      const byKey = new Map(product.attributes.map((attribute) => [attribute.key, attribute]))

      for (const attribute of product.attributes) {
        const target = attribute.showIfAttributeKey
        if (target === undefined) continue

        const sibling = byKey.get(target)
        expect(sibling, `${attribute.key} → ${target}`).toBeDefined()
        expect(
          sibling?.showIfAttributeKey,
          `${target} must itself be unconditional`,
        ).toBeUndefined()

        // And the expected value has to be one the target can actually take, or the field
        // is permanently hidden and nobody finds out until Phase 4.
        const values = (sibling?.options ?? []).map((option) => option.value)
        expect(values, `${target} values`).toContain(attribute.showIfValue)
      }
    }
  })

  it('needs no cross-attribute compatibility rule to be usable', () => {
    /*
     * The finding, pinned so it cannot regress.
     *
     * The first draft of `giyotin-cam` had a `panel_sayisi` attribute, and it did not work:
     * the valid panel count depends on the opening width, which is a *compatibility* rule
     * between two attributes, and `showIf` only does visibility. `ADR-008` names
     * "cross-option compatibility rules" as out of V1, so the honest options were to build
     * the engine or to reshape the attribute.
     *
     * It was reshaped. Panel count is an engineering consequence of the opening, not a
     * customer choice, so the customer gives the opening and the manufacturer works out the
     * panels — which is also what actually happens when somebody orders one. The attribute
     * is gone rather than constrained, and the catalogue needs no compatibility rule.
     *
     * This test is the guard: if a future attribute reintroduces one, the failure should be
     * here rather than in Phase 4.
     */
    const guillotine = products.find((product) => product.slug.tr === 'giyotin-cam')
    expect(guillotine?.attributes.map((attribute) => attribute.key)).not.toContain('panel_sayisi')
  })
})

describe('the Turkish is written, not translated', () => {
  it('uses the trade term where it differs from a literal translation', () => {
    // `07` §i18n. These are the words an installer uses; a literal translation of the
    // English screen copy would produce different, wronger ones.
    const all = JSON.stringify(CATALOGUE)

    expect(all).toContain('Çıkıntı') // not "Projeksiyon"
    expect(all).toContain('Duvara dayalı') // not "Duvara monte"
    expect(all).toContain('Giyotin Cam') // not "Gilotin"
    expect(all).toContain('Isıcam') // the trade word for double glazing
    expect(all).toContain('Zip perde')
  })

  it('never has the two locales identical for a sentence-length string', () => {
    // Copying the Turkish into `en` is the obvious way to make a parity check pass, and it
    // produces a catalogue that is "bilingual" and unreadable.
    const identical: string[] = []

    const check = (label: string, text: { tr: string; en: string } | undefined) => {
      if (text === undefined) return
      if (text.tr.length > 15 && text.tr === text.en) identical.push(label)
    }

    for (const category of CATALOGUE) {
      check(category.slug.tr, category.name)
      check(`${category.slug.tr}.description`, category.description)

      for (const product of category.products) {
        check(product.slug.tr, product.name)
        check(`${product.slug.tr}.short`, product.shortDescription)
        check(`${product.slug.tr}.description`, product.description)

        for (const attribute of product.attributes) {
          check(`${product.slug.tr}.${attribute.key}`, attribute.label)
          check(`${product.slug.tr}.${attribute.key}.help`, attribute.helpText)
        }
      }
    }

    expect(identical).toEqual([])
  })

  it('gives every fully specified product a slug per locale that differs', () => {
    // `ADR-017`: `en` has its own slug set. `bioklimatik-pergola` in an English URL is the
    // failure that ADR exists to prevent.
    for (const product of specified) {
      expect(product.slug.tr).not.toBe(product.slug.en)
    }
  })
})

describe('affectsPrice is a decision, not a default', () => {
  it('is true on the fields that reach 08 §Algorithm', () => {
    // Dimensions enter at step 1 as the basis and at step 6 through `SIZE_SURCHARGE` /
    // `HEIGHT_SURCHARGE`; choice attributes enter at step 3 as priced options. Both are
    // marked, and Phase 5 reads the flag to know which `PriceBookOptionPrice` rows a
    // manufacturer must fill in.
    for (const product of specified) {
      for (const attribute of product.attributes) {
        expect(attribute.affectsPrice, `${product.slug.tr}.${attribute.key}`).toBe(true)
      }
    }
  })

  it('resolves every NUMBER attribute through DIMENSION_ATTRIBUTE_KEYS — Q27', async () => {
    /*
     * Phase 5 found that readiness and the catalogue had never agreed on what a dimension
     * attribute is called, and the bridge is a fixed alias table in `steps.ts`. That table
     * is code, and `CAT-03` promises catalogue changes are DATA changes — so until Q27's
     * semantic-role column lands (Phase 8), this test is the tripwire: an admin-authored
     * `en_mm` that the table cannot resolve would make its product silently un-READY, and
     * this failure is where that surfaces as a named problem instead.
     */
    const { dimensionFieldFor } = await import('@/modules/project/domain/steps')

    for (const product of specified) {
      for (const attribute of product.attributes) {
        if (attribute.inputType !== 'NUMBER') continue
        expect(
          dimensionFieldFor(attribute.key),
          `${product.slug.tr}.${attribute.key} is a NUMBER attribute no dimension field resolves — readiness would demand an answer the wizard cannot give (Q27)`,
        ).not.toBeNull()
      }
    }
  })

  it('has at least one optional attribute, so `isRequired` is a decision too', () => {
    // If every attribute were required, readiness (`10` §Validation) would be trivially
    // "all of them" and the flag would be carrying no information.
    for (const product of specified) {
      const optional = product.attributes.filter((attribute) => !attribute.isRequired)
      expect(optional.length, product.slug.tr).toBeGreaterThanOrEqual(1)
    }
  })
})
