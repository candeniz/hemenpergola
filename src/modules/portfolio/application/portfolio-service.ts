import 'server-only'

import { z } from 'zod'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { authorize } from '@/modules/iam/application/authorization'
import { PERMISSIONS } from '@/modules/iam/domain/permissions'
import { prisma } from '@/shared/db'
import { err, notFound, ok, precondition } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'
import { getStorage } from '@/shared/storage'

/**
 * The company portfolio — task 3.7, `manufacturer_portfolio_management`.
 *
 * ## Why this is its own module
 *
 * `05` §Shape does not place it, so here is the reasoning rather than a shrug.
 *
 * It is not `iam/`: that module is identity and access — accounts, memberships, verification
 * — and a photo gallery has nothing to do with either. Letting it in is how an "iam" module
 * ends up containing everything that happens to hang off `Company`.
 *
 * It is not `catalog/`: the catalogue is what the *platform* sells, every method in it is
 * `admin`, and portfolio items are what a *company* has built.
 *
 * It is not `matching/`, even though `09` §Scoring reads portfolio depth as five points out
 * of a hundred. Matching reads reviews, price books and service areas too; owning a table
 * because you read it is how a module becomes everything.
 *
 * So: its own bounded context — company showcase content and the media attached to it — with
 * two readers arriving later (the public company profile in Phase 8, the score in Phase 5)
 * and one writer. It costs a directory, which is the same price `notification/` and `audit/`
 * already paid for being small and clearly about one thing.
 */

export const listPortfolioSchema = z.object({ companyId: z.string().min(1) })
export type ListPortfolioInput = z.infer<typeof listPortfolioSchema>

export const createPortfolioItemSchema = z.object({
  companyId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional(),
  productId: z.string().min(1).optional(),
  cityId: z.string().min(1).optional(),
  completedAt: z.iso.date().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
})
export type CreatePortfolioItemInput = z.infer<typeof createPortfolioItemSchema>

export const updatePortfolioItemSchema = z.object({
  companyId: z.string().min(1),
  itemId: z.string().min(1),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  productId: z.string().min(1).nullable().optional(),
  cityId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})
export type UpdatePortfolioItemInput = z.infer<typeof updatePortfolioItemSchema>

export const deletePortfolioItemSchema = z.object({
  companyId: z.string().min(1),
  itemId: z.string().min(1),
})
export type DeletePortfolioItemInput = z.infer<typeof deletePortfolioItemSchema>

export const attachPhotoSchema = z.object({
  companyId: z.string().min(1),
  itemId: z.string().min(1),
  fileId: z.string().min(1),
  sortOrder: z.number().int().min(0).max(999).default(0),
})
export type AttachPhotoInput = z.infer<typeof attachPhotoSchema>

export type PortfolioPhotoView = {
  photoId: string
  fileId: string
  sortOrder: number
  scanStatus: string
  /** Public URL — a portfolio photo is CDN-served, unsigned (`14` §Access control). */
  url: string | null
  variants: { name: string; url: string; width: number }[]
}

export type PortfolioItemView = {
  itemId: string
  title: string
  description: string | null
  productId: string | null
  cityId: string | null
  completedAt: Date | null
  sortOrder: number
  photos: PortfolioPhotoView[]
}

export const listPortfolio = serviceMethod<ListPortfolioInput, { items: PortfolioItemView[] }>(
  'portfolio',
  'listPortfolio',
  { kind: 'permission', permission: PERMISSIONS.PRICE_BOOK_READ },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PRICE_BOOK_READ)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const items = await prisma.portfolioItem.findMany({
      where: { companyId },
      include: {
        photos: {
          orderBy: { sortOrder: 'asc' },
          include: { file: { include: { variants: true } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })

    const storage = getStorage()

    const views: PortfolioItemView[] = []
    for (const item of items) {
      const photos: PortfolioPhotoView[] = []

      for (const photo of item.photos) {
        /*
         * `14` §Virus scanning: not served to anyone but the uploader until `CLEAN`. On this
         * screen the viewer *is* the company, but the URL rendered here is the public CDN
         * one — so a not-yet-clean photo gets no URL at all rather than a public one.
         */
        const servable = photo.file.virusScanStatus === 'CLEAN'

        photos.push({
          photoId: photo.id,
          fileId: photo.fileId,
          sortOrder: photo.sortOrder,
          scanStatus: photo.file.virusScanStatus,
          url: servable ? await storage.readUrl(photo.file.key, 'public') : null,
          variants: servable
            ? await Promise.all(
                photo.file.variants
                  .sort((a, b) => a.width - b.width)
                  .map(async (variant) => ({
                    name: variant.name,
                    url: await storage.readUrl(variant.key, 'public'),
                    width: variant.width,
                  })),
              )
            : [],
        })
      }

      views.push({
        itemId: item.id,
        title: item.title,
        description: item.description,
        productId: item.productId,
        cityId: item.cityId,
        completedAt: item.completedAt,
        sortOrder: item.sortOrder,
        photos,
      })
    }

    return ok({ items: views })
  },
)

export const createPortfolioItem = serviceMethod<CreatePortfolioItemInput, { itemId: string }>(
  'portfolio',
  'createPortfolioItem',
  { kind: 'permission', permission: PERMISSIONS.PORTFOLIO_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PORTFOLIO_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const item = await prisma.portfolioItem.create({
      data: {
        companyId,
        title: input.title,
        description: input.description ?? null,
        productId: input.productId ?? null,
        cityId: input.cityId ?? null,
        completedAt: input.completedAt === undefined ? null : new Date(input.completedAt),
        sortOrder: input.sortOrder,
      },
    })

    await recordAudit(actor, {
      action: 'portfolio_changed',
      entityType: 'PortfolioItem',
      entityId: item.id,
      companyId,
      after: { title: input.title, productId: input.productId ?? null },
    })

    return ok({ itemId: item.id })
  },
)

export const updatePortfolioItem = serviceMethod<UpdatePortfolioItemInput, { itemId: string }>(
  'portfolio',
  'updatePortfolioItem',
  { kind: 'permission', permission: PERMISSIONS.PORTFOLIO_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PORTFOLIO_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const updated = await prisma.portfolioItem.updateMany({
      where: { id: input.itemId, companyId },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.productId === undefined ? {} : { productId: input.productId }),
        ...(input.cityId === undefined ? {} : { cityId: input.cityId }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      },
    })

    if (updated.count === 0) return err(notFound('PortfolioItem'))

    await recordAudit(actor, {
      action: 'portfolio_changed',
      entityType: 'PortfolioItem',
      entityId: input.itemId,
      companyId,
      after: { title: input.title ?? null },
    })

    return ok({ itemId: input.itemId })
  },
)

/**
 * Delete an item.
 *
 * `14` §Retention: deleting the owner **marks files for deletion**; a nightly job removes
 * the objects after a seven-day grace period. That job is Phase 9, so the rows go and the
 * objects stay — which is the correct half to build first. The reverse (delete the objects
 * now, sweep the rows later) is unrecoverable, and `14` is explicit that a storage object is
 * never removed without a corresponding `File` transition.
 */
export const deletePortfolioItem = serviceMethod<DeletePortfolioItemInput, { deleted: true }>(
  'portfolio',
  'deletePortfolioItem',
  { kind: 'permission', permission: PERMISSIONS.PORTFOLIO_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PORTFOLIO_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const item = await prisma.portfolioItem.findFirst({
      where: { id: input.itemId, companyId },
      include: { photos: { select: { fileId: true } } },
    })
    if (item === null) return err(notFound('PortfolioItem'))

    await prisma.portfolioItem.delete({ where: { id: item.id } })

    await recordAudit(actor, {
      action: 'portfolio_changed',
      entityType: 'PortfolioItem',
      entityId: input.itemId,
      companyId,
      before: { title: item.title, photos: item.photos.length },
      after: { deleted: true },
      reason: 'files marked for the retention sweep, objects retained for 7 days',
    })

    return ok({ deleted: true } as const)
  },
)

export const attachPhoto = serviceMethod<AttachPhotoInput, { photoId: string }>(
  'portfolio',
  'attachPhoto',
  { kind: 'permission', permission: PERMISSIONS.PORTFOLIO_MANAGE },
  async (actor, input) => {
    const allowed = authorize(actor, PERMISSIONS.PORTFOLIO_MANAGE)
    if (!allowed.ok) return err(allowed.error)

    const companyId = actor.companyId ?? input.companyId

    const item = await prisma.portfolioItem.findFirst({
      where: { id: input.itemId, companyId },
    })
    if (item === null) return err(notFound('PortfolioItem'))

    const file = await prisma.file.findUnique({ where: { id: input.fileId } })
    if (file === null) return err(notFound('File'))

    /*
     * The file must have been uploaded *as a portfolio photo for this item*. Without the
     * check a company could attach a file whose key is under `private/` — and the row would
     * then serve a private object through a public CDN URL, which is precisely the confusion
     * putting the access class in the key was meant to prevent.
     */
    if (file.ownerType !== 'PORTFOLIO' || file.ownerId !== input.itemId) {
      return err(precondition('that file was not uploaded as a photo for this item'))
    }

    const photo = await prisma.portfolioPhoto.upsert({
      where: { portfolioItemId_fileId: { portfolioItemId: input.itemId, fileId: input.fileId } },
      create: { portfolioItemId: input.itemId, fileId: input.fileId, sortOrder: input.sortOrder },
      update: { sortOrder: input.sortOrder },
    })

    await recordAudit(actor, {
      action: 'portfolio_changed',
      entityType: 'PortfolioPhoto',
      entityId: photo.id,
      companyId,
      after: { itemId: input.itemId, fileId: input.fileId },
    })

    return ok({ photoId: photo.id })
  },
)

export const portfolioService = {
  listPortfolio,
  createPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
  attachPhoto,
} satisfies Record<string, { meta: unknown }>
