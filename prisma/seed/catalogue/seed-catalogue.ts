import type { PrismaClient } from '@prisma/client'

import {
  CATALOGUE,
  FULLY_SPECIFIED_SLUGS,
  type AttributeSpec,
  type CategorySpec,
} from './catalogue-data'

/**
 * Seeds the catalogue of `26-execution-plan.md` §D2 — task 2.3.
 *
 * Runs in all three profiles. `demo` and `minimal` want a realistic catalogue to render;
 * `e2e` wants the same rows with the same ids every time, which is why the ids are derived
 * from the slugs rather than generated. One dataset, three profiles, no divergence to keep
 * in step.
 *
 * Idempotent, and **non-destructive on re-run**: labels and bounds are updated, but
 * `isActive` is not, because an admin may have deactivated something and a seed that
 * silently reactivated it would be worse than one that did nothing. Same rule the platform
 * settings seed already follows.
 */

export type CatalogueSummary = {
  categories: number
  products: number
  attributes: number
  options: number
  /** The two of `26` §D2. Reported so a thin catalogue is visible rather than assumed. */
  fullySpecified: number
}

const id = (prefix: string, ...parts: string[]) => `${prefix}_${parts.join('__')}`

export async function seedCatalogue(prisma: PrismaClient): Promise<CatalogueSummary> {
  const summary: CatalogueSummary = {
    categories: 0,
    products: 0,
    attributes: 0,
    options: 0,
    fullySpecified: 0,
  }

  for (const category of CATALOGUE) {
    await upsertCategory(prisma, category)
    summary.categories += 1

    for (const product of category.products) {
      const productId = id('prd', product.slug.tr)

      await prisma.product.upsert({
        where: { id: productId },
        create: {
          id: productId,
          categoryId: id('cat', category.slug.tr),
          basisType: product.basisType,
          sortOrder: product.sortOrder,
        },
        update: { basisType: product.basisType, sortOrder: product.sortOrder },
      })

      for (const locale of ['tr', 'en'] as const) {
        await prisma.productTranslation.upsert({
          where: { productId_locale: { productId, locale } },
          create: {
            productId,
            locale,
            slug: product.slug[locale],
            name: product.name[locale],
            shortDescription: product.shortDescription?.[locale] ?? null,
            description: product.description?.[locale] ?? null,
          },
          update: {
            slug: product.slug[locale],
            name: product.name[locale],
            shortDescription: product.shortDescription?.[locale] ?? null,
            description: product.description?.[locale] ?? null,
          },
        })
      }

      summary.products += 1
      if (product.fullySpecified) summary.fullySpecified += 1

      for (const attribute of product.attributes) {
        const counts = await upsertAttribute(prisma, productId, product.slug.tr, attribute)
        summary.attributes += 1
        summary.options += counts.options
      }
    }
  }

  return summary
}

async function upsertCategory(prisma: PrismaClient, category: CategorySpec): Promise<void> {
  const categoryId = id('cat', category.slug.tr)

  await prisma.category.upsert({
    where: { id: categoryId },
    create: { id: categoryId, sortOrder: category.sortOrder },
    update: { sortOrder: category.sortOrder },
  })

  for (const locale of ['tr', 'en'] as const) {
    await prisma.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId, locale } },
      create: {
        categoryId,
        locale,
        slug: category.slug[locale],
        name: category.name[locale],
        description: category.description?.[locale] ?? null,
      },
      update: {
        slug: category.slug[locale],
        name: category.name[locale],
        description: category.description?.[locale] ?? null,
      },
    })
  }
}

async function upsertAttribute(
  prisma: PrismaClient,
  productId: string,
  productSlug: string,
  attribute: AttributeSpec,
): Promise<{ options: number }> {
  const attributeId = id('atr', productSlug, attribute.key)

  const data = {
    productId,
    key: attribute.key,
    inputType: attribute.inputType,
    unit: attribute.unit ?? null,
    min: attribute.min ?? null,
    max: attribute.max ?? null,
    step: attribute.step ?? null,
    isRequired: attribute.isRequired,
    affectsPrice: attribute.affectsPrice,
    sortOrder: attribute.sortOrder,
    showIfAttributeKey: attribute.showIfAttributeKey ?? null,
    showIfValue: attribute.showIfValue ?? null,
  }

  await prisma.productAttribute.upsert({
    where: { id: attributeId },
    create: { id: attributeId, ...data },
    update: data,
  })

  for (const locale of ['tr', 'en'] as const) {
    await prisma.productAttributeTranslation.upsert({
      where: { attributeId_locale: { attributeId, locale } },
      create: {
        attributeId,
        locale,
        label: attribute.label[locale],
        helpText: attribute.helpText?.[locale] ?? null,
      },
      update: {
        label: attribute.label[locale],
        helpText: attribute.helpText?.[locale] ?? null,
      },
    })
  }

  let options = 0

  for (const option of attribute.options ?? []) {
    const optionId = id('opt', productSlug, attribute.key, option.value)

    await prisma.productOption.upsert({
      where: { id: optionId },
      create: {
        id: optionId,
        attributeId,
        value: option.value,
        sortOrder: option.sortOrder,
        isActive: option.isActive ?? true,
      },
      // `isActive` is deliberately absent: deactivation is an admin decision (`10` §Admin
      // authoring) and a seed must not undo it.
      update: { sortOrder: option.sortOrder },
    })

    for (const locale of ['tr', 'en'] as const) {
      await prisma.productOptionTranslation.upsert({
        where: { optionId_locale: { optionId, locale } },
        create: { optionId, locale, label: option.label[locale] },
        update: { label: option.label[locale] },
      })
    }

    options += 1
  }

  return { options }
}

export { FULLY_SPECIFIED_SLUGS }
