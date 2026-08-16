import 'server-only'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { requireAdmin } from '@/modules/iam/application/authorization'
import type { ActorContext } from '@/shared/context/actor'
import { prisma } from '@/shared/db'
import { conflict, err, notFound, ok, precondition, type DomainError } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import { slugify, uniqueSlug } from '@/shared/text/slug'

import { canDeleteCategory } from '../domain/authoring-rules'

import type {
  CreateCategoryInput,
  CreateProductInput,
  DeleteCategoryInput,
  GetProductInput,
  ListCategoriesInput,
  ListProductsInput,
  UpdateCategoryInput,
  UpdateProductInput,
} from './dto'
import type { z } from 'zod'
import type { seoSchema } from './dto'

type SeoInput = z.infer<typeof seoSchema>

/**
 * Categories and products — `17-admin-system.md` §Catalogue, `CAT-03`.
 *
 * Everything here is data. Adding a product is a row, not a deployment, which is the whole
 * reason `04` §Conventions makes categories and products rows rather than enums (`CAT-01`).
 *
 * Three rules the service owns rather than the screen:
 *
 *   **Both locales, always.** A product with no English translation has no English URL, and
 *   `07` §Route map gives `en` its own slug set — so there is nothing to fall back to.
 *
 *   **Slugs are per locale and unique within it** (`ADR-017`). Derived from the name when
 *   the admin does not supply one, then de-duplicated *within that locale*.
 *
 *   **Every write is audited with before/after** (`02` §Admin). The viewer is task 2.5; the
 *   writer is here, because an audit trail that starts when someone builds the viewer has a
 *   hole exactly where the early mistakes are.
 */

export type Locale = 'tr' | 'en'
const LOCALES: readonly Locale[] = ['tr', 'en']

type TranslationInput = { name: string; slug?: string; description?: string }

/**
 * Resolve the slug for one locale: the supplied one, or one derived from the name, then made
 * unique **within that locale** against the given table.
 *
 * `excludeId` is the row being updated — without it, renaming a product to the name it
 * already has would find its own slug taken and append `-2` every time it is saved.
 */
async function resolveSlug(
  table: 'category' | 'product',
  locale: Locale,
  translation: TranslationInput,
  excludeId: string | null,
): Promise<string> {
  const base =
    translation.slug ?? slugify(translation.name, table === 'product' ? 'urun' : 'kategori')

  const rows =
    table === 'category'
      ? await prisma.categoryTranslation.findMany({
          where: { locale, slug: { startsWith: base } },
          select: { slug: true, categoryId: true },
        })
      : await prisma.productTranslation.findMany({
          where: { locale, slug: { startsWith: base } },
          select: { slug: true, productId: true },
        })

  const taken = new Set(
    rows
      .filter((row) => ('categoryId' in row ? row.categoryId : row.productId) !== excludeId)
      .map((row) => row.slug),
  )

  return uniqueSlug(base, taken)
}

/**
 * Create the `Seo` row separately and pass its id.
 *
 * Prisma refuses a create that mixes a scalar foreign key (`parentId`) with a nested
 * relation write (`seo: { create }`) — the checked and unchecked input shapes are disjoint.
 * Two statements, and the `Seo` row is harmless on its own if the second one fails.
 */
async function createSeo(seo: SeoInput | undefined): Promise<string | null> {
  if (seo === undefined) return null
  const row = await prisma.seo.create({ data: seo })
  return row.id
}

/** A P2002 on `(locale, slug)` is a race, not a bug. Anything else is re-thrown. */
function fromConstraint(error: unknown): DomainError {
  const code = (error as { code?: string } | null)?.code
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target
  const targetText = Array.isArray(target) ? target.join(',') : String(target ?? '')

  if (code === 'P2002') {
    if (targetText.includes('slug')) return conflict('slug already taken in this locale')
    if (targetText.includes('key')) return conflict('attribute key already used on this product')
    if (targetText.includes('value')) return conflict('option value already used on this attribute')
    return conflict('already exists')
  }
  if (code === 'P2003') return precondition('referenced row does not exist')

  throw error
}

/* ── Categories ───────────────────────────────────────────────────────────── */

export type CategorySummary = {
  id: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  productCount: number
  translations: Record<Locale, { slug: string; name: string }>
}

export const listCategories = serviceMethod<ListCategoriesInput, { categories: CategorySummary[] }>(
  'catalog',
  'listCategories',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const rows = await prisma.category.findMany({
      where: input.includeInactive ? {} : { isActive: true },
      include: { translations: true, _count: { select: { products: true } } },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
    })

    return ok({
      categories: rows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        productCount: row._count.products,
        translations: Object.fromEntries(
          row.translations.map((t) => [t.locale, { slug: t.slug, name: t.name }]),
        ) as CategorySummary['translations'],
      })),
    })
  },
)

export type CreateCategoryResult = { categoryId: string; slugs: Record<Locale, string> }

export const createCategory = serviceMethod<CreateCategoryInput, CreateCategoryResult>(
  'catalog',
  'createCategory',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    if (input.parentId !== undefined) {
      const parent = await prisma.category.findUnique({ where: { id: input.parentId } })
      if (parent === null) return err(notFound('Category'))
      // One level of nesting. `07` §Route map has `/kategoriler/[slug]`, not a path of
      // arbitrary depth, and a tree nobody can render is a tree nobody maintains.
      if (parent.parentId !== null) return err(precondition('categories nest one level only'))
    }

    const slugs = {
      tr: await resolveSlug('category', 'tr', input.translations.tr, null),
      en: await resolveSlug('category', 'en', input.translations.en, null),
    }

    try {
      const seoId = await createSeo(input.seo)

      const category = await prisma.category.create({
        data: {
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          seoId,
          translations: {
            create: LOCALES.map((locale) => ({
              locale,
              slug: slugs[locale],
              name: input.translations[locale].name,
              description: input.translations[locale].description ?? null,
            })),
          },
        },
      })

      await recordAudit(actor, {
        action: 'catalog_created',
        entityType: 'Category',
        entityId: category.id,
        after: { slugs, isActive: input.isActive, parentId: input.parentId ?? null },
      })

      return ok({ categoryId: category.id, slugs })
    } catch (error) {
      return err(fromConstraint(error))
    }
  },
)

export const updateCategory = serviceMethod<UpdateCategoryInput, { categoryId: string }>(
  'catalog',
  'updateCategory',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.category.findUnique({
      where: { id: input.categoryId },
      include: { translations: true },
    })
    if (before === null) return err(notFound('Category'))

    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === input.categoryId)
        return err(precondition('a category cannot parent itself'))
      const parent = await prisma.category.findUnique({ where: { id: input.parentId } })
      if (parent === null) return err(notFound('Category'))
      if (parent.parentId !== null) return err(precondition('categories nest one level only'))
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.category.update({
          where: { id: input.categoryId },
          data: {
            ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
            ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
        })

        for (const locale of LOCALES) {
          const translation = input.translations?.[locale]
          if (translation === undefined) continue

          const slug = await resolveSlug('category', locale, translation, input.categoryId)
          await tx.categoryTranslation.upsert({
            where: { categoryId_locale: { categoryId: input.categoryId, locale } },
            create: {
              categoryId: input.categoryId,
              locale,
              slug,
              name: translation.name,
              description: translation.description ?? null,
            },
            update: {
              slug,
              name: translation.name,
              description: translation.description ?? null,
            },
          })
        }
      })
    } catch (error) {
      return err(fromConstraint(error))
    }

    const after = await prisma.category.findUnique({
      where: { id: input.categoryId },
      include: { translations: true },
    })

    await recordAudit(actor, {
      action: 'catalog_updated',
      entityType: 'Category',
      entityId: input.categoryId,
      before: summariseCategory(before),
      after: summariseCategory(after),
    })

    return ok({ categoryId: input.categoryId })
  },
)

function summariseCategory(
  row: {
    isActive: boolean
    sortOrder: number
    parentId: string | null
    translations: { locale: string; slug: string; name: string }[]
  } | null,
) {
  if (row === null) return null
  return {
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    parentId: row.parentId,
    translations: row.translations.map((t) => ({ locale: t.locale, slug: t.slug, name: t.name })),
  }
}

/**
 * Delete a category — refused if it has children or products (`17` §Catalogue).
 *
 * Deactivation is the normal action and is always available; this exists for a category
 * created by mistake. `onDelete: Restrict` on both relations means the database would refuse
 * anyway, and this turns that into a `PRECONDITION` the screen can explain rather than a 500.
 */
export const deleteCategory = serviceMethod<DeleteCategoryInput, { deleted: true }>(
  'catalog',
  'deleteCategory',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      include: { _count: { select: { children: true, products: true } } },
    })
    if (category === null) return err(notFound('Category'))

    if (
      !canDeleteCategory({ children: category._count.children, products: category._count.products })
    ) {
      return err(
        precondition(
          `category has ${category._count.children} children and ${category._count.products} products; deactivate it instead`,
        ),
      )
    }

    await prisma.category.delete({ where: { id: input.categoryId } })

    await recordAudit(actor, {
      action: 'catalog_deleted',
      entityType: 'Category',
      entityId: input.categoryId,
      before: { id: input.categoryId },
    })

    return ok({ deleted: true } as const)
  },
)

/* ── Products ─────────────────────────────────────────────────────────────── */

export type ProductSummary = {
  id: string
  categoryId: string
  basisType: 'AREA_M2' | 'LENGTH_M' | 'UNIT'
  sortOrder: number
  isActive: boolean
  attributeCount: number
  translations: Record<Locale, { slug: string; name: string }>
}

export const listProducts = serviceMethod<ListProductsInput, { products: ProductSummary[] }>(
  'catalog',
  'listProducts',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const rows = await prisma.product.findMany({
      where: {
        ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
        ...(input.includeInactive ? {} : { isActive: true }),
      },
      include: { translations: true, _count: { select: { attributes: true } } },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
    })

    return ok({
      products: rows.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        basisType: row.basisType,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        attributeCount: row._count.attributes,
        translations: Object.fromEntries(
          row.translations.map((t) => [t.locale, { slug: t.slug, name: t.name }]),
        ) as ProductSummary['translations'],
      })),
    })
  },
)

export type ProductDetail = ProductSummary & {
  attributes: {
    id: string
    key: string
    inputType: 'NUMBER' | 'SELECT' | 'MULTISELECT' | 'BOOL' | 'TEXT'
    unit: string | null
    min: number | null
    max: number | null
    step: number | null
    isRequired: boolean
    affectsPrice: boolean
    sortOrder: number
    showIfAttributeKey: string | null
    showIfValue: string | null
    labels: Record<Locale, string>
    options: {
      id: string
      value: string
      sortOrder: number
      isActive: boolean
      labels: Record<Locale, string>
    }[]
  }[]
}

/** The whole product as the configurator would load it — `10` §What V1 builds. */
export const getProduct = serviceMethod<GetProductInput, { product: ProductDetail }>(
  'catalog',
  'getProduct',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const row = await prisma.product.findUnique({
      where: { id: input.productId },
      include: {
        translations: true,
        _count: { select: { attributes: true } },
        attributes: {
          orderBy: { sortOrder: 'asc' },
          include: {
            translations: true,
            options: { orderBy: { sortOrder: 'asc' }, include: { translations: true } },
          },
        },
      },
    })
    if (row === null) return err(notFound('Product'))

    const labelsOf = (translations: { locale: string; label: string }[]) =>
      Object.fromEntries(translations.map((t) => [t.locale, t.label])) as Record<Locale, string>

    return ok({
      product: {
        id: row.id,
        categoryId: row.categoryId,
        basisType: row.basisType,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        attributeCount: row._count.attributes,
        translations: Object.fromEntries(
          row.translations.map((t) => [t.locale, { slug: t.slug, name: t.name }]),
        ) as ProductSummary['translations'],
        attributes: row.attributes.map((attribute) => ({
          id: attribute.id,
          key: attribute.key,
          inputType: attribute.inputType,
          unit: attribute.unit,
          min: attribute.min,
          max: attribute.max,
          step: attribute.step,
          isRequired: attribute.isRequired,
          affectsPrice: attribute.affectsPrice,
          sortOrder: attribute.sortOrder,
          showIfAttributeKey: attribute.showIfAttributeKey,
          showIfValue: attribute.showIfValue,
          labels: labelsOf(attribute.translations),
          options: attribute.options.map((option) => ({
            id: option.id,
            value: option.value,
            sortOrder: option.sortOrder,
            isActive: option.isActive,
            labels: labelsOf(option.translations),
          })),
        })),
      },
    })
  },
)

export type CreateProductResult = { productId: string; slugs: Record<Locale, string> }

export const createProduct = serviceMethod<CreateProductInput, CreateProductResult>(
  'catalog',
  'createProduct',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const category = await prisma.category.findUnique({ where: { id: input.categoryId } })
    if (category === null) return err(notFound('Category'))

    const slugs = {
      tr: await resolveSlug('product', 'tr', input.translations.tr, null),
      en: await resolveSlug('product', 'en', input.translations.en, null),
    }

    try {
      const seoId = await createSeo(input.seo)

      const product = await prisma.product.create({
        data: {
          categoryId: input.categoryId,
          basisType: input.basisType,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          seoId,
          translations: {
            create: LOCALES.map((locale) => ({
              locale,
              slug: slugs[locale],
              name: input.translations[locale].name,
              shortDescription: input.translations[locale].shortDescription ?? null,
              description: input.translations[locale].description ?? null,
            })),
          },
        },
      })

      await recordAudit(actor, {
        action: 'catalog_created',
        entityType: 'Product',
        entityId: product.id,
        after: { slugs, basisType: input.basisType, categoryId: input.categoryId },
      })

      return ok({ productId: product.id, slugs })
    } catch (error) {
      return err(fromConstraint(error))
    }
  },
)

export const updateProduct = serviceMethod<UpdateProductInput, { productId: string }>(
  'catalog',
  'updateProduct',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.product.findUnique({
      where: { id: input.productId },
      include: { translations: true },
    })
    if (before === null) return err(notFound('Product'))

    if (input.categoryId !== undefined) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } })
      if (category === null) return err(notFound('Category'))
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: input.productId },
          data: {
            ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
            ...(input.basisType === undefined ? {} : { basisType: input.basisType }),
            ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
        })

        for (const locale of LOCALES) {
          const translation = input.translations?.[locale]
          if (translation === undefined) continue

          const slug = await resolveSlug('product', locale, translation, input.productId)
          await tx.productTranslation.upsert({
            where: { productId_locale: { productId: input.productId, locale } },
            create: {
              productId: input.productId,
              locale,
              slug,
              name: translation.name,
              shortDescription: translation.shortDescription ?? null,
              description: translation.description ?? null,
            },
            update: {
              slug,
              name: translation.name,
              shortDescription: translation.shortDescription ?? null,
              description: translation.description ?? null,
            },
          })
        }
      })
    } catch (error) {
      return err(fromConstraint(error))
    }

    const after = await prisma.product.findUnique({
      where: { id: input.productId },
      include: { translations: true },
    })

    await recordAudit(actor, {
      action: 'catalog_updated',
      entityType: 'Product',
      entityId: input.productId,
      before: summariseProduct(before),
      after: summariseProduct(after),
    })

    return ok({ productId: input.productId })
  },
)

function summariseProduct(
  row: {
    isActive: boolean
    sortOrder: number
    basisType: string
    categoryId: string
    translations: { locale: string; slug: string; name: string }[]
  } | null,
) {
  if (row === null) return null
  return {
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    basisType: row.basisType,
    categoryId: row.categoryId,
    translations: row.translations.map((t) => ({ locale: t.locale, slug: t.slug, name: t.name })),
  }
}

export const catalogService = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
} satisfies Record<string, { meta: unknown }>

export type CatalogActor = ActorContext
