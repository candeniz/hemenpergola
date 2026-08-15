#!/usr/bin/env node
/**
 * Run with: pnpm exec tsx scripts/generate-permission-table.mjs
 *
 * Regenerates the permission table in `02-user-roles-and-permissions.md` from
 * `src/modules/iam/domain/permissions.ts`.
 *
 * `02` says the catalogue file *"is the single source of truth and this table must be
 * regenerated from it, never hand-edited to diverge."* This is what does the regenerating.
 * `permissions.test.ts` fails when the document and the code disagree, so the instruction
 * is enforced rather than merely written down.
 *
 *   node scripts/generate-permission-table.mjs           # rewrite the document
 *   node scripts/generate-permission-table.mjs --check    # exit 1 if it would change
 */
import { readFileSync, writeFileSync } from 'node:fs'
const { ALL_PERMISSIONS, COMPANY_ROLES, roleHasPermission, permissionLabel } =
  await import('../src/modules/iam/domain/permissions.ts')

const DOC = 'Yazılım Mimari Promptlar/02-user-roles-and-permissions.md'
const BEGIN = '<!-- BEGIN GENERATED PERMISSION TABLE -->'
const END = '<!-- END GENERATED PERMISSION TABLE -->'

function renderTable() {
  const header = `| Permission | ${COMPANY_ROLES.join(' | ')} |`
  const divider = `|---|${COMPANY_ROLES.map(() => ':--:').join('|')}|`

  const rows = ALL_PERMISSIONS.map((permission) => {
    const cells = COMPANY_ROLES.map((role) => {
      const held = roleHasPermission(role, permission)
      // ADMIN holds member.change_role but may not use it on OWNER — footnote 1.
      if (held && role === 'ADMIN' && permission.endsWith('member.change_role')) return '✓¹'
      return held ? '✓' : '—'
    })
    return `| \`${permissionLabel(permission)}\` | ${cells.join(' | ')} |`
  })

  return [
    BEGIN,
    '',
    `<!-- Generated from src/modules/iam/domain/permissions.ts by scripts/generate-permission-table.mjs.`,
    `     Do not edit by hand: permissions.test.ts fails when this drifts from the code. -->`,
    '',
    header,
    divider,
    ...rows,
    '',
    '¹ `ADMIN` cannot grant or revoke `OWNER`.',
    '',
    END,
  ].join('\n')
}

const document = readFileSync(DOC, 'utf8')
const begin = document.indexOf(BEGIN)
const end = document.indexOf(END)

if (begin === -1 || end === -1) {
  console.error(`Markers not found in ${DOC}. Add:\n  ${BEGIN}\n  ${END}`)
  process.exit(1)
}

const next = document.slice(0, begin) + renderTable() + document.slice(end + END.length)

if (process.argv.includes('--check')) {
  if (next !== document) {
    console.error(`${DOC} is out of date. Run: node scripts/generate-permission-table.mjs`)
    process.exit(1)
  }
  console.log(`${DOC}: permission table matches the catalogue`)
  process.exit(0)
}

writeFileSync(DOC, next)
console.log(
  `${DOC}: regenerated ${ALL_PERMISSIONS.length} permissions × ${COMPANY_ROLES.length} roles`,
)
