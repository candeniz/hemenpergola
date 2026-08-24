'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type { ReviewView } from '@/modules/review/application/review-service'
import type { DomainError, Result } from '@/shared/result'

/**
 * Review server actions — task 7.2. Same construction as `offer.ts`; eligibility,
 * moderation state and the one-review UNIQUE all live in the service.
 */

async function actor(companyId?: string) {
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
    caller: Awaited<ReturnType<typeof actor>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const { err, validation } = await import('@/shared/result')

  const parsed = schema.safeParse(input) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  const companyId =
    typeof input === 'object' && input !== null && 'companyId' in input
      ? (input as { companyId?: unknown }).companyId
      : undefined

  return actionResult(
    await call(
      await actor(typeof companyId === 'string' ? companyId : undefined),
      parsed.data as never,
    ),
  )
}

const reviews = () => import('@/modules/review/application/review-service')

export async function submitReviewAction(input: unknown): Promise<ActionResult<ReviewView>> {
  const service = await reviews()
  return run(service.submitReviewSchema, (a, d) => service.submitReview(a, d), input)
}

export async function getReviewEligibilityAction(
  input: unknown,
): Promise<ActionResult<{ eligible: boolean; reason: string | null; review: ReviewView | null }>> {
  const service = await reviews()
  const { z } = await import('zod')
  return run(
    z.object({ offerRequestId: z.string().min(1) }),
    (a, d) => service.getReviewEligibility(a, d),
    input,
  )
}

export async function respondToReviewAction(
  input: unknown,
): Promise<ActionResult<{ responseId: string }>> {
  const service = await reviews()
  return run(service.respondToReviewSchema, (a, d) => service.respondToReview(a, d), input)
}

export async function listPublishedReviewsAsCompanyAction(
  input: unknown,
): Promise<ActionResult<ReviewView[]>> {
  const service = await reviews()
  const { z } = await import('zod')
  return run(z.object({}).passthrough(), (a) => service.listPublishedReviewsAsCompany(a, {}), input)
}

export async function moderateReviewAction(
  input: unknown,
): Promise<ActionResult<{ reviewId: string; status: 'PUBLISHED' | 'REJECTED' }>> {
  const service = await reviews()
  return run(service.moderateReviewSchema, (a, d) => service.moderateReview(a, d), input)
}
