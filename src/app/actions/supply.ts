'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

/**
 * The manufacturer supply side — product offer, service areas and portfolio (tasks 3.2, 3.6, 3.7).
 *
 * Three services in one action file because they are one screen group and each contributes two or three actions; splitting them would be three files of boilerplate around the same `run`.
 *
 * Same construction as every other action file: `await import()` for every value so nothing
 * reaches the build-time module graph (`CLAUDE.md` non-negotiable 9), `import type` for the
 * types, and the same Zod schema the `/api/v1` route handler parses with.
 */

import type * as CatalogService from '@/modules/catalog/application/company-product-service'
import type { CompanyProductView } from '@/modules/catalog/application/company-product-service'
import type * as MatchingService from '@/modules/matching/application/service-area-service'
import type { ServiceAreaView } from '@/modules/matching/application/service-area-service'
import type * as PortfolioService from '@/modules/portfolio/application/portfolio-service'
import type { PortfolioItemView } from '@/modules/portfolio/application/portfolio-service'
import type { DomainError, Result } from '@/shared/result'

async function companyActor(companyId?: string) {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    companyId === undefined ? {} : { companyId },
  )
}

/**
 * One runner, three modules. The schema and the call are supplied together so the parse and
 * the service can never come from different places.
 */
async function run<T>(
  schema: { safeParse: (value: unknown) => unknown },
  call: (
    actor: Awaited<ReturnType<typeof companyActor>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const { err, validation } = await import('@/shared/result')

  const parsed = schema.safeParse(input) as
    | { success: true; data: { companyId?: string } }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  const actor = await companyActor(parsed.data.companyId)
  return actionResult(await call(actor, parsed.data as never))
}

const catalog = () => import('@/modules/catalog/application/company-product-service')
const matching = () => import('@/modules/matching/application/service-area-service')
const portfolio = () => import('@/modules/portfolio/application/portfolio-service')

/* ── 3.2 · what we sell ───────────────────────────────────────────────────── */

export async function listCompanyProductsAction(
  input: unknown,
): Promise<ActionResult<{ products: CompanyProductView[] }>> {
  const service = await catalog()
  return run(service.listCompanyProductsSchema, (a, d) => service.listCompanyProducts(a, d), input)
}

export async function setCompanyProductAction(
  input: unknown,
): Promise<ActionResult<{ companyProductId: string }>> {
  const service = await catalog()
  return run(service.setCompanyProductSchema, (a, d) => service.setCompanyProduct(a, d), input)
}

export async function setCompanyOptionsAction(
  input: unknown,
): Promise<ActionResult<{ answered: number }>> {
  const service = await catalog()
  return run(service.setCompanyOptionsSchema, (a, d) => service.setCompanyOptions(a, d), input)
}

/* ── 3.6 · where we work ──────────────────────────────────────────────────── */

export async function listServiceAreasAction(
  input: unknown,
): Promise<ActionResult<{ areas: ServiceAreaView[] }>> {
  const service = await matching()
  return run(service.listServiceAreasSchema, (a, d) => service.listServiceAreas(a, d), input)
}

export async function addServiceAreaAction(
  input: unknown,
): Promise<ActionResult<{ serviceAreaId: string; geocodeQueued: boolean }>> {
  const service = await matching()
  return run(service.addServiceAreaSchema, (a, d) => service.addServiceArea(a, d), input)
}

export async function removeServiceAreaAction(
  input: unknown,
): Promise<ActionResult<{ removed: true }>> {
  const service = await matching()
  return run(service.removeServiceAreaSchema, (a, d) => service.removeServiceArea(a, d), input)
}

/* ── 3.7 · what we have built ─────────────────────────────────────────────── */

export async function listPortfolioAction(
  input: unknown,
): Promise<ActionResult<{ items: PortfolioItemView[] }>> {
  const service = await portfolio()
  return run(service.listPortfolioSchema, (a, d) => service.listPortfolio(a, d), input)
}

export async function createPortfolioItemAction(
  input: unknown,
): Promise<ActionResult<{ itemId: string }>> {
  const service = await portfolio()
  return run(service.createPortfolioItemSchema, (a, d) => service.createPortfolioItem(a, d), input)
}

export async function updatePortfolioItemAction(
  input: unknown,
): Promise<ActionResult<{ itemId: string }>> {
  const service = await portfolio()
  return run(service.updatePortfolioItemSchema, (a, d) => service.updatePortfolioItem(a, d), input)
}

export async function deletePortfolioItemAction(
  input: unknown,
): Promise<ActionResult<{ deleted: true }>> {
  const service = await portfolio()
  return run(service.deletePortfolioItemSchema, (a, d) => service.deletePortfolioItem(a, d), input)
}

export async function attachPhotoAction(
  input: unknown,
): Promise<ActionResult<{ photoId: string }>> {
  const service = await portfolio()
  return run(service.attachPhotoSchema, (a, d) => service.attachPhoto(a, d), input)
}

void (undefined as unknown as typeof CatalogService)
void (undefined as unknown as typeof MatchingService)
void (undefined as unknown as typeof PortfolioService)
