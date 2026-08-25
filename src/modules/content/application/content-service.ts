import 'server-only'

import {} from 'zod'

import { requireAdmin } from '@/modules/iam/application/authorization'
import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { prisma } from '@/shared/db'
import { err, notFound, ok, validation } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { contentBlocksSchema } from '../domain/blocks'

// Re-exported for app/: pages may not reach into domain (05 §Shape).
// The contract lives in ./dto (extracted in 11.2).
export * from './dto'

import { type ContentPageView, type UpsertContentPageInput } from './dto'

export const upsertContentPage = serviceMethod<
  UpsertContentPageInput,
  { key: string; locale: string }
>('content', 'upsertContentPage', { kind: 'admin' }, async (actor, input) => {
  const allowed = requireAdmin(actor)
  if (!allowed.ok) return err(allowed.error)

  // Belt and braces: the action already parsed with the same schema; parsing again here
  // keeps the guarantee with the service, not with whichever caller remembered. A raw-HTML
  // block — or any type outside the closed union — dies here as VALIDATION, never a row.
  const parsed = contentBlocksSchema.safeParse(input.blocks)
  if (!parsed.success) return err(validation(parsed.error.issues))
  const blocks = parsed.data

  await prisma.contentPage.upsert({
    where: { key_locale: { key: input.key, locale: input.locale } },
    create: {
      key: input.key,
      locale: input.locale,
      title: input.title,
      blocks: blocks as object[],
    },
    update: { title: input.title, blocks: blocks as object[] },
  })

  await recordAudit(actor, {
    action: 'catalog_updated',
    entityType: 'ContentPage',
    entityId: `${input.key}:${input.locale}`,
    after: { title: input.title, blockCount: blocks.length },
  })

  return ok({ key: input.key, locale: input.locale })
})

export const getPublicContentPage = serviceMethod<{ key: string; locale: string }, ContentPageView>(
  'content',
  'getPublicContentPage',
  { kind: 'anonymous', why: 'CMS pages are the public site (07 §Route map, 18)' },
  async (_actor, input) => {
    const row = await prisma.contentPage.findFirst({
      where: { key: input.key, locale: input.locale === 'en' ? 'en' : 'tr' },
      select: { key: true, locale: true, title: true, blocks: true, updatedAt: true },
    })
    if (row === null) return err(notFound('ContentPage'))

    // Parse on the way OUT too: a row planted around the service (a migration, a manual
    // insert) that carries an unknown block type must fail here, not render.
    const blocks = contentBlocksSchema.safeParse(row.blocks)
    if (!blocks.success) return err(notFound('ContentPage'))

    return ok({
      key: row.key,
      locale: row.locale,
      title: row.title,
      blocks: blocks.data,
      updatedAt: row.updatedAt,
    })
  },
)
