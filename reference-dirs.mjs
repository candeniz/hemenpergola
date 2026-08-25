/**
 * The committed reference folders (`CLAUDE.md` §Layout) — **one list, and nine places in
 * the tree that carry these names.** Three import this module and get the list:
 * `eslint.config.mjs`, `next.config.ts` and `vitest.config.ts`, each applying its own glob
 * shape. Six repeat the names as text, and they split in two:
 *
 *   `.prettierignore` and `tsconfig.json` — the two build-exclusion consumers whose formats
 *   have no imports (text and JSON). `reference-dirs.test.ts` holds them to this list.
 *
 *   `scripts/generate-permission-table.mjs`, `permissions.test.ts`, `nav-items.test.ts` and
 *   `performance-templates.test.ts` — these embed a folder name inside a *document path*
 *   (`Yazılım Mimari Promptlar/02-…`), not as an exclusion. Nothing holds them to this
 *   list, and a rename breaks them at read time rather than at lint time.
 *
 * This file exists because the list was duplicated and the copies drifted: `Prompt/` was
 * named in `eslint.config.mjs` and not in `next.config.ts`, which is exactly the shape of
 * bug a second copy produces (`ADR-029`). Bare directory names, because each consumer
 * needs a different glob shape around them.
 *
 * `.mjs` rather than `.ts` so ESLint's flat config — plain Node ESM, no TypeScript loader —
 * can import it alongside the TypeScript configs.
 */
export const REFERENCE_DIRS = ['Frontend Tasarım', 'Yazılım Mimari Promptlar']
