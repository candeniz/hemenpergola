import 'server-only'

import { prisma } from '@/shared/db'
import { getStorage } from '@/shared/storage'

import { SWEEP_RULES, type SweepRule } from '../domain/retention-policy'

/**
 * `audit.retention_sweep` — task 9.1, the last queue to gain a handler
 * (`WORKED_QUEUES`'s cross-check has been waiting for it). It executes
 * `domain/retention-policy.ts` and NOTHING else: the loop below iterates
 * `SWEEP_RULES`, so the set of tables this job can touch is structurally the policy's
 * set — the unit test proves that set is disjoint from `LEGAL_HOLD_TABLES`.
 *
 * **Dry-run is the default.** `{ dryRun: true }` counts what each rule WOULD affect and
 * writes nothing; the destructive pass is a separate, explicit `{ dryRun: false }` call.
 * A sweeper whose first invocation deletes is a sweeper nobody dares to run.
 *
 * Idempotent (the worker rule): deletes converge on zero matches; the anonymise rule's
 * where-clause excludes already-anonymised rows, so a replay touches nothing.
 *
 * The one side effect outside the database: an expired anonymous draft's uploaded files
 * also leave object storage ("uploaded project photos: with the project", `19`), after
 * the rows are gone — best-effort, because a dangling object is a cost, not a leak.
 */

export type SweepLine = {
  table: SweepRule['table']
  rule: string
  action: SweepRule['action']
  affected: number
}

export type SweepReport = {
  dryRun: boolean
  ranAt: Date
  lines: SweepLine[]
}

async function countFor(rule: SweepRule, now: Date): Promise<number> {
  const where = rule.where(now)
  switch (rule.table) {
    case 'Project':
      return prisma.project.count({ where })
    case 'Notification':
      return prisma.notification.count({ where })
    case 'OfferRequest':
      return prisma.offerRequest.count({ where })
    case 'RateLimitHit':
      return prisma.rateLimitHit.count({ where })
  }
}

async function applyFor(rule: SweepRule, now: Date): Promise<number> {
  const where = rule.where(now)

  switch (rule.table) {
    case 'Project': {
      // The draft's uploads leave with it. Collect keys first, delete rows (the FK
      // cascade takes values/attachments/match runs), then the objects, best-effort.
      const drafts = await prisma.project.findMany({ where, select: { id: true } })
      if (drafts.length === 0) return 0
      const draftIds = drafts.map((draft) => draft.id)

      const files = await prisma.file.findMany({
        where: { ownerType: 'PROJECT', ownerId: { in: draftIds } },
        select: { id: true, key: true },
      })

      const deleted = await prisma.$transaction(async (tx) => {
        await tx.file.deleteMany({ where: { id: { in: files.map((file) => file.id) } } })
        const result = await tx.project.deleteMany({ where: { id: { in: draftIds } } })
        return result.count
      })

      for (const file of files) {
        try {
          await getStorage().deleteObject(file.key)
        } catch (error) {
          console.error(
            '[retention] storage delete failed (kept as cost, not leak)',
            file.key,
            error,
          )
        }
      }
      return deleted
    }
    case 'Notification': {
      const result = await prisma.notification.deleteMany({ where })
      return result.count
    }
    case 'OfferRequest': {
      // ANONYMISE, never delete: ids and status history survive (19 §Retention).
      const result = await prisma.offerRequest.updateMany({
        where,
        data: rule.anonymiseData ?? {},
      })
      return result.count
    }
    case 'RateLimitHit': {
      const result = await prisma.rateLimitHit.deleteMany({ where })
      return result.count
    }
  }
}

export async function runRetentionSweep(options: { dryRun?: boolean } = {}): Promise<SweepReport> {
  const dryRun = options.dryRun ?? true
  const now = new Date()
  const lines: SweepLine[] = []

  for (const rule of SWEEP_RULES) {
    const affected = dryRun ? await countFor(rule, now) : await applyFor(rule, now)
    lines.push({ table: rule.table, rule: rule.rule, action: rule.action, affected })
  }

  return { dryRun, ranAt: now, lines }
}
