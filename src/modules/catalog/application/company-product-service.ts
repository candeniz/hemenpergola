import 'server-only'

import {} from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

/**
 * What a company offers — task 3.2, `manufacturer_product_management`.
 *
 * In `catalog/` because the rows are *about the catalogue*: a `CompanyProduct` says nothing
 * about the company except which platform product it points at, and every read of it has to
 * join the catalogue to mean anything. `iam/` owns the company; this owns the company's
 * relationship to what the platform sells.
 *
 * The one thing to get right here is the **data shape**, because `09` §1's matching filter
 * reads it in Phase 5: a company that does not offer the product is not a candidate, and one
 * that does not offer a required option is not either. Three states have to be
 * distinguishable and they are easy to collapse into two:
 *
 *   a row with `isOffered = true`   — we do this
 *   a row with `isOffered = false`  — we were asked and we do not do this
 *   **no row at all**               — never answered
 *
 * `09` treats the third as not offered, but it is not the same fact, and a screen that only
 * writes `true` rows makes "no" and "not asked" indistinguishable forever.
 */

// The contract lives in ./dto (extracted in 11.2); catalog-service re-exports the same
// file, so only the names this file owns are re-exported here.
export {
  listCompanyProductsSchema,
  setCompanyOptionsSchema,
  setCompanyProductSchema,
  type CompanyProductView,
  type ListCompanyProductsInput,
  type SetCompanyOptionsInput,
  type SetCompanyProductInput,
} from './dto'
import type {
  CompanyProductView,
  ListCompanyProductsInput,
  SetCompanyOptionsInput,
  SetCompanyProductInput,
} from './dto'

export const listCompanyProducts = serviceMethod<
  ListCompanyProductsInput,
  { products: CompanyProductView[] }
>(
  'catalog',
  'listCompanyProducts',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_READ)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    /*
     * Driven by the catalogue, not by what the company has already saved. A screen that
     * listed only `CompanyProduct` rows would never show a manufacturer the product they
     * have not answered for — which is exactly the product they are missing leads on.
     */
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        translations: { where: { locale: 'tr' } },
        attributes: {
          orderBy: { sortOrder: 'asc' },
          include: {
            translations: { where: { locale: 'tr' } },
            options: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: { translations: { where: { locale: 'tr' } } },
            },
          },
        },
      },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    })

    const offered = await prisma.companyProduct.findMany({
      where: { companyId },
      include: { options: true },
    })
    const byProduct = new Map(offered.map((row) => [row.productId, row]))

    return ok({
      products: products.map((product) => {
        const companyProduct = byProduct.get(product.id)
        const answers = new Map(
          (companyProduct?.options ?? []).map((option) => [option.optionId, option.isOffered]),
        )

        return {
          productId: product.id,
          companyProductId: companyProduct?.id ?? null,
          isActive: companyProduct?.isActive ?? false,
          name: product.translations[0]?.name ?? product.id,
          basisType: product.basisType,
          attributes: product.attributes.map((attribute) => ({
            attributeId: attribute.id,
            key: attribute.key,
            label: attribute.translations[0]?.label ?? attribute.key,
            isRequired: attribute.isRequired,
            options: attribute.options.map((option) => ({
              optionId: option.id,
              value: option.value,
              label: option.translations[0]?.label ?? option.value,
              isOffered: answers.get(option.id) ?? null,
            })),
          })),
        }
      }),
    })
  },
)

export const setCompanyProduct = serviceMethod<
  SetCompanyProductInput,
  { companyProductId: string }
>(
  'catalog',
  'setCompanyProduct',
  { kind: 'permission', permission: PERMISSIONS.PRODUCT_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRODUCT_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const product = await prisma.product.findUnique({ where: { id: input.productId } })
    if (product === null) return err(notFound('Product'))

    const row = await prisma.companyProduct.upsert({
      where: { companyId_productId: { companyId, productId: input.productId } },
      create: { companyId, productId: input.productId, isActive: input.isActive },
      update: { isActive: input.isActive },
    })

    await recordAudit(actor, {
      action: 'company_products_changed',
      entityType: 'CompanyProduct',
      entityId: row.id,
      companyId,
      after: { productId: input.productId, isActive: input.isActive },
    })

    return ok({ companyProductId: row.id })
  },
)

export const setCompanyOptions = serviceMethod<SetCompanyOptionsInput, { answered: number }>(
  'catalog',
  'setCompanyOptions',
  { kind: 'permission', permission: PERMISSIONS.PRODUCT_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRODUCT_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const companyProduct = await prisma.companyProduct.findUnique({
      where: { companyId_productId: { companyId, productId: input.productId } },
    })
    if (companyProduct === null) {
      return err(precondition('mark the product as offered before answering its options'))
    }

    // Every option must belong to this product. Without the check a caller could answer for
    // another product's options and quietly widen its own capability match in `09` §2.
    const valid = await prisma.productOption.findMany({
      where: {
        id: { in: input.options.map((option) => option.optionId) },
        attribute: { productId: input.productId },
      },
      select: { id: true },
    })
    const validIds = new Set(valid.map((option) => option.id))

    const rejected = input.options.filter((option) => !validIds.has(option.optionId))
    if (rejected.length > 0) {
      return err(precondition(`${rejected.length} options do not belong to this product`))
    }

    for (const option of input.options) {
      await prisma.companyProductOption.upsert({
        where: {
          companyProductId_optionId: {
            companyProductId: companyProduct.id,
            optionId: option.optionId,
          },
        },
        create: {
          companyProductId: companyProduct.id,
          optionId: option.optionId,
          isOffered: option.isOffered,
        },
        update: { isOffered: option.isOffered },
      })
    }

    await recordAudit(actor, {
      action: 'company_products_changed',
      entityType: 'CompanyProduct',
      entityId: companyProduct.id,
      companyId,
      after: {
        productId: input.productId,
        answered: input.options.length,
        offered: input.options.filter((option) => option.isOffered).length,
      },
    })

    return ok({ answered: input.options.length })
  },
)

export const companyProductService = {
  listCompanyProducts,
  setCompanyProduct,
  setCompanyOptions,
} satisfies Record<string, { meta: unknown }>
