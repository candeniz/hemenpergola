'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

/**
 * Price books and the simulator — tasks 3.3 and 3.5.
 *
 * Same construction as every other action file: `await import()` for every value so nothing
 * reaches the build-time module graph (`CLAUDE.md` non-negotiable 9), `import type` for the
 * types, and the same Zod schema the `/api/v1` route handler parses with.
 */

import type {
  PriceBookDetail,
  PriceBookSummary,
} from '@/modules/pricing/application/price-book-service'
import type { SimulateResult } from '@/modules/pricing/application/simulate-service'
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

const pricing = () => import('@/modules/pricing/application/price-book-service')
const simulator = () => import('@/modules/pricing/application/simulate-service')

export async function listPriceBooksAction(
  input: unknown,
): Promise<ActionResult<{ books: PriceBookSummary[] }>> {
  const service = await pricing()
  return run(service.listPriceBooksSchema, (a, d) => service.listPriceBooks(a, d), input)
}

export async function getPriceBookAction(input: unknown): Promise<ActionResult<PriceBookDetail>> {
  const service = await pricing()
  return run(service.getPriceBookSchema, (a, d) => service.getPriceBook(a, d), input)
}

export async function createDraftAction(
  input: unknown,
): Promise<ActionResult<{ priceBookId: string; version: number }>> {
  const service = await pricing()
  return run(service.createDraftSchema, (a, d) => service.createDraft(a, d), input)
}

export async function savePriceBookAction(
  input: unknown,
): Promise<ActionResult<{ priceBookId: string }>> {
  const service = await pricing()
  return run(service.savePriceBookSchema, (a, d) => service.savePriceBook(a, d), input)
}

export async function publishPriceBookAction(
  input: unknown,
): Promise<ActionResult<{ priceBookId: string; version: number; archivedVersion: number | null }>> {
  const service = await pricing()
  return run(service.publishPriceBookSchema, (a, d) => service.publishPriceBook(a, d), input)
}

export async function simulateAction(input: unknown): Promise<ActionResult<SimulateResult>> {
  const service = await simulator()
  return run(service.simulateSchema, (a, d) => service.simulatePriceBook(a, d), input)
}
