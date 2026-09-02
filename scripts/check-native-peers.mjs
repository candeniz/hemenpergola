#!/usr/bin/env node
/**
 * Run with: node scripts/check-native-peers.mjs   (or `pnpm --filter mobile run doctor`)
 *
 * **The check that would have saved two cloud builds** (task 13.6c).
 *
 * Both `preview` builds died in the same place — `Run gradlew`, compiling
 * `expo-modules-core/android/src/main/cpp/worklets/WorkletJSCallInvoker.cpp:27`, with
 * `no member named 'executeSync' in 'worklets::WorkletRuntime'`. `expo-doctor` was green
 * for both of them, and it was right to be: it audits the packages the project
 * **declares**, and `react-native-worklets` was in the tree as an *optional peer* that
 * nothing declared. Nothing pinned it, so pnpm took the newest thing that satisfied `*`.
 *
 * That blind spot is structural, not a bug in doctor. This is the check for it, and it
 * looks at the one thing that cannot lie: the C++ that is about to be compiled.
 *
 *   1. **The seam.** Every `workletRuntime->NAME(` that `expo-modules-core` calls must be
 *      declared in the `react-native-worklets` headers that will be on the include path.
 *      Deliberately not a hardcoded list of one symbol — the next skew across this seam
 *      will have a different name and the same shape.
 *   2. **One copy.** A native build may link only one copy of a native module. Two is a
 *      duplicate-symbol error at best and a silent wrong-version link at worst.
 *
 * Resolution runs from `mobile/`, through Node's resolver, which is what Metro and Gradle
 * see — not from the workspace root, where the answer can differ.
 *
 * No semver dependency on purpose: version RANGES are `expo-doctor`'s job and it does that
 * well. This asks the question doctor cannot — whether the code fits together.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)))
const MOBILE = join(ROOT, 'mobile')

/**
 * Resolve as the app does: from `mobile/`, not from the workspace root — and then from
 * mobile's own dependencies, because under pnpm's strict layout a transitive native module
 * like `expo-modules-core` is NOT hoisted into `mobile/node_modules`. It is reached through
 * `expo`, which is exactly how Metro and Gradle reach it too.
 *
 * Each base is resolved to its **real** path first: every entry in `mobile/node_modules` is
 * a symlink into the pnpm store, and Node's resolver does not walk out of a symlink into
 * the store's sibling `node_modules`. Metro follows the real path; so does this.
 */
const realOrSelf = (path) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const RESOLUTION_BASES = [MOBILE]
try {
  for (const entry of readdirSync(join(MOBILE, 'node_modules'))) {
    if (entry.startsWith('.')) continue
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(join(MOBILE, 'node_modules', entry))) {
        RESOLUTION_BASES.push(realOrSelf(join(MOBILE, 'node_modules', entry, scoped)))
      }
    } else {
      RESOLUTION_BASES.push(realOrSelf(join(MOBILE, 'node_modules', entry)))
    }
  }
} catch {
  // No install yet; the checks below report that clearly enough.
}

function packageDir(name) {
  for (const base of RESOLUTION_BASES) {
    try {
      return dirname(createRequire(join(base, 'noop.js')).resolve(`${name}/package.json`))
    } catch {
      /* try the next base */
    }
  }
  return null
}

function version(name) {
  const dir = packageDir(name)
  if (dir === null) return null
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
}

function filesUnder(dir, pattern) {
  const found = []
  const walk = (current) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (pattern.test(entry.name)) found.push(path)
    }
  }
  walk(dir)
  return found
}

const problems = []
const notes = []

// ── 1 · the worklets seam ────────────────────────────────────────────────────
const coreDir = packageDir('expo-modules-core')
const workletsDir = packageDir('react-native-worklets')

if (coreDir === null) {
  problems.push('expo-modules-core does not resolve from mobile/ — the app cannot build.')
} else if (workletsDir === null) {
  // Not an error by itself: the peer is optional, and without it the bridge is not built.
  notes.push('react-native-worklets is not installed; the worklets bridge is not compiled.')
} else {
  notes.push(
    `expo-modules-core@${version('expo-modules-core')} · react-native-worklets@${version(
      'react-native-worklets',
    )} · react-native-reanimated@${version('react-native-reanimated') ?? '(yok)'}`,
  )

  const bridgeSources = filesUnder(
    join(coreDir, 'android', 'src', 'main', 'cpp', 'worklets'),
    /\.cpp$/,
  )
  if (bridgeSources.length === 0) {
    /*
     * **A missing source tree is a failure, not a note** (task 14.5).
     *
     * It used to push a line and carry on, so the script exited 0 saying "nothing to check"
     * — which is what it would do the day `expo-modules-core` moves this directory. The
     * check would go quiet, CI would stay green, and the class of skew that killed two cloud
     * builds would be invisible again. A check that cannot find its subject has not passed;
     * it has failed to run.
     *
     * The header side already has the right asymmetry: if the worklets headers cannot be
     * read, every symbol reads as undeclared and the script fails loudly.
     */
    problems.push(
      `expo-modules-core@${version('expo-modules-core')} ships no worklets bridge sources at ` +
        `android/src/main/cpp/worklets. Either the package moved them — in which case this ` +
        `script needs the new path — or the install is broken. Either way nothing was checked.`,
    )
  }

  const headers = filesUnder(join(workletsDir, 'Common', 'cpp'), /\.h$/)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')

  const called = new Set()
  for (const source of bridgeSources) {
    const text = readFileSync(source, 'utf8')
    for (const match of text.matchAll(/workletRuntime(?:->|\.)([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      called.add(match[1])
    }
    for (const match of text.matchAll(/WorkletRuntime::([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      called.add(match[1])
    }
  }

  for (const symbol of [...called].sort()) {
    // A declaration, not merely the word: `foo(` in a header is what the compiler needs.
    const declared = new RegExp(`\\b${symbol}\\s*\\(`).test(headers)
    if (!declared) {
      problems.push(
        `expo-modules-core calls worklets::WorkletRuntime::${symbol}(), which ` +
          `react-native-worklets@${version('react-native-worklets')} does not declare. ` +
          `This is a gradlew compile error, not a runtime one — the build WILL fail.`,
      )
    }
  }
  if (called.size > 0) {
    notes.push(`worklets seam: ${[...called].sort().join(', ')} — all declared.`)
  }
}

// ── 2 · one copy of each native module ───────────────────────────────────────
/**
 * **Resolved from the graph, not from nesting** (rewritten in task 14.5).
 *
 * The first version looked for `<package>/node_modules/<package>` — the npm shape, where a
 * second copy nests inside the dependent that asked for it. pnpm's strict layout does not
 * work that way: every version lives in its own `.pnpm/<hash>/node_modules/<name>` directory
 * and dependents link to it as a **sibling**. The scan therefore found nothing, ever — and
 * that was proven, not assumed: pinning `expo-constants@57.0.14` in `mobile/package.json`
 * while `expo-asset` still asked for `~57.0.15` put two real versions in the tree and the
 * check reported "no module is doubled" and exited 0. Exactly the duplicate 13.6b hit.
 *
 * What it does now is ask the question a native build asks: **who links which copy.**
 * Autolinking walks the project's dependency graph, so this resolves each native name from
 * `mobile/` and from every one of mobile's direct dependencies — each at its real path,
 * because that is where pnpm keeps the sibling `node_modules` a package can see — and counts
 * the distinct versions that come back.
 *
 * Reading `.pnpm`'s directory names instead would be simpler and wrong: the store keeps
 * entries an install has stopped using (13.6c watched three of them linger), so the answer
 * would be full of copies nothing links.
 */
const NATIVE = [
  'expo-modules-core',
  'react-native-worklets',
  'react-native-reanimated',
  'react-native',
  'expo-constants',
]

function versionAt(base, name) {
  try {
    const manifest = createRequire(join(base, 'noop.js')).resolve(`${name}/package.json`)
    return { version: JSON.parse(readFileSync(manifest, 'utf8')).version, from: base }
  } catch {
    return null
  }
}

for (const name of NATIVE) {
  const seen = new Map() // version → the first package that links it
  for (const base of RESOLUTION_BASES) {
    const found = versionAt(base, name)
    if (found !== null && !seen.has(found.version)) seen.set(found.version, found.from)
  }

  if (seen.size > 1) {
    const detail = [...seen.entries()]
      .map(([version, from]) => `${version} (linked from ${from.replace(ROOT, '.')})`)
      .join(', ')
    problems.push(
      `${name} resolves to ${seen.size} different versions in this tree: ${detail}. ` +
        `A native build may link only one.`,
    )
  }
}

// ── report ───────────────────────────────────────────────────────────────────
for (const note of notes) console.log(`  ${note}`)

if (problems.length > 0) {
  console.error('\nnative peer check FAILED — do not start a cloud build:\n')
  for (const problem of problems) console.error(`  ✖ ${problem}`)
  console.error(
    '\nFix by declaring the native peer in mobile/package.json at the version Expo SDK 57' +
      '\npins (expo/bundledNativeModules.json), then `pnpm install`. See 13.6c in 25-progress.md.\n',
  )
  process.exit(1)
}

console.log('\nnative peer check passed — the worklets seam fits and no module is doubled.')
