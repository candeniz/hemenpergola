'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type {
  CompanyDetail,
  DecisionResult,
  QueueEntry,
  ReviewDocumentResult,
} from '@/modules/iam/application/verification-service'
import type * as VerificationDto from '@/modules/iam/application/verification-service'
import type { DomainError, Result } from '@/shared/result'

/**
 * Verification actions (task 2.4). Same construction as the other action files:
 * `await import()` for every value, `import type` for the types, one Zod schema shared with
 * `/api/v1/admin/verification/*` (`CLAUDE.md` non-negotiable 9, `05` §Two entry points).
 */

type SchemaName = Extract<keyof typeof VerificationDto, `${string}Schema`>

async function adminActor() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })
}

async function run<T>(
  schema: SchemaName,
  call: (
    actor: Awaited<ReturnType<typeof adminActor>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const [service, { err, validation }] = await Promise.all([
    import('@/modules/iam/application/verification-service'),
    import('@/shared/result'),
  ])

  const parsed = (service[schema] as { safeParse: (value: unknown) => unknown }).safeParse(
    input,
  ) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await call(await adminActor(), parsed.data as never))
}

const service = () => import('@/modules/iam/application/verification-service')

export async function listVerificationQueueAction(
  input: unknown = {},
): Promise<ActionResult<{ companies: QueueEntry[] }>> {
  return run(
    'listVerificationQueueSchema',
    async (a, d) => (await service()).listVerificationQueue(a, d),
    input,
  )
}

export async function getCompanyForVerificationAction(
  input: unknown,
): Promise<ActionResult<{ company: CompanyDetail }>> {
  return run(
    'getCompanyForVerificationSchema',
    async (a, d) => (await service()).getCompanyForVerification(a, d),
    input,
  )
}

export async function verifyCompanyAction(input: unknown): Promise<ActionResult<DecisionResult>> {
  return run('verifyCompanySchema', async (a, d) => (await service()).verifyCompany(a, d), input)
}

export async function rejectCompanyAction(input: unknown): Promise<ActionResult<DecisionResult>> {
  return run('rejectCompanySchema', async (a, d) => (await service()).rejectCompany(a, d), input)
}

export async function requestDocumentsAction(
  input: unknown,
): Promise<ActionResult<DecisionResult>> {
  return run(
    'requestDocumentsSchema',
    async (a, d) => (await service()).requestDocuments(a, d),
    input,
  )
}

export async function suspendCompanyAction(input: unknown): Promise<ActionResult<DecisionResult>> {
  return run('suspendCompanySchema', async (a, d) => (await service()).suspendCompany(a, d), input)
}

export async function reviewDocumentAction(
  input: unknown,
): Promise<ActionResult<ReviewDocumentResult>> {
  return run('reviewDocumentSchema', async (a, d) => (await service()).reviewDocument(a, d), input)
}
