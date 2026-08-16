import 'server-only'

import { recordAudit } from '@/modules/audit/infrastructure/audit-log'
import { requireAdmin } from '@/modules/iam/application/authorization'
import { prisma } from '@/shared/db'
import { conflict, err, notFound, ok, precondition, type DomainError } from '@/shared/result'
import { serviceMethod } from '@/shared/service/registry'

import { attributeChangeImpact, canDeleteOption, validateShowIf } from '../domain/authoring-rules'

import type {
  CreateAttributeInput,
  CreateOptionInput,
  DeactivateOptionInput,
  DeleteAttributeInput,
  DeleteOptionInput,
  UpdateAttributeInput,
  UpdateOptionInput,
} from './dto'

/**
 * Attributes and options — the fields the V1 configurator renders
 * (`10-project-configurator.md` §What V1 builds, `ADR-008`).
 *
 * The rules from `10` §Admin authoring are enforced *here*, at the service, not in the
 * screen. There is no `Project` row in the database yet, so none of them can currently be
 * violated in a way anybody would notice — which is exactly why they go in now. Discovered
 * in Phase 4, "we deleted the option that project referenced" is data loss with no recovery:
 * a `PriceCalculation.breakdown` naming an option that no longer exists cannot be
 * reconstructed.
 */

const LOCALES = ['tr', 'en'] as const

function fromConstraint(error: unknown): DomainError {
  const code = (error as { code?: string } | null)?.code
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target
  const targetText = Array.isArray(target) ? target.join(',') : String(target ?? '')

  if (code === 'P2002') {
    if (targetText.includes('key')) return conflict('attribute key already used on this product')
    if (targetText.includes('value')) return conflict('option value already used on this attribute')
    return conflict('already exists')
  }
  throw error
}

/* ── Attributes ───────────────────────────────────────────────────────────── */

export type AttributeChangeNote = 'safe' | 'new-projects-only'

export type CreateAttributeResult = {
  attributeId: string
  /**
   * What this change does to projects that already exist (`10` §Admin authoring). Returned
   * rather than enforced: adding a required attribute is allowed, it just must not be a
   * surprise.
   */
  impact: AttributeChangeNote
}

export const createAttribute = serviceMethod<CreateAttributeInput, CreateAttributeResult>(
  'catalog',
  'createAttribute',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      include: { attributes: { select: { key: true, showIfAttributeKey: true } } },
    })
    if (product === null) return err(notFound('Product'))

    const showIfProblems = validateShowIf(
      { key: input.key, showIfAttributeKey: input.showIfAttributeKey ?? null },
      product.attributes.map((a) => ({ key: a.key, showIfAttributeKey: a.showIfAttributeKey })),
    )
    if (showIfProblems.length > 0) return err(showIfError(showIfProblems))

    const impact = attributeChangeImpact({
      isRequired: input.isRequired,
      wasRequired: false,
      isNew: true,
    })

    try {
      const attribute = await prisma.productAttribute.create({
        data: {
          productId: input.productId,
          key: input.key,
          inputType: input.inputType,
          unit: input.unit ?? null,
          min: input.min ?? null,
          max: input.max ?? null,
          step: input.step ?? null,
          isRequired: input.isRequired,
          affectsPrice: input.affectsPrice,
          sortOrder: input.sortOrder,
          showIfAttributeKey: input.showIfAttributeKey ?? null,
          showIfValue: input.showIfValue ?? null,
          translations: {
            create: LOCALES.map((locale) => ({
              locale,
              label: input.translations[locale].label,
              helpText: input.translations[locale].helpText ?? null,
            })),
          },
        },
      })

      await recordAudit(actor, {
        action: 'catalog_created',
        entityType: 'ProductAttribute',
        entityId: attribute.id,
        after: {
          productId: input.productId,
          key: input.key,
          inputType: input.inputType,
          isRequired: input.isRequired,
          impact: impact.kind,
        },
        // The impact is the reason a reader of the log would care about this row.
        reason:
          impact.kind === 'safe' ? undefined : 'required attribute — applies to new projects only',
      })

      return ok({ attributeId: attribute.id, impact: impact.kind })
    } catch (error) {
      return err(fromConstraint(error))
    }
  },
)

function showIfError(problems: ReturnType<typeof validateShowIf>): DomainError {
  const first = problems[0]
  if (first === undefined) return precondition('showIf is invalid')

  switch (first.kind) {
    case 'unknown-key':
      return precondition(`showIfAttributeKey "${first.key}" is not an attribute of this product`)
    case 'self-reference':
      return precondition('an attribute cannot be conditional on itself')
    case 'would-chain':
      // `ADR-008` allows one level. Two is a dependency graph, and a graph needs cycle
      // detection and evaluation order — the rules engine, built by accident.
      return precondition(`showIf chains are not supported: ${first.because}`)
  }
}

export const updateAttribute = serviceMethod<UpdateAttributeInput, CreateAttributeResult>(
  'catalog',
  'updateAttribute',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.productAttribute.findUnique({
      where: { id: input.attributeId },
      include: { translations: true },
    })
    if (before === null) return err(notFound('ProductAttribute'))

    const siblings = await prisma.productAttribute.findMany({
      where: { productId: before.productId, id: { not: before.id } },
      select: { key: true, showIfAttributeKey: true },
    })

    const showIfProblems = validateShowIf(
      {
        key: input.key ?? before.key,
        showIfAttributeKey:
          input.showIfAttributeKey === undefined
            ? before.showIfAttributeKey
            : input.showIfAttributeKey,
      },
      siblings,
    )
    if (showIfProblems.length > 0) return err(showIfError(showIfProblems))

    const impact = attributeChangeImpact({
      isRequired: input.isRequired,
      wasRequired: before.isRequired,
      isNew: false,
    })

    try {
      await prisma.$transaction(async (tx) => {
        await tx.productAttribute.update({
          where: { id: input.attributeId },
          data: {
            ...(input.key === undefined ? {} : { key: input.key }),
            ...(input.inputType === undefined ? {} : { inputType: input.inputType }),
            unit: input.unit ?? null,
            min: input.min ?? null,
            max: input.max ?? null,
            step: input.step ?? null,
            isRequired: input.isRequired,
            affectsPrice: input.affectsPrice,
            sortOrder: input.sortOrder,
            showIfAttributeKey: input.showIfAttributeKey ?? null,
            showIfValue: input.showIfValue ?? null,
          },
        })

        for (const locale of LOCALES) {
          const translation = input.translations?.[locale]
          if (translation === undefined) continue

          await tx.productAttributeTranslation.upsert({
            where: { attributeId_locale: { attributeId: input.attributeId, locale } },
            create: {
              attributeId: input.attributeId,
              locale,
              label: translation.label,
              helpText: translation.helpText ?? null,
            },
            update: { label: translation.label, helpText: translation.helpText ?? null },
          })
        }
      })
    } catch (error) {
      return err(fromConstraint(error))
    }

    await recordAudit(actor, {
      action: 'catalog_updated',
      entityType: 'ProductAttribute',
      entityId: input.attributeId,
      before: {
        key: before.key,
        inputType: before.inputType,
        isRequired: before.isRequired,
        affectsPrice: before.affectsPrice,
        showIfAttributeKey: before.showIfAttributeKey,
      },
      after: {
        key: input.key ?? before.key,
        inputType: input.inputType ?? before.inputType,
        isRequired: input.isRequired,
        affectsPrice: input.affectsPrice,
        showIfAttributeKey: input.showIfAttributeKey ?? null,
        impact: impact.kind,
      },
      reason: impact.kind === 'safe' ? undefined : 'became required — applies to new projects only',
    })

    return ok({ attributeId: input.attributeId, impact: impact.kind })
  },
)

/**
 * Delete an attribute.
 *
 * Refused while any of its options is referenced, for the same reason an option is: the
 * cascade would take the options with it. Nothing references anything yet — see the note at
 * the top of this file for why that is not a reason to skip the check.
 */
export const deleteAttribute = serviceMethod<DeleteAttributeInput, { deleted: true }>(
  'catalog',
  'deleteAttribute',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const attribute = await prisma.productAttribute.findUnique({
      where: { id: input.attributeId },
      include: { options: { select: { id: true } } },
    })
    if (attribute === null) return err(notFound('ProductAttribute'))

    for (const option of attribute.options) {
      const counts = await referenceCounts(option.id)
      const verdict = canDeleteOption(counts)
      if (!verdict.allowed) {
        return err(
          precondition(
            `option ${option.id} is referenced by ${counts.projectValues} project values and ${counts.priceBookEntries} price-book entries; deactivate the attribute instead`,
          ),
        )
      }
    }

    // Anything depending on this key would silently become always-hidden.
    const dependent = await prisma.productAttribute.findFirst({
      where: { productId: attribute.productId, showIfAttributeKey: attribute.key },
      select: { key: true },
    })
    if (dependent !== null) {
      return err(precondition(`${dependent.key} is conditional on ${attribute.key}`))
    }

    await prisma.productAttribute.delete({ where: { id: input.attributeId } })

    await recordAudit(actor, {
      action: 'catalog_deleted',
      entityType: 'ProductAttribute',
      entityId: input.attributeId,
      before: { key: attribute.key, productId: attribute.productId },
    })

    return ok({ deleted: true } as const)
  },
)

/* ── Options ──────────────────────────────────────────────────────────────── */

/**
 * How many rows point at this option.
 *
 * Both tables arrive in later phases — `PriceBookOptionPrice` in Phase 3,
 * `ProjectAttributeValue` in Phase 4 — so both counts are zero today and the queries are
 * written against `information_schema` rather than against a Prisma model that does not
 * exist yet.
 *
 * That indirection is deliberate and temporary: it means the guard is *already correct* when
 * those tables land, instead of being a `TODO` that has to be found. The counts become real
 * the moment the tables do, with no change here.
 */
async function referenceCounts(optionId: string) {
  const projectValues = await countReferences('ProjectAttributeValue', 'optionId', optionId)
  const priceBookEntries = await countReferences('PriceBookOptionPrice', 'optionId', optionId)
  return { projectValues, priceBookEntries }
}

async function countReferences(table: string, column: string, value: string): Promise<number> {
  const exists = await prisma.$queryRaw<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    ) AS present
  `
  if (exists[0]?.present !== true) return 0

  // The table name cannot be parameterised; it is one of two literals above, never input.
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "${table}" WHERE "${column}" = $1`,
    value,
  )
  return Number(rows[0]?.count ?? 0)
}

export const createOption = serviceMethod<CreateOptionInput, { optionId: string }>(
  'catalog',
  'createOption',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const attribute = await prisma.productAttribute.findUnique({
      where: { id: input.attributeId },
    })
    if (attribute === null) return err(notFound('ProductAttribute'))

    // Options only mean something on a choice field. A `NUMBER` with options is an authoring
    // mistake that renders as nothing and is very hard to see on the screen.
    if (attribute.inputType !== 'SELECT' && attribute.inputType !== 'MULTISELECT') {
      return err(
        precondition(`options belong to SELECT or MULTISELECT, not ${attribute.inputType}`),
      )
    }

    try {
      const option = await prisma.productOption.create({
        data: {
          attributeId: input.attributeId,
          value: input.value,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          translations: {
            create: LOCALES.map((locale) => ({
              locale,
              label: input.translations[locale].label,
            })),
          },
        },
      })

      await recordAudit(actor, {
        action: 'catalog_created',
        entityType: 'ProductOption',
        entityId: option.id,
        after: { attributeId: input.attributeId, value: input.value, isActive: input.isActive },
      })

      return ok({ optionId: option.id })
    } catch (error) {
      return err(fromConstraint(error))
    }
  },
)

export const updateOption = serviceMethod<UpdateOptionInput, { optionId: string }>(
  'catalog',
  'updateOption',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.productOption.findUnique({ where: { id: input.optionId } })
    if (before === null) return err(notFound('ProductOption'))

    await prisma.$transaction(async (tx) => {
      await tx.productOption.update({
        where: { id: input.optionId },
        data: {
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      })

      for (const locale of LOCALES) {
        const translation = input.translations?.[locale]
        if (translation === undefined) continue

        await tx.productOptionTranslation.upsert({
          where: { optionId_locale: { optionId: input.optionId, locale } },
          create: { optionId: input.optionId, locale, label: translation.label },
          update: { label: translation.label },
        })
      }
    })

    await recordAudit(actor, {
      action: 'catalog_updated',
      entityType: 'ProductOption',
      entityId: input.optionId,
      before: { isActive: before.isActive, sortOrder: before.sortOrder },
      after: {
        isActive: input.isActive ?? before.isActive,
        sortOrder: input.sortOrder ?? before.sortOrder,
      },
    })

    return ok({ optionId: input.optionId })
  },
)

/**
 * Deactivate an option — the action the screen offers, and the one `10` §Admin authoring
 * asks for: *"hidden from new projects; existing `ProjectAttributeValue` rows keep
 * referencing it and still render"*.
 */
export const deactivateOption = serviceMethod<DeactivateOptionInput, { optionId: string }>(
  'catalog',
  'deactivateOption',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const before = await prisma.productOption.findUnique({ where: { id: input.optionId } })
    if (before === null) return err(notFound('ProductOption'))

    await prisma.productOption.update({
      where: { id: input.optionId },
      data: { isActive: false },
    })

    await recordAudit(actor, {
      action: 'catalog_deactivated',
      entityType: 'ProductOption',
      entityId: input.optionId,
      before: { isActive: before.isActive },
      after: { isActive: false },
    })

    return ok({ optionId: input.optionId })
  },
)

/**
 * Delete an option — **refused the moment anything references it** (`10` §Admin authoring:
 * *"Never delete a `ProductOption` that has been referenced. Deactivate."*).
 *
 * This exists only for the option an admin creates, mistypes, and removes before anyone has
 * seen it. Everything else is a deactivation.
 */
export const deleteOption = serviceMethod<DeleteOptionInput, { deleted: true }>(
  'catalog',
  'deleteOption',
  { kind: 'admin' },
  async (actor, input) => {
    const allowed = requireAdmin(actor)
    if (!allowed.ok) return err(allowed.error)

    const option = await prisma.productOption.findUnique({ where: { id: input.optionId } })
    if (option === null) return err(notFound('ProductOption'))

    const counts = await referenceCounts(input.optionId)
    const verdict = canDeleteOption(counts)

    if (!verdict.allowed) {
      return err(
        precondition(
          `option is referenced by ${counts.projectValues} project values and ${counts.priceBookEntries} price-book entries; deactivate it instead`,
        ),
      )
    }

    await prisma.productOption.delete({ where: { id: input.optionId } })

    await recordAudit(actor, {
      action: 'catalog_deleted',
      entityType: 'ProductOption',
      entityId: input.optionId,
      before: { attributeId: option.attributeId, value: option.value },
    })

    return ok({ deleted: true } as const)
  },
)

export const attributeService = {
  createAttribute,
  updateAttribute,
  deleteAttribute,
  createOption,
  updateOption,
  deactivateOption,
  deleteOption,
} satisfies Record<string, { meta: unknown }>
