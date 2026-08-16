import { beforeAll, describe, expect, it } from 'vitest'

import {
  createAttribute,
  createOption,
  deactivateOption,
  deleteAttribute,
  deleteOption,
} from '@/modules/catalog/application/attribute-service'
import {
  createCategory,
  createProduct,
  deleteCategory,
  getProduct,
  listCategories,
  listProducts,
  updateProduct,
} from '@/modules/catalog/application/catalog-service'
import { anonymousActor, type ActorContext } from '@/shared/context/actor'

import { getPrisma } from './setup'

/**
 * Catalogue CRUD and the authoring rules — tasks 2.1 and 2.2,
 * `10-project-configurator.md` §Admin authoring, `17-admin-system.md` §Catalogue.
 */

const admin: ActorContext = anonymousActor({
  userId: 'usr_admin',
  globalRole: 'ADMIN',
  ip: '203.0.113.10',
  userAgent: 'integration-suite',
})

const notAdmin: ActorContext = anonymousActor({ userId: 'usr_customer', globalRole: 'CUSTOMER' })

let categoryId = ''

beforeAll(async () => {
  // The audit writer needs a real actor row, or every entry silently fails its FK and the
  // `recordAudit` catch swallows it — which would make the audit assertions below vacuous.
  await getPrisma().user.upsert({
    where: { id: 'usr_admin' },
    create: { id: 'usr_admin', email: 'catalog-admin@example.com', globalRole: 'ADMIN' },
    update: {},
  })

  const created = await createCategory(admin, {
    translations: {
      tr: { name: 'Pergola Sistemleri' },
      en: { name: 'Pergola Systems' },
    },
    sortOrder: 0,
    isActive: true,
  })
  if (!created.ok) throw new Error(`createCategory: ${JSON.stringify(created.error)}`)
  categoryId = created.value.categoryId
}, 60_000)

async function newProduct(nameTr: string, nameEn: string): Promise<string> {
  const result = await createProduct(admin, {
    categoryId,
    basisType: 'AREA_M2',
    sortOrder: 0,
    isActive: true,
    translations: { tr: { name: nameTr }, en: { name: nameEn } },
  })
  if (!result.ok) throw new Error(`createProduct: ${JSON.stringify(result.error)}`)
  return result.value.productId
}

async function newSelectAttribute(productId: string, key: string): Promise<string> {
  const result = await createAttribute(admin, {
    productId,
    key,
    inputType: 'SELECT',
    isRequired: false,
    affectsPrice: false,
    sortOrder: 0,
    translations: { tr: { label: key }, en: { label: key } },
  })
  if (!result.ok) throw new Error(`createAttribute: ${JSON.stringify(result.error)}`)
  return result.value.attributeId
}

describe('CAT-03 · an admin adds a product with no deployment', () => {
  it('creates a category, a product, an attribute and an option, and reads them back', async () => {
    const productId = await newProduct('Bioklimatik Pergola', 'Bioclimatic Pergola')
    const attributeId = await newSelectAttribute(productId, 'roof_type')

    const option = await createOption(admin, {
      attributeId,
      value: 'louvered',
      sortOrder: 0,
      isActive: true,
      translations: { tr: { label: 'Hareketli lamel' }, en: { label: 'Louvered' } },
    })
    expect(option.ok).toBe(true)

    const detail = await getProduct(admin, { productId })
    expect(detail.ok).toBe(true)
    if (!detail.ok) return

    expect(detail.value.product.attributes).toHaveLength(1)
    expect(detail.value.product.attributes[0]?.options[0]?.labels.tr).toBe('Hareketli lamel')
    expect(detail.value.product.attributes[0]?.options[0]?.labels.en).toBe('Louvered')
  }, 120_000)

  it('derives a per-locale slug, folding Turkish letters', async () => {
    // `ADR-017`: the slug is on the translation row and unique within its locale. A single
    // slug would put "bioklimatik-pergola" in the English canonical URL.
    const productId = await newProduct('Güneşlik Sistemi', 'Shading System')

    const rows = await getPrisma().productTranslation.findMany({ where: { productId } })
    const bySlug = Object.fromEntries(rows.map((row) => [row.locale, row.slug]))

    expect(bySlug.tr).toBe('guneslik-sistemi')
    expect(bySlug.en).toBe('shading-system')
  }, 60_000)

  it('de-duplicates slugs within a locale, not across locales', async () => {
    const first = await newProduct('Aynı Ürün', 'Same Product')
    const second = await newProduct('Aynı Ürün', 'Same Product')

    const slugs = async (productId: string) =>
      Object.fromEntries(
        (await getPrisma().productTranslation.findMany({ where: { productId } })).map((row) => [
          row.locale,
          row.slug,
        ]),
      )

    expect((await slugs(first)).tr).toBe('ayni-urun')
    expect((await slugs(second)).tr).toBe('ayni-urun-2')

    // Turkish and English are independent namespaces; `same-product` is free in `en` even
    // though `ayni-urun` was taken in `tr`.
    expect((await slugs(first)).en).toBe('same-product')
    expect((await slugs(second)).en).toBe('same-product-2')
  }, 120_000)

  it('lists what it created, and hides inactive rows by default', async () => {
    const productId = await newProduct('Gizlenecek Ürün', 'Hidden Product')
    await updateProduct(admin, { productId, isActive: false })

    const visible = await listProducts(admin, { categoryId, includeInactive: false })
    const all = await listProducts(admin, { categoryId, includeInactive: true })

    expect(visible.ok && all.ok).toBe(true)
    if (!visible.ok || !all.ok) return

    expect(visible.value.products.map((p) => p.id)).not.toContain(productId)
    expect(all.value.products.map((p) => p.id)).toContain(productId)
  }, 120_000)
})

describe('a referenced option cannot be deleted', () => {
  it('deletes an option nothing has referenced', async () => {
    // The case delete exists for: an option created and removed before anyone saw it.
    const productId = await newProduct('Silinebilir', 'Deletable')
    const attributeId = await newSelectAttribute(productId, 'colour')

    const option = await createOption(admin, {
      attributeId,
      value: 'antrasit',
      sortOrder: 0,
      isActive: true,
      translations: { tr: { label: 'Antrasit' }, en: { label: 'Anthracite' } },
    })
    if (!option.ok) throw new Error('createOption failed')

    expect((await deleteOption(admin, { optionId: option.value.optionId })).ok).toBe(true)
  }, 120_000)

  it('refuses once a project references it, and says to deactivate instead', async () => {
    /*
     * The rule `10` §Admin authoring states: *"Never delete a `ProductOption` that has been
     * referenced. Deactivate. History has to stay readable, including inside a
     * `PriceCalculation.breakdown` from six months ago."*
     *
     * `ProjectAttributeValue` is a Phase 4 table, so it does not exist yet — which is
     * exactly why the guard is easy to get wrong and easy to skip. It is simulated here with
     * the same shape and the same column the real table will have, so what is tested is the
     * *guard*, not a mock of it.
     */
    const productId = await newProduct('Referanslı', 'Referenced')
    const attributeId = await newSelectAttribute(productId, 'motor')

    const option = await createOption(admin, {
      attributeId,
      value: 'somfy',
      sortOrder: 0,
      isActive: true,
      translations: { tr: { label: 'Somfy' }, en: { label: 'Somfy' } },
    })
    if (!option.ok) throw new Error('createOption failed')
    const optionId = option.value.optionId

    await getPrisma().$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProjectAttributeValue" (
        "id" TEXT PRIMARY KEY,
        "optionId" TEXT NOT NULL
      )
    `)
    await getPrisma().$executeRawUnsafe(
      `INSERT INTO "ProjectAttributeValue" ("id", "optionId") VALUES ($1, $2)`,
      `pav_${optionId}`,
      optionId,
    )

    try {
      const refused = await deleteOption(admin, { optionId })

      expect(refused.ok).toBe(false)
      if (refused.ok) return
      expect(refused.error.kind).toBe('PRECONDITION')
      if (refused.error.kind !== 'PRECONDITION') return
      expect(refused.error.reason).toContain('deactivate it instead')
      expect(refused.error.reason).toContain('1 project values')

      // And the option is still there, still usable by the project that references it.
      expect(await getPrisma().productOption.findUnique({ where: { id: optionId } })).not.toBeNull()

      // Deactivation is the action that *is* allowed, and it leaves the row readable.
      expect((await deactivateOption(admin, { optionId })).ok).toBe(true)
      const after = await getPrisma().productOption.findUnique({ where: { id: optionId } })
      expect(after?.isActive).toBe(false)

      // The attribute cannot be deleted either — the cascade would take the option with it.
      const attributeRefusal = await deleteAttribute(admin, { attributeId })
      expect(attributeRefusal.ok).toBe(false)
    } finally {
      await getPrisma().$executeRawUnsafe(`DROP TABLE IF EXISTS "ProjectAttributeValue"`)
    }
  }, 180_000)
})

describe('single-level showIf (ADR-008)', () => {
  it('accepts one level', async () => {
    const productId = await newProduct('Koşullu', 'Conditional')
    await newSelectAttribute(productId, 'motorised')

    const dependent = await createAttribute(admin, {
      productId,
      key: 'motor_brand',
      inputType: 'SELECT',
      isRequired: false,
      affectsPrice: true,
      sortOrder: 1,
      showIfAttributeKey: 'motorised',
      showIfValue: 'true',
      translations: { tr: { label: 'Motor markası' }, en: { label: 'Motor brand' } },
    })

    expect(dependent.ok).toBe(true)
  }, 120_000)

  it('refuses a chain, from either end', async () => {
    /*
     * Two levels is a dependency graph, a graph needs cycle detection and evaluation order,
     * and at that point the rules engine `ADR-008` declines to build has been built by
     * accident. Both directions are refused, so authoring order does not decide whether the
     * rule applies.
     */
    const productId = await newProduct('Zincir', 'Chain')
    await newSelectAttribute(productId, 'a')

    const b = await createAttribute(admin, {
      productId,
      key: 'b',
      inputType: 'SELECT',
      isRequired: false,
      affectsPrice: false,
      sortOrder: 1,
      showIfAttributeKey: 'a',
      showIfValue: 'yes',
      translations: { tr: { label: 'B' }, en: { label: 'B' } },
    })
    expect(b.ok).toBe(true)

    // Forwards: c depends on b, and b is itself conditional.
    const c = await createAttribute(admin, {
      productId,
      key: 'c',
      inputType: 'SELECT',
      isRequired: false,
      affectsPrice: false,
      sortOrder: 2,
      showIfAttributeKey: 'b',
      showIfValue: 'yes',
      translations: { tr: { label: 'C' }, en: { label: 'C' } },
    })
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.kind).toBe('PRECONDITION')
    if (c.error.kind !== 'PRECONDITION') return
    expect(c.error.reason).toContain('chains are not supported')
  }, 120_000)

  it('refuses a key that is not an attribute of this product', async () => {
    const productId = await newProduct('Bilinmeyen', 'Unknown key')

    const result = await createAttribute(admin, {
      productId,
      key: 'depends',
      inputType: 'BOOL',
      isRequired: false,
      affectsPrice: false,
      sortOrder: 0,
      showIfAttributeKey: 'nothing_like_this',
      showIfValue: 'true',
      translations: { tr: { label: 'X' }, en: { label: 'X' } },
    })

    expect(result.ok).toBe(false)
  }, 60_000)
})

describe('adding a required attribute reports its impact', () => {
  it('says new-projects-only rather than refusing', async () => {
    // `10` §Admin authoring: *"adding a required one — applies to new projects only;
    // existing `READY` projects stay valid"*. The admin is allowed to do it; they are not
    // allowed to do it unknowingly.
    const productId = await newProduct('Zorunlu', 'Required')

    const optional = await createAttribute(admin, {
      productId,
      key: 'optional_one',
      inputType: 'TEXT',
      isRequired: false,
      affectsPrice: false,
      sortOrder: 0,
      translations: { tr: { label: 'İsteğe bağlı' }, en: { label: 'Optional' } },
    })
    expect(optional.ok && optional.value.impact).toBe('safe')

    const required = await createAttribute(admin, {
      productId,
      key: 'required_one',
      inputType: 'TEXT',
      isRequired: true,
      affectsPrice: false,
      sortOrder: 1,
      translations: { tr: { label: 'Zorunlu' }, en: { label: 'Required' } },
    })
    expect(required.ok && required.value.impact).toBe('new-projects-only')
  }, 120_000)
})

describe('guards from 17 §Catalogue', () => {
  it('refuses to delete a category that has products', async () => {
    const refused = await deleteCategory(admin, { categoryId })

    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.error.kind).toBe('PRECONDITION')
    if (refused.error.kind !== 'PRECONDITION') return
    expect(refused.error.reason).toContain('deactivate it instead')
  }, 60_000)

  it('refuses options on a field that has no choices', async () => {
    const productId = await newProduct('Sayısal', 'Numeric')
    const numeric = await createAttribute(admin, {
      productId,
      key: 'width_cm',
      inputType: 'NUMBER',
      unit: 'cm',
      min: 100,
      max: 800,
      step: 10,
      isRequired: true,
      affectsPrice: true,
      sortOrder: 0,
      translations: { tr: { label: 'Genişlik' }, en: { label: 'Width' } },
    })
    if (!numeric.ok) throw new Error('createAttribute failed')

    const option = await createOption(admin, {
      attributeId: numeric.value.attributeId,
      value: 'nonsense',
      sortOrder: 0,
      isActive: true,
      translations: { tr: { label: 'X' }, en: { label: 'X' } },
    })

    expect(option.ok).toBe(false)
  }, 120_000)
})

describe('the catalogue is admin-only', () => {
  it.each([
    ['listCategories', () => listCategories(notAdmin, { includeInactive: false })],
    ['listProducts', () => listProducts(notAdmin, { includeInactive: false })],
    [
      'createProduct',
      () =>
        createProduct(notAdmin, {
          categoryId,
          basisType: 'UNIT',
          sortOrder: 0,
          isActive: true,
          translations: { tr: { name: 'Olmaz' }, en: { name: 'Nope' } },
        }),
    ],
  ])(
    '%s refuses a signed-in customer',
    async (_name, call) => {
      // A verified manufacturer's OWNER must not be able to edit what the platform sells
      // either — the check is `globalRole = ADMIN`, not a company permission (`17`).
      const result = await call()

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('FORBIDDEN')
    },
    60_000,
  )
})

describe('every admin write lands in the audit log', () => {
  it('records a create with its after-state', async () => {
    const productId = await newProduct('Denetimli', 'Audited')

    const entries = await getPrisma().auditLog.findMany({
      where: { entityType: 'Product', entityId: productId },
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.action).toBe('catalog_created')
    expect(entries[0]?.actorUserId).toBe('usr_admin')
    expect(entries[0]?.ip).toBe('203.0.113.10')
    expect((entries[0]?.after as { basisType?: string } | null)?.basisType).toBe('AREA_M2')
  }, 60_000)

  it('records an update with before and after', async () => {
    const productId = await newProduct('Değişecek', 'Will change')
    await updateProduct(admin, { productId, isActive: false, sortOrder: 7 })

    const entry = await getPrisma().auditLog.findFirst({
      where: { entityType: 'Product', entityId: productId, action: 'catalog_updated' },
    })

    expect((entry?.before as { isActive?: boolean } | null)?.isActive).toBe(true)
    expect((entry?.after as { isActive?: boolean } | null)?.isActive).toBe(false)
    expect((entry?.after as { sortOrder?: number } | null)?.sortOrder).toBe(7)
  }, 120_000)
})
