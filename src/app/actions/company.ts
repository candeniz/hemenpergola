'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

import type {
  AcceptInvitationResult,
  ChangeMemberRoleResult,
  CreateCompanyResult,
  InviteMemberResult,
  MemberSummary,
  RemoveMemberResult,
} from '@/modules/iam/application/company-service'
import type * as Dto from '@/modules/iam/application/dto'
import type { DomainError, Result } from '@/shared/result'

/**
 * Company and membership actions. Same rules as `auth.ts`: `await import()` for every value,
 * `import type` for every type, one Zod schema shared with the route handler.
 *
 * The company these run against comes from `resolveActor`, which reads it from the route —
 * not from the payload. `company-service.ts` says why at length; the short version is that
 * checking a permission against one company and acting on another is the confused-deputy
 * bug, and the only reliable defence is to never have two candidate values.
 */

async function actorFromRequest(companyId?: string) {
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

async function run<K extends keyof typeof Dto, T>(
  schema: K,
  call: (
    actor: Awaited<ReturnType<typeof actorFromRequest>>,
    input: never,
  ) => Promise<Result<T, DomainError>>,
  input: unknown,
): Promise<ActionResult<T>> {
  const [dto, { err, validation }] = await Promise.all([
    import('@/modules/iam/application/dto'),
    import('@/shared/result'),
  ])

  const parsed = (dto[schema] as { safeParse: (value: unknown) => unknown }).safeParse(input) as
    | { success: true; data: { companyId?: string } }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  // The membership is loaded for the company named in the validated payload, and the service
  // then scopes to `actor.companyId`. One value, resolved once, from the same parse.
  const actor = await actorFromRequest(parsed.data.companyId)

  return actionResult(await call(actor, parsed.data as never))
}

export async function createCompanyAction(
  input: unknown,
): Promise<ActionResult<CreateCompanyResult>> {
  return run(
    'createCompanySchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/company-service')).createCompany(actor, data),
    input,
  )
}

export async function listMembersAction(
  input: unknown,
): Promise<ActionResult<{ members: MemberSummary[] }>> {
  return run(
    'listMembersSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/company-service')).listMembers(actor, data),
    input,
  )
}

export async function inviteMemberAction(
  input: unknown,
): Promise<ActionResult<InviteMemberResult>> {
  return run(
    'inviteMemberSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/company-service')).inviteMember(actor, data),
    input,
  )
}

export async function acceptInvitationAction(
  input: unknown,
): Promise<ActionResult<AcceptInvitationResult>> {
  return run(
    'acceptInvitationSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/company-service')).acceptInvitation(actor, data),
    input,
  )
}

export async function changeMemberRoleAction(
  input: unknown,
): Promise<ActionResult<ChangeMemberRoleResult>> {
  return run(
    'changeMemberRoleSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/company-service')).changeMemberRole(actor, data),
    input,
  )
}

export async function removeMemberAction(
  input: unknown,
): Promise<ActionResult<RemoveMemberResult>> {
  return run(
    'removeMemberSchema',
    async (actor, data) =>
      (await import('@/modules/iam/application/company-service')).removeMember(actor, data),
    input,
  )
}
