'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type * as CatalogDto from '@/modules/catalog/application/dto'
import type {
  CategorySummary,
  CreateCategoryResult,
  CreateProductResult,
  ProductDetail,
  ProductSummary,
} from '@/modules/catalog/application/catalog-service'
import type { CreateAttributeResult } from '@/modules/catalog/application/attribute-service'
import type { DomainError, Result } from '@/shared/result'

/**
 * Catalogue server actions — the second adapter over the same services
 * (`05-system-architecture.md` §Two entry points), alongside `/api/v1/admin/catalog/*`.
 *
 * Same construction as `app/actions/auth.ts`: `await import()` for every value so nothing
 * reaches the build-time module graph (`CLAUDE.md` non-negotiable 9), `import type` for the
 * types, and the *same* Zod schema the route handler parses with.
 */

async function adminActor() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })
}

async function run<K extends keyof typeof CatalogDto, T>(
  schema: K,
  call: (
    actor: Awaited<ReturnType<typeof adminActor>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const [dto, { err, validation }] = await Promise.all([
    import('@/modules/catalog/application/dto'),
    import('@/shared/result'),
  ])

  const parsed = (dto[schema] as { safeParse: (value: unknown) => unknown }).safeParse(input) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await call(await adminActor(), parsed.data as never))
}

const catalog = () => import('@/modules/catalog/application/catalog-service')
const attributes = () => import('@/modules/catalog/application/attribute-service')

export async function listCategoriesAction(
  input: unknown = {},
): Promise<ActionResult<{ categories: CategorySummary[] }>> {
  return run('listCategoriesSchema', async (a, d) => (await catalog()).listCategories(a, d), input)
}

export async function createCategoryAction(
  input: unknown,
): Promise<ActionResult<CreateCategoryResult>> {
  return run('createCategorySchema', async (a, d) => (await catalog()).createCategory(a, d), input)
}

export async function updateCategoryAction(
  input: unknown,
): Promise<ActionResult<{ categoryId: string }>> {
  return run('updateCategorySchema', async (a, d) => (await catalog()).updateCategory(a, d), input)
}

export async function deleteCategoryAction(
  input: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  return run('deleteCategorySchema', async (a, d) => (await catalog()).deleteCategory(a, d), input)
}

export async function listProductsAction(
  input: unknown = {},
): Promise<ActionResult<{ products: ProductSummary[] }>> {
  return run('listProductsSchema', async (a, d) => (await catalog()).listProducts(a, d), input)
}

export async function getProductAction(
  input: unknown,
): Promise<ActionResult<{ product: ProductDetail }>> {
  return run('getProductSchema', async (a, d) => (await catalog()).getProduct(a, d), input)
}

export async function createProductAction(
  input: unknown,
): Promise<ActionResult<CreateProductResult>> {
  return run('createProductSchema', async (a, d) => (await catalog()).createProduct(a, d), input)
}

export async function updateProductAction(
  input: unknown,
): Promise<ActionResult<{ productId: string }>> {
  return run('updateProductSchema', async (a, d) => (await catalog()).updateProduct(a, d), input)
}

export async function createAttributeAction(
  input: unknown,
): Promise<ActionResult<CreateAttributeResult>> {
  return run(
    'createAttributeSchema',
    async (a, d) => (await attributes()).createAttribute(a, d),
    input,
  )
}

export async function updateAttributeAction(
  input: unknown,
): Promise<ActionResult<CreateAttributeResult>> {
  return run(
    'updateAttributeSchema',
    async (a, d) => (await attributes()).updateAttribute(a, d),
    input,
  )
}

export async function deleteAttributeAction(
  input: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  return run(
    'deleteAttributeSchema',
    async (a, d) => (await attributes()).deleteAttribute(a, d),
    input,
  )
}

export async function createOptionAction(
  input: unknown,
): Promise<ActionResult<{ optionId: string }>> {
  return run('createOptionSchema', async (a, d) => (await attributes()).createOption(a, d), input)
}

export async function updateOptionAction(
  input: unknown,
): Promise<ActionResult<{ optionId: string }>> {
  return run('updateOptionSchema', async (a, d) => (await attributes()).updateOption(a, d), input)
}

export async function deactivateOptionAction(
  input: unknown,
): Promise<ActionResult<{ optionId: string }>> {
  return run(
    'deactivateOptionSchema',
    async (a, d) => (await attributes()).deactivateOption(a, d),
    input,
  )
}

export async function deleteOptionAction(input: unknown): Promise<ActionResult<{ deleted: true }>> {
  return run('deleteOptionSchema', async (a, d) => (await attributes()).deleteOption(a, d), input)
}
