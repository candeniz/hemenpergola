import 'server-only'

import { prisma } from '@/shared/db'

/**
 * Slug-change bookkeeping — `18` §URLs, task 8.5. An indexed URL is an asset: when a slug
 * changes, the old one must answer with a permanent redirect, never a 404.
 *
 * Two operations, both called inside the transaction that changes the slug:
 *
 *   `recordSlugChange` writes the OLD slug → entityId row (upsert: if the same old slug
 *   is freed twice it still points at one entity), and deletes any redirect row for the
 *   NEW slug — a slug returning to live use must not also redirect somewhere.
 *
 *   `resolveSlugRedirect` is the public page's second lookup: current slug missed →
 *   is this an old slug? The row stores the entityId, not the target slug, so a chain of
 *   renames collapses to one hop (old → id → whatever is current today).
 */

export type SlugEntityType = 'category' | 'product'

// The extended client's transaction parameter — structural, so client extensions keep it assignable.
type Tx = Parameters<Parameters<(typeof prisma)['$transaction']>[0]>[0]

export async function recordSlugChange(
  tx: Tx,
  input: {
    entityType: SlugEntityType
    locale: string
    oldSlug: string
    newSlug: string
    entityId: string
  },
): Promise<void> {
  if (input.oldSlug === input.newSlug) return

  await tx.slugRedirect.upsert({
    where: {
      entityType_locale_oldSlug: {
        entityType: input.entityType,
        locale: input.locale,
        oldSlug: input.oldSlug,
      },
    },
    create: {
      entityType: input.entityType,
      locale: input.locale,
      oldSlug: input.oldSlug,
      entityId: input.entityId,
    },
    update: { entityId: input.entityId },
  })

  // The new slug is live again — it must stop redirecting.
  await tx.slugRedirect.deleteMany({
    where: { entityType: input.entityType, locale: input.locale, oldSlug: input.newSlug },
  })
}

export async function resolveSlugRedirect(
  entityType: SlugEntityType,
  locale: string,
  slug: string,
): Promise<string | null> {
  const row = await prisma.slugRedirect.findUnique({
    where: { entityType_locale_oldSlug: { entityType, locale, oldSlug: slug } },
    select: { entityId: true },
  })
  return row?.entityId ?? null
}
