'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

/**
 * The configurator's server actions — tasks 4.1 to 4.9.
 *
 * Same construction as every other action file: `await import()` for every value so nothing
 * reaches the build-time module graph (`CLAUDE.md` non-negotiable 9), `import type` for types,
 * and the same Zod schema the `/api/v1` route handler parses with.
 *
 * No actor scoping beyond what the service does: authorisation for a project is ownership in
 * the `where` clause, not a permission (`02` §Customer permissions).
 *
 * ## The one thing this file owns that the service cannot
 *
 * **The anonymous draft cookie.** `10` §Anonymous drafts gives a visitor an httpOnly key with
 * a thirty-day TTL, and only a server action or a route handler may set one — `05` §Shape
 * keeps services free of transport concerns, and a page cannot write a cookie at all. So the
 * service reads `actor.anonymousKey` and this file is what puts a value there for a browser
 * that has never had one (`ADR-023`).
 *
 * The minting is deliberately confined to `createProjectAction`. Every other action reads a
 * key that already exists: a browser that acquires a draft cookie without creating a draft has
 * been given a tracking identifier for nothing, and `19` §Retention would then be counting
 * thirty days for a row that does not exist.
 */

import type {
  ClaimResult,
  ListProjectsResult,
  ProjectView,
  ValidateResult,
} from '@/modules/project/application/project-service'
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
  caller?: Awaited<ReturnType<typeof actor>>,
): Promise<ActionResult<T>> {
  const { err, validation } = await import('@/shared/result')

  const parsed = schema.safeParse(input) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: Parameters<typeof validation>[0] } }

  if (!parsed.success) return actionResult(err(validation(parsed.error.issues)))

  return actionResult(await call(caller ?? (await actor()), parsed.data as never))
}

const project = () => import('@/modules/project/application/project-service')

/**
 * Make sure an anonymous caller has a draft key, minting and setting one if not.
 *
 * Returns the actor the service should run as. Three cases, and only the third writes:
 *
 *   signed in            → unchanged. A customer owns rows by `customerId`; a draft cookie
 *                          would be a second identity for the same person.
 *   cookie already there → unchanged. `resolveActor` has already read it.
 *   neither              → mint 32 random bytes, set the cookie, and hand the service an
 *                          actor carrying it.
 *
 * The last case has to override the actor rather than re-resolve it: the cookie was set on
 * the *response*, and the request headers `resolveActor` reads are the ones that arrived
 * without it. Re-resolving would produce the same empty actor and the draft would be created
 * with no owner at all — which `04`'s CHECK constraint rejects, so the failure would at least
 * be loud, but it would be loud in the database rather than here.
 */
async function actorWithDraftCookie(): Promise<Awaited<ReturnType<typeof actor>>> {
  const caller = await actor()

  if (caller.userId !== null || caller.anonymousKey !== null) return caller

  const [{ cookies }, { env }, keys] = await Promise.all([
    import('next/headers'),
    import('@/shared/config/env'),
    import('@/shared/context/anonymous-key'),
  ])

  const secure = env.APP_ENV !== 'local'
  const key = await keys.newAnonymousKey()

  const jar = await cookies()
  jar.set(keys.anonymousCookieName(secure), key, {
    /*
     * `httpOnly` — `10` §Anonymous drafts says so, and the reason is that this value is a
     * bearer credential for whatever drafts it addresses. Script-readable, it would be one
     * XSS away from being someone else's project data; there is also nothing on the client
     * that needs to read it, because every consumer is a server action.
     *
     * `SameSite=Lax` for the same reason the session cookie uses it: the visitor may arrive
     * at their draft through a top-level navigation from a mail client or a shared link, and
     * `Strict` would drop the key exactly then — losing a draft at the moment somebody came
     * back for it.
     */
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: keys.anonymousCookieExpiry(new Date()),
  })

  return { ...caller, anonymousKey: key }
}

/**
 * Start a draft — signed in or not (task 4.5).
 *
 * The cookie is minted here, before the service runs, because the service's `createProject`
 * needs an identity to stamp on the row and `04`'s constraint gives it exactly one chance to
 * get that right.
 */
export async function createProjectAction(
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const service = await project()
  const caller = await actorWithDraftCookie()

  return run(service.createProjectSchema, (a, d) => service.createProject(a, d), input, caller)
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

/**
 * Claim a draft for the account that just signed in — task 4.5.
 *
 * Called by the sign-in and registration forms when they were reached with `?proje=<id>`,
 * which is how the wizard sends an anonymous visitor to the account wall while remembering
 * what they were configuring.
 *
 * The cookie is **not** cleared afterwards. It may address two more drafts (`10` allows
 * three), and deleting it here would strand them: reachable by nobody, removed by nothing
 * until the Phase 9 retention sweep. The row loses its key; the browser keeps its own.
 */
export async function claimProjectAction(input: unknown): Promise<ActionResult<ClaimResult>> {
  const service = await project()
  return run(service.claimProjectSchema, (a, d) => service.claimProject(a, d), input)
}

/** The customer dashboard's list — task 4.8. */
export async function listProjectsAction(
  input: unknown = {},
): Promise<ActionResult<ListProjectsResult>> {
  const service = await project()
  return run(service.listProjectsSchema, (a, d) => service.listProjects(a, d), input)
}

/** "Duplicate project" — task 4.9, `10` §Reuse. Attachments and status do not come along. */
export async function duplicateProjectAction(
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const service = await project()
  return run(service.duplicateProjectSchema, (a, d) => service.duplicateProject(a, d), input)
}

/** Link an uploaded file to the project — task 4.6. The bytes went straight to storage. */
export async function addAttachmentAction(input: unknown): Promise<ActionResult<ProjectView>> {
  const service = await project()
  return run(service.addAttachmentSchema, (a, d) => service.addAttachment(a, d), input)
}

export async function removeAttachmentAction(input: unknown): Promise<ActionResult<ProjectView>> {
  const service = await project()
  return run(service.removeAttachmentSchema, (a, d) => service.removeAttachment(a, d), input)
}
