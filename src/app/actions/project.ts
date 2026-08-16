'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

/**
 * The configurator's server actions — tasks 4.1 to 4.4 and 4.7.
 *
 * Same construction as every other action file: `await import()` for every value so nothing
 * reaches the build-time module graph (`CLAUDE.md` non-negotiable 9), `import type` for types,
 * and the same Zod schema the `/api/v1` route handler parses with.
 *
 * No actor scoping beyond what the service does: authorisation for a project is ownership in
 * the `where` clause, not a permission (`02` §Customer permissions).
 */

import type { ProjectView, ValidateResult } from '@/modules/project/application/project-service'
import type { DomainError, Result } from '@/shared/result'

async function actor() {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  return resolveActor({ headers: { get: (name: string) => requestHeaders.get(name) } })
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

  return actionResult(await call(await actor(), parsed.data as never))
}

const project = () => import('@/modules/project/application/project-service')

export async function createProjectAction(
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const service = await project()
  return run(service.createProjectSchema, (a, d) => service.createProject(a, d), input)
}

export async function getProjectAction(input: unknown): Promise<ActionResult<ProjectView>> {
  const service = await project()
  return run(service.getProjectSchema, (a, d) => service.getProject(a, d), input)
}

/**
 * One step, written immediately (`10` §Step structure). "Save draft" calls nothing else — the
 * draft is already saved, and the button exists to reassure and to exit.
 */
export async function patchStepAction(input: unknown): Promise<ActionResult<ProjectView>> {
  const service = await project()
  return run(service.patchStepSchema, (a, d) => service.patchStep(a, d), input)
}

export async function validateProjectAction(input: unknown): Promise<ActionResult<ValidateResult>> {
  const service = await project()
  return run(service.validateProjectSchema, (a, d) => service.validateProject(a, d), input)
}
