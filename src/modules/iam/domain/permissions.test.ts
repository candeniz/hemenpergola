import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  ALL_PERMISSIONS,
  canAssignRole,
  canRevokeRole,
  companyMemberCan,
  COMPANY_ROLES,
  PERMISSIONS,
  PERMISSION_KIND,
  permissionLabel,
  roleHasPermission,
  ROLE_PERMISSIONS,
  statusAllowsPermission,
} from './permissions'

/** `02-user-roles-and-permissions.md` §Permission catalogue — task 1.1. */

const DOC = fileURLToPath(
  new URL('../../../../Yazılım Mimari Promptlar/02-user-roles-and-permissions.md', import.meta.url),
)

describe('the catalogue is the single source of truth', () => {
  it('generates the table in 02, which has not been hand-edited since', () => {
    /*
     * `02` says the table "must be regenerated from it, never hand-edited to diverge".
     * This is what makes that true rather than aspirational: every permission must appear
     * in the generated block with the ticks the code produces.
     *
     * Regenerate with: pnpm exec tsx scripts/generate-permission-table.mjs
     */
    const document = readFileSync(DOC, 'utf8')
    const begin = document.indexOf('<!-- BEGIN GENERATED PERMISSION TABLE -->')
    const end = document.indexOf('<!-- END GENERATED PERMISSION TABLE -->')

    expect(begin, 'generated block missing from 02').toBeGreaterThan(-1)
    const block = document.slice(begin, end)

    for (const permission of ALL_PERMISSIONS) {
      const label = permissionLabel(permission)
      const row = block.split('\n').find((line) => line.startsWith(`| \`${label}\` |`))

      expect(row, `no row for ${label} in 02`).toBeDefined()
      if (row === undefined) continue

      const cells = row
        .split('|')
        .slice(2, 2 + COMPANY_ROLES.length)
        .map((cell) => cell.trim())

      COMPANY_ROLES.forEach((role, index) => {
        const documented = cells[index]?.startsWith('✓') ?? false
        expect(documented, `${label} × ${role} disagrees with the code`).toBe(
          roleHasPermission(role, permission),
        )
      })
    }
  })

  it('has no duplicate permission strings', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length)
  })

  it('namespaces every permission as company-scoped', () => {
    // The prefix is not decoration: it says the permission is meaningless without a
    // `companyId` in the actor context.
    for (const permission of ALL_PERMISSIONS) {
      expect(permission.startsWith('company:')).toBe(true)
    }
  })

  it('classifies every permission for the status gate', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(PERMISSION_KIND[permission], permission).toBeDefined()
    }
  })
})

describe('role → permission', () => {
  it('gives OWNER everything', () => {
    expect([...ROLE_PERMISSIONS.OWNER].sort()).toEqual([...ALL_PERMISSIONS].sort())
  })

  it('withholds company.delete from ADMIN — 02 §Company-scoped roles', () => {
    expect(roleHasPermission('ADMIN', PERMISSIONS.COMPANY_DELETE)).toBe(false)
    expect(roleHasPermission('OWNER', PERMISSIONS.COMPANY_DELETE)).toBe(true)
  })

  it('withholds price books and member management from SALES', () => {
    expect(roleHasPermission('SALES', PERMISSIONS.PRICE_BOOK_WRITE)).toBe(false)
    expect(roleHasPermission('SALES', PERMISSIONS.PRICE_BOOK_PUBLISH)).toBe(false)
    expect(roleHasPermission('SALES', PERMISSIONS.MEMBER_INVITE)).toBe(false)
    expect(roleHasPermission('SALES', PERMISSIONS.COMPANY_UPDATE)).toBe(false)
    // But it can do the job it exists for.
    expect(roleHasPermission('SALES', PERMISSIONS.OFFER_REQUEST_RESPOND)).toBe(true)
    expect(roleHasPermission('SALES', PERMISSIONS.OFFER_SEND)).toBe(true)
    expect(roleHasPermission('SALES', PERMISSIONS.PRICE_BOOK_READ)).toBe(true)
  })

  it('gives VIEWER reads and nothing else', () => {
    for (const permission of ALL_PERMISSIONS) {
      const isRead = PERMISSION_KIND[permission] === 'read'
      expect(roleHasPermission('VIEWER', permission), permission).toBe(isRead)
    }
  })
})

describe('ADMIN cannot grant or revoke OWNER — footnote 1', () => {
  it('lets OWNER move ownership and stops ADMIN', () => {
    expect(canAssignRole('OWNER', 'OWNER')).toBe(true)
    expect(canAssignRole('ADMIN', 'OWNER')).toBe(false)
    expect(canRevokeRole('ADMIN', 'OWNER')).toBe(false)
  })

  it('lets ADMIN manage every other role', () => {
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(true)
    expect(canAssignRole('ADMIN', 'SALES')).toBe(true)
    expect(canAssignRole('ADMIN', 'VIEWER')).toBe(true)
  })

  it('stops SALES and VIEWER from assigning anything', () => {
    for (const role of ['SALES', 'VIEWER'] as const) {
      for (const target of COMPANY_ROLES) {
        expect(canAssignRole(role, target), `${role} → ${target}`).toBe(false)
      }
    }
  })
})

describe('status gate — 02 §Verification state', () => {
  it('lets a PENDING company complete its profile and upload documents', () => {
    expect(statusAllowsPermission('PENDING', PERMISSIONS.COMPANY_UPDATE)).toBe(true)
    expect(statusAllowsPermission('PENDING', PERMISSIONS.DOCUMENT_UPLOAD)).toBe(true)
    // "not matchable, not listed" — it cannot yet operate.
    expect(statusAllowsPermission('PENDING', PERMISSIONS.OFFER_SEND)).toBe(false)
    expect(statusAllowsPermission('PENDING', PERMISSIONS.PRICE_BOOK_PUBLISH)).toBe(false)
  })

  it('makes REJECTED read-only apart from resubmitting documents', () => {
    expect(statusAllowsPermission('REJECTED', PERMISSIONS.DOCUMENT_UPLOAD)).toBe(true)
    expect(statusAllowsPermission('REJECTED', PERMISSIONS.OFFER_REQUEST_READ)).toBe(true)
    expect(statusAllowsPermission('REJECTED', PERMISSIONS.COMPANY_UPDATE)).toBe(false)
  })

  it('freezes SUSPENDED to reads — every member drops to read-only immediately', () => {
    for (const permission of ALL_PERMISSIONS) {
      const isRead = PERMISSION_KIND[permission] === 'read'
      expect(statusAllowsPermission('SUSPENDED', permission), permission).toBe(isRead)
    }
  })

  it('allows everything a role holds once VERIFIED', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(statusAllowsPermission('VERIFIED', permission)).toBe(true)
    }
  })

  it('is the intersection, not either half', () => {
    // An OWNER of a suspended company holds `offer.send` and cannot use it.
    expect(roleHasPermission('OWNER', PERMISSIONS.OFFER_SEND)).toBe(true)
    expect(companyMemberCan('OWNER', 'SUSPENDED', PERMISSIONS.OFFER_SEND)).toBe(false)
    // A VIEWER of a verified company is allowed by status and not by role.
    expect(statusAllowsPermission('VERIFIED', PERMISSIONS.OFFER_SEND)).toBe(true)
    expect(companyMemberCan('VIEWER', 'VERIFIED', PERMISSIONS.OFFER_SEND)).toBe(false)
  })
})
