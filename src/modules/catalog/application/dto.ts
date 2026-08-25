import { z } from 'zod'

/**
 * One Zod schema per use case, shared by the server action, the route handler and the tests
 * (`CLAUDE.md` §Conventions). Same rule as `modules/iam`: shared literally, not kept in sync.
 */

export const localeSchema = z.enum(['tr', 'en'])

/**
 * A translation, per locale. **Both locales are required on create.**
 *
 * `I18N-01` and `07` §Route map: `en` has its own slug set, and a product with no English
 * translation has no English URL — it would 404 for half the site rather than falling back,
 * because there is nothing to fall back *to* when the slug itself is missing. Making it
 * required at the boundary is cheaper than discovering it in Phase 8.
 */
export const translationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  /** Optional: derived from `name` when absent, then de-duplicated within the locale. */
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase, digits and single hyphens only')
    .max(80)
    .optional(),
  description: z.string().trim().max(4000).optional(),
})

export const productTranslationSchema = translationSchema.extend({
  shortDescription: z.string().trim().max(400).optional(),
})

const bothLocales = <T extends z.ZodTypeAny>(inner: T) => z.object({ tr: inner, en: inner })

export const seoSchema = z.object({
  metaTitle: z.string().trim().max(120).optional(),
  metaDescription: z.string().trim().max(320).optional(),
  canonicalUrl: z.url().optional(),
  noIndex: z.boolean().default(false),
})

/* ── Categories ───────────────────────────────────────────────────────────── */

export const createCategorySchema = z.object({
  parentId: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  translations: bothLocales(translationSchema),
  seo: seoSchema.optional(),
})
export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = z.object({
  categoryId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  translations: bothLocales(translationSchema).partial().optional(),
  seo: seoSchema.optional(),
})
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

export const deleteCategorySchema = z.object({ categoryId: z.string().min(1) })
export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>

export const listCategoriesSchema = z.object({
  includeInactive: z.boolean().default(false),
})
export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>

/* ── Products ─────────────────────────────────────────────────────────────── */

export const basisSchema = z.enum(['AREA_M2', 'LENGTH_M', 'UNIT'])

export const createProductSchema = z.object({
  categoryId: z.string().min(1),
  basisType: basisSchema,
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  translations: bothLocales(productTranslationSchema),
  seo: seoSchema.optional(),
})
export type CreateProductInput = z.infer<typeof createProductSchema>

export const updateProductSchema = z.object({
  productId: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  basisType: basisSchema.optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  translations: bothLocales(productTranslationSchema).partial().optional(),
  seo: seoSchema.optional(),
})
export type UpdateProductInput = z.infer<typeof updateProductSchema>

export const listProductsSchema = z.object({
  categoryId: z.string().min(1).optional(),
  includeInactive: z.boolean().default(false),
})
export type ListProductsInput = z.infer<typeof listProductsSchema>

export const getProductSchema = z.object({ productId: z.string().min(1) })
export type GetProductInput = z.infer<typeof getProductSchema>

/* ── Attributes ───────────────────────────────────────────────────────────── */

export const inputTypeSchema = z.enum(['NUMBER', 'SELECT', 'MULTISELECT', 'BOOL', 'TEXT'])

export const attributeLabelSchema = z.object({
  label: z.string().trim().min(1).max(160),
  helpText: z.string().trim().max(600).optional(),
})

const attributeShape = {
  /** Machine key: referenced by `showIfAttributeKey` and by price books, never displayed. */
  key: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'lowercase letters, digits and underscores; must start with a letter',
    )
    .max(60),
  inputType: inputTypeSchema,
  unit: z.string().trim().max(16).optional(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  step: z.number().int().positive().optional(),
  isRequired: z.boolean().default(false),
  affectsPrice: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  showIfAttributeKey: z.string().trim().max(60).nullable().optional(),
  showIfValue: z.string().trim().max(120).nullable().optional(),
  translations: bothLocales(attributeLabelSchema),
}

/*
 * Two cross-field rules, applied to both the create and the update schema.
 *
 * They live at the boundary rather than in the service because a half-specified condition
 * is a malformed request, not a domain conflict — `VALIDATION` (422), not `CONFLICT` (409).
 */
type WithBounds = { min?: number | undefined; max?: number | undefined }
type WithShowIf = {
  showIfAttributeKey?: string | null | undefined
  showIfValue?: string | null | undefined
}

const boundsOrdered = (value: WithBounds): boolean =>
  value.min === undefined || value.max === undefined || value.min <= value.max

/** `showIf` needs both halves or neither; one alone is a condition nobody can evaluate. */
const showIfComplete = (value: WithShowIf): boolean =>
  (value.showIfAttributeKey ?? null) === null
    ? (value.showIfValue ?? null) === null
    : (value.showIfValue ?? null) !== null

export const createAttributeSchema = z
  .object({ productId: z.string().min(1), ...attributeShape })
  .refine(boundsOrdered, { message: 'min must not exceed max', path: ['min'] })
  .refine(showIfComplete, {
    message: 'showIfAttributeKey and showIfValue go together',
    path: ['showIfValue'],
  })
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>

export const updateAttributeSchema = z
  .object({
    attributeId: z.string().min(1),
    ...attributeShape,
    key: attributeShape.key.optional(),
    inputType: inputTypeSchema.optional(),
    translations: bothLocales(attributeLabelSchema).partial().optional(),
  })
  .refine(boundsOrdered, { message: 'min must not exceed max', path: ['min'] })
  .refine(showIfComplete, {
    message: 'showIfAttributeKey and showIfValue go together',
    path: ['showIfValue'],
  })
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>

export const deleteAttributeSchema = z.object({ attributeId: z.string().min(1) })
export type DeleteAttributeInput = z.infer<typeof deleteAttributeSchema>

/* ── Options ──────────────────────────────────────────────────────────────── */

export const optionLabelSchema = z.object({ label: z.string().trim().min(1).max(160) })

export const createOptionSchema = z.object({
  attributeId: z.string().min(1),
  value: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters, digits, hyphen and underscore')
    .max(60),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  translations: bothLocales(optionLabelSchema),
})
export type CreateOptionInput = z.infer<typeof createOptionSchema>

export const updateOptionSchema = z.object({
  optionId: z.string().min(1),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  translations: bothLocales(optionLabelSchema).partial().optional(),
})
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>

export const deleteOptionSchema = z.object({ optionId: z.string().min(1) })
export type DeleteOptionInput = z.infer<typeof deleteOptionSchema>

export const deactivateOptionSchema = z.object({ optionId: z.string().min(1) })
export type DeactivateOptionInput = z.infer<typeof deactivateOptionSchema>

/* ── Phase 11.2 extraction: the view types and configurator contract ─────── */

export type Locale = 'tr' | 'en'

export type CategorySummary = {
  id: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  productCount: number
  translations: Record<Locale, { slug: string; name: string }>
}

export type CreateCategoryResult = { categoryId: string; slugs: Record<Locale, string> }

export type ProductSummary = {
  id: string
  categoryId: string
  basisType: 'AREA_M2' | 'LENGTH_M' | 'UNIT'
  sortOrder: number
  isActive: boolean
  attributeCount: number
  translations: Record<Locale, { slug: string; name: string }>
}

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

export type CreateProductResult = { productId: string; slugs: Record<Locale, string> }

export type ConfigurableProduct = {
  productId: string
  name: string
  categoryName: string
  basisType: 'AREA_M2' | 'LENGTH_M' | 'UNIT'
}

export const listConfigurableProductsSchema = z.object({ locale: z.enum(['tr', 'en']) })
export type ListConfigurableProductsInput = z.infer<typeof listConfigurableProductsSchema>

export const getConfigurableProductSchema = z.object({
  productId: z.string().min(1),
  /**
   * Option ids this project already references, which must render **even if deactivated**.
   *
   * Ids rather than a `projectId`, deliberately. This method is `anonymous`; accepting a
   * project id would let anyone holding one learn which options it selected. The caller has
   * already loaded the project through `getProject`, which enforces ownership in its `where`
   * clause — so passing the ids grants no authority the caller did not already have.
   */
  includeOptionIds: z.array(z.string().min(1)).max(200).optional(),
})
export type GetConfigurableProductInput = z.infer<typeof getConfigurableProductSchema>

/* ── company products (company-product-service) ─────────────────────────── */

export const listCompanyProductsSchema = z.object({ companyId: z.string().min(1) })
export type ListCompanyProductsInput = z.infer<typeof listCompanyProductsSchema>

export const setCompanyProductSchema = z.object({
  companyId: z.string().min(1),
  productId: z.string().min(1),
  isActive: z.boolean(),
})
export type SetCompanyProductInput = z.infer<typeof setCompanyProductSchema>

export const setCompanyOptionsSchema = z.object({
  companyId: z.string().min(1),
  productId: z.string().min(1),
  /** Every option the company was shown, with its answer. Absent means never asked. */
  options: z.array(z.object({ optionId: z.string().min(1), isOffered: z.boolean() })).max(500),
})
export type SetCompanyOptionsInput = z.infer<typeof setCompanyOptionsSchema>

export type CompanyProductView = {
  productId: string
  companyProductId: string | null
  isActive: boolean
  name: string
  basisType: 'AREA_M2' | 'LENGTH_M' | 'UNIT'
  attributes: {
    attributeId: string
    key: string
    label: string
    isRequired: boolean
    options: {
      optionId: string
      value: string
      label: string
      /** `null` when the company has never answered — not the same as `false`. */
      isOffered: boolean | null
    }[]
  }[]
}
