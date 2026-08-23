import 'server-only'

import type { ActorContext } from '@/shared/context/actor'
import { prisma } from '@/shared/db'

/**
 * The audit writer — `19-security-and-kvkk.md` §Audit.
 *
 * Infrastructure, not a service: it is never called by a user, it takes no permission and it
 * has no matrix entry. It is a side effect other services perform.
 *
 * **It never throws.** An audit write that fails must not roll back a successful login;
 * the entry is best-effort and its failure is logged. That is a deliberate trade — for the
 * entries `19` calls mandatory (contact disclosure, verification decisions) the write is
 * inside the caller's transaction instead, so it cannot be lost silently.
 */

export type AuditAction =
  // Phase 1 · authentication (`26-execution-plan.md` row 1.9)
  | 'login'
  | 'login_failed'
  | 'password_reset'
  | 'session_revoked'
  // Phase 1 · membership
  | 'company_created'
  | 'member_invited'
  | 'member_joined'
  | 'member_role_changed'
  | 'member_removed'
  // Phase 2 · admin writes (`17-admin-system.md`: every write produces an entry)
  | 'catalog_created'
  | 'catalog_updated'
  | 'catalog_deleted'
  | 'catalog_deactivated'
  | 'setting_changed'
  // Phase 2 · verification decisions (`17` §Manufacturer verification)
  | 'company_verified'
  | 'company_rejected'
  | 'company_documents_requested'
  | 'company_suspended'
  | 'document_reviewed'
  /**
   * Phase 3 · `17` §Manufacturer verification calls document *viewing* a disclosure — these
   * are legal identity documents. Written when a signed URL is issued, because the fetch
   * itself goes straight to storage and never reaches the application.
   */
  | 'document_viewed'
  // Phase 3 · supply side
  | 'company_profile_updated'
  | 'service_area_changed'
  /*
   * Phase 3 · pricing. Publishing is the moment a company's numbers become the ones
   * customers are quoted, and `PRC-02` makes every estimate computed against them permanent —
   * so which version went live, when, and who sent it has to be answerable later.
   */
  | 'price_book_draft_created'
  | 'price_book_published'
  | 'company_products_changed'
  | 'portfolio_changed'
  /**
   * Phase 4 · an anonymous draft changes hands (`10` §Anonymous drafts, task 4.5).
   *
   * Worth an entry because it is the only place in the product where a row's **owner**
   * changes, and because the two questions it will be asked later — "how did this account
   * come to hold this project?" and "was this draft claimed by the visitor who created it?" —
   * are unanswerable from the row afterwards: a successful claim nulls the very key that
   * would have connected them.
   */
  | 'project_claimed'

export type AuditEntry = {
  action: AuditAction
  entityType: string
  entityId: string
  companyId?: string | null
  before?: unknown
  after?: unknown
  reason?: string
}

export async function recordAudit(actor: ActorContext, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        // "anonymous" is a role for audit purposes: a failed login has no user yet, and the
        // row still has to exist.
        actorRole: actor.globalRole ?? 'anonymous',
        companyId: entry.companyId ?? actor.companyId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        before: entry.before === undefined ? undefined : JSON.parse(JSON.stringify(entry.before)),
        after: entry.after === undefined ? undefined : JSON.parse(JSON.stringify(entry.after)),
        reason: entry.reason ?? null,
        // 19 §Audit requires both on every entry. `resolveActor` records "unknown" rather
        // than guessing, so the column is never empty and never invented.
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    })
  } catch (error) {
    console.error('[audit] failed to write entry', entry.action, error)
  }
}
