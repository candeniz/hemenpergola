'use server'

import { actionResult, type ActionResult } from '@/shared/http/respond'

/**
 * Uploads — `14-file-storage-and-media.md` §Upload flow.
 *
 * Three calls because the flow has three steps: the server validates and presigns, the browser PUTs the bytes straight to storage, and the server is told to process them. The middle step deliberately does not go through the application — `23` §Runtime keeps the web tier stateless and a 10 MB body through a server action is the opposite of that.
 *
 * Same construction as every other action file: `await import()` for every value so nothing
 * reaches the build-time module graph (`CLAUDE.md` non-negotiable 9), `import type` for the
 * types, and the same Zod schema the `/api/v1` route handler parses with.
 */

import type {
  CompleteResult,
  FileUrlResult,
  PresignResult,
} from '@/modules/media/application/file-service'
import type * as Service from '@/modules/media/application/file-service'
import type { DomainError, Result } from '@/shared/result'

type SchemaName = Extract<keyof typeof Service, `${string}Schema`>

async function companyActor(companyId?: string) {
  const [{ headers }, { resolveActor }] = await Promise.all([
    import('next/headers'),
    import('@/shared/context/actor'),
  ])
  const requestHeaders = await headers()

  // Upload ownership is resolved from the owner row, not from the payload.
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
    import('@/modules/media/application/file-service'),
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

const service = () => import('@/modules/media/application/file-service')

export async function presignUploadAction(input: unknown): Promise<ActionResult<PresignResult>> {
  return run('presignUploadSchema', async (a, d) => (await service()).presignUpload(a, d), input)
}

export async function completeUploadAction(input: unknown): Promise<ActionResult<CompleteResult>> {
  return run('completeUploadSchema', async (a, d) => (await service()).completeUpload(a, d), input)
}

export async function fileUrlAction(input: unknown): Promise<ActionResult<FileUrlResult>> {
  return run('fileUrlSchema', async (a, d) => (await service()).fileUrl(a, d), input)
}
