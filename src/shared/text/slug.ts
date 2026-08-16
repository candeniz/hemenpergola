/**
 * Slugs.
 *
 * Turkish first: `ı ğ ü ş ö ç` are folded to their ASCII partners *before* Unicode
 * normalisation, because `NFD` + strip-combining-marks turns `ı` into `ı` (it has no
 * combining mark to strip) and `ğ` into `g` — an inconsistency that would give
 * "Bahçe Işık" the slug `bahce-ık`. Folding explicitly first makes every Turkish letter
 * behave the same way.
 *
 * `İ` is the other trap: `'İ'.toLowerCase()` in a non-Turkish locale yields `i̇` — an `i`
 * with a combining dot above — so the lower-casing is done with `tr-TR` and the folding
 * table covers what is left.
 */
const TURKISH_FOLD: readonly (readonly [string, string])[] = [
  ['ı', 'i'],
  ['ğ', 'g'],
  ['ü', 'u'],
  ['ş', 's'],
  ['ö', 'o'],
  ['ç', 'c'],
]

export function slugify(input: string, fallback = 'kayit'): string {
  let folded = input.toLocaleLowerCase('tr-TR')
  for (const [from, to] of TURKISH_FOLD) folded = folded.replaceAll(from, to)

  const base = folded
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')

  return base.length >= 2 ? base : fallback
}

/**
 * Make a slug unique against a set of taken ones by appending `-2`, `-3`, …
 *
 * The caller supplies the set, because "taken" means different things in different tables —
 * for the catalogue it is *within one locale* (`ADR-017`), and a query that forgot the locale
 * would silently make Turkish and English slugs collide.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, limit = 1000): string {
  if (!taken.has(base)) return base

  for (let n = 2; n < limit; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }

  throw new Error(`could not find a free slug for "${base}" after ${limit} attempts`)
}
