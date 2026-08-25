/**
 * The committed reference folders — **one list, five consumers** (`CLAUDE.md` §Layout).
 *
 * This file exists because the list was duplicated and the copies drifted: `Prompt/` was
 * named in `eslint.config.mjs` and not in `next.config.ts`, which is exactly the shape of
 * bug a second copy produces (`ADR-029`). Bare directory names, because each consumer
 * needs a different glob shape around them.
 *
 * `.mjs` rather than `.ts` so ESLint's flat config — plain Node ESM, no TypeScript loader —
 * can import it alongside the TypeScript configs.
 *
 * Two consumers cannot import anything, because their formats have no imports:
 * `.prettierignore` and `tsconfig.json` repeat the names as text. `reference-dirs.test.ts`
 * asserts those two agree with this list, so the drift this file removes cannot re-enter
 * through the back door.
 */
export const REFERENCE_DIRS = ['Frontend Tasarım', 'Yazılım Mimari Promptlar']
