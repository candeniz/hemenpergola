'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

/**
 * Company profile, contact and documents — task 3.1.
 *
 * The company comes from the validated payload and is what `resolveActor` loads the membership for; the service then scopes to `actor.companyId`, so a payload cannot name a different company than the one the permission was checked against.
 *
 * Same construction as every other action file: `await import()` for every value so nothing
 * reaches the build-time module graph (`CLAUDE.md` non-negotiable 9), `import type` for the
 * types, and the same Zod schema the `/api/v1` route handler parses with.
 */

import type * as Service from '@/modules/iam/application/company-profile-service'
import type { CompanyProfileView } from '@/modules/iam/application/company-profile-service'
import type { DomainError, Result } from '@/shared/result'

type SchemaName = Extract<keyof typeof Service, `${string}Schema`>

async function companyActor(companyId?: string) {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  // One resolved company, from one parse.
  return resolveActor(
    { headers: { get: (name: string) => requestHeaders.get(name) } },
    companyId === undefined ? {} : { companyId },
  )
}

async function run<T>(
  schema: SchemaName,
  call: (
    actor: Awaited<ReturnType<typeof companyActor>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const [service, { err, validation }] = await Promise.all([
    import('@/modules/iam/application/company-profile-service'),
    import('@/shared/result'),
  ])

  const parsed = (service[schema] as { safeParse: (value: unknown) => unknown }).safeParse(
    input,
  ) as
    | { success: true; data: { companyId?: string } }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  const actor = await companyActor(parsed.data.companyId)
  return actionResult(await call(actor, parsed.data as never))
}

const service = () => import('@/modules/iam/application/company-profile-service')

export async function getCompanyProfileAction(
  input: unknown,
): Promise<ActionResult<CompanyProfileView>> {
  return run(
    'getCompanyProfileSchema',
    async (a, d) => (await service()).getCompanyProfile(a, d),
    input,
  )
}

export async function updateCompanyProfileAction(
  input: unknown,
): Promise<ActionResult<{ companyId: string }>> {
  return run(
    'updateCompanyProfileSchema',
    async (a, d) => (await service()).updateCompanyProfile(a, d),
    input,
  )
}

export async function updateCompanySlugAction(
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  return run(
    'updateCompanySlugSchema',
    async (a, d) => (await service()).updateCompanySlug(a, d),
    input,
  )
}

export async function updateCompanyContactAction(
  input: unknown,
): Promise<ActionResult<{ companyId: string }>> {
  return run(
    'updateCompanyContactSchema',
    async (a, d) => (await service()).updateCompanyContact(a, d),
    input,
  )
}

export async function attachDocumentAction(
  input: unknown,
): Promise<ActionResult<{ documentId: string }>> {
  return run('attachDocumentSchema', async (a, d) => (await service()).attachDocument(a, d), input)
}
