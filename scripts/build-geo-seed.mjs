#!/usr/bin/env node
/**
 * Builds `prisma/seed/geo/turkey.json` from the GeoNames Turkey dump.
 *
 * Source and licence are documented in `prisma/seed/geo/README.md`. Run this only when the
 * data needs refreshing; the generated JSON is committed, so a normal seed run needs no
 * network access.
 *
 * Usage:
 *   1. download https://download.geonames.org/export/dump/TR.zip and extract TR.txt
 *   2. node scripts/build-geo-seed.mjs <path-to-TR.txt>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const source = process.argv[2]
const alternates = process.argv[3]
if (source === undefined || alternates === undefined) {
  console.error('usage: node scripts/build-geo-seed.mjs <TR.txt> <alternatenames/TR.txt>')
  process.exit(1)
}

/**
 * Fold Turkish letters to their ASCII shapes. Used only to decide whether two spellings are
 * *the same word*, never to produce a stored name.
 */
function fold(value) {
  return value
    .replaceAll('İ', 'I')
    .replaceAll('ı', 'i')
    .replaceAll('Ş', 'S')
    .replaceAll('ş', 's')
    .replaceAll('Ğ', 'G')
    .replaceAll('ğ', 'g')
    .replaceAll('Ç', 'C')
    .replaceAll('ç', 'c')
    .replaceAll('Ö', 'O')
    .replaceAll('ö', 'o')
    .replaceAll('Ü', 'U')
    .replaceAll('ü', 'u')
    .replaceAll('Â', 'A')
    .replaceAll('â', 'a')
    .toLowerCase()
}

/** GeoNames appends the administrative noun to some names. "Bursa İli" is the province Bursa. */
function stripAdministrativeNoun(value) {
  return value
    .replace(/\s+(İli|Ili)$/u, '')
    .replace(/\s+(İlçesi|Ilcesi)$/u, '')
    .trim()
}

/**
 * Pick the best spelling for one record.
 *
 * GeoNames' `name` for a Turkish district is often ASCII-folded (`Yesilhisar`, `Beypazari`)
 * or suffixed (`Çelikhan İlçesi`). The Turkish-tagged alternate names carry the real
 * spelling — but they also carry suffixes, historical names (`Muradiye / Berkri`) and the
 * occasional typo (`Alacakaya` → `Alacakayal`).
 *
 * So an alternate is accepted **only if it is the same word as the base name once both are
 * folded to ASCII**. That admits every missing diacritic and rejects every rename and
 * misspelling, without anyone having to know Turkish orthography place by place.
 */
function bestName(baseName, turkishAlternates) {
  const base = stripAdministrativeNoun(baseName)
  const baseFolded = fold(base)

  const sameWord = turkishAlternates
    .map(stripAdministrativeNoun)
    .filter((candidate) => fold(candidate) === baseFolded)

  // Prefer the candidate that actually carries diacritics; there is no point swapping one
  // ASCII spelling for another.
  const withDiacritics = sameWord.find(
    (candidate) =>
      candidate !== fold(candidate).toLowerCase() && /[İıŞşĞğÇçÖöÜüÂâ]/u.test(candidate),
  )

  return withDiacritics ?? base
}

const OUTPUT = 'prisma/seed/geo/turkey.json'

/**
 * GeoNames' `admin1 code` for Turkey is *not* the plate code. It is a sequence assigned by
 * GeoNames, and it does not match the official numbering that Turks actually use — plate 34
 * is İstanbul, and every address, ID card and licence plate in the country agrees. So the
 * plate code is taken from the official list below and matched by name, and a province that
 * fails to match is a hard error rather than a silent gap.
 *
 * Official numbering: 1–81, fixed by the state, unchanged since Düzce became 81 in 1999.
 */
const PLATE_CODES = {
  Adana: 1,
  Adıyaman: 2,
  Afyonkarahisar: 3,
  Ağrı: 4,
  Amasya: 5,
  Ankara: 6,
  Antalya: 7,
  Artvin: 8,
  Aydın: 9,
  Balıkesir: 10,
  Bilecik: 11,
  Bingöl: 12,
  Bitlis: 13,
  Bolu: 14,
  Burdur: 15,
  Bursa: 16,
  Çanakkale: 17,
  Çankırı: 18,
  Çorum: 19,
  Denizli: 20,
  Diyarbakır: 21,
  Edirne: 22,
  Elazığ: 23,
  Erzincan: 24,
  Erzurum: 25,
  Eskişehir: 26,
  Gaziantep: 27,
  Giresun: 28,
  Gümüşhane: 29,
  Hakkâri: 30,
  Hatay: 31,
  Isparta: 32,
  Mersin: 33,
  İstanbul: 34,
  İzmir: 35,
  Kars: 36,
  Kastamonu: 37,
  Kayseri: 38,
  Kırklareli: 39,
  Kırşehir: 40,
  Kocaeli: 41,
  Konya: 42,
  Kütahya: 43,
  Malatya: 44,
  Manisa: 45,
  Kahramanmaraş: 46,
  Mardin: 47,
  Muğla: 48,
  Muş: 49,
  Nevşehir: 50,
  Niğde: 51,
  Ordu: 52,
  Rize: 53,
  Sakarya: 54,
  Samsun: 55,
  Siirt: 56,
  Sinop: 57,
  Sivas: 58,
  Tekirdağ: 59,
  Tokat: 60,
  Trabzon: 61,
  Tunceli: 62,
  Şanlıurfa: 63,
  Uşak: 64,
  Van: 65,
  Yozgat: 66,
  Zonguldak: 67,
  Aksaray: 68,
  Bayburt: 69,
  Karaman: 70,
  Kırıkkale: 71,
  Batman: 72,
  Şırnak: 73,
  Bartın: 74,
  Ardahan: 75,
  Iğdır: 76,
  Yalova: 77,
  Karabük: 78,
  Kilis: 79,
  Osmaniye: 80,
  Düzce: 81,
}

/**
 * GeoNames uses a few names that differ from the official Turkish spelling, usually an
 * older or anglicised form. Mapped rather than patched in place, so the difference stays
 * visible and re-running the build reproduces it.
 */
const PROVINCE_ALIASES = {
  Icel: 'Mersin',
  İçel: 'Mersin',
  // GeoNames writes a circumflex that the official spelling does not use. The reverse of
  // Hakkâri, where the official spelling *does* carry one — hence both directions here.
  Elâzığ: 'Elazığ',
  Hakkari: 'Hakkâri',
  Kahramanmaras: 'Kahramanmaraş',
  Afyon: 'Afyonkarahisar',
  Antep: 'Gaziantep',
  Maras: 'Kahramanmaraş',
  Urfa: 'Şanlıurfa',
}

const rows = readFileSync(source, 'utf8').split('\n')

// geonameid → Turkish-tagged alternate names, preferred spellings first.
const turkishNames = new Map()
for (const line of readFileSync(alternates, 'utf8').split('\n')) {
  if (line.length === 0) continue
  const [, geonameId, language, alternateName, isPreferred, , , isHistoric] = line.split('\t')
  if (language !== 'tr' || isHistoric === '1') continue

  const existing = turkishNames.get(geonameId) ?? []
  if (isPreferred === '1') existing.unshift(alternateName)
  else existing.push(alternateName)
  turkishNames.set(geonameId, existing)
}

const provinces = new Map() // admin1 code -> record
const districts = []
let improved = 0

for (const line of rows) {
  if (line.length === 0) continue
  const f = line.split('\t')
  const [geonameId, name, , , latitude, longitude, , featureCode, , , admin1, admin2] = f

  if (featureCode !== 'ADM1' && featureCode !== 'ADM2') continue

  const resolved = bestName(name, turkishNames.get(geonameId) ?? [])
  if (resolved !== name) improved += 1

  if (featureCode === 'ADM1') {
    provinces.set(admin1, {
      name: PROVINCE_ALIASES[resolved] ?? resolved,
      geonamesName: name,
      latitude: Number(latitude),
      longitude: Number(longitude),
    })
  } else {
    districts.push({
      admin1,
      admin2,
      name: resolved,
      latitude: Number(latitude),
      longitude: Number(longitude),
    })
  }
}

const cities = []
const unmatched = []

for (const [admin1, province] of provinces) {
  const plateCode = PLATE_CODES[province.name]

  if (plateCode === undefined) {
    unmatched.push(`${province.name} (GeoNames "${province.geonamesName}", admin1 ${admin1})`)
    continue
  }

  const own = districts
    .filter((d) => d.admin1 === admin1)
    .map((d) => ({
      /*
       * A province's central district carries the province's name, and GeoNames sometimes
       * spells that one ASCII (`Canakkale` inside Çanakkale). The province spelling is
       * authoritative and comes from the same dataset, so it wins — this is a lookup, not a
       * guess about orthography.
       */
      name: fold(d.name) === fold(province.name) ? province.name : d.name,
      latitude: Number(d.latitude.toFixed(5)),
      longitude: Number(d.longitude.toFixed(5)),
    }))
    // Deduplicate: GeoNames occasionally carries a district twice under variant spellings.
    .filter((d, i, all) => all.findIndex((x) => x.name === d.name) === i)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  cities.push({
    plateCode,
    name: province.name,
    latitude: Number(province.latitude.toFixed(5)),
    longitude: Number(province.longitude.toFixed(5)),
    districts: own,
  })
}

cities.sort((a, b) => a.plateCode - b.plateCode)

const missingPlates = Object.entries(PLATE_CODES)
  .filter(([name]) => !cities.some((c) => c.name === name))
  .map(([name, code]) => `${code} ${name}`)

if (unmatched.length > 0 || missingPlates.length > 0) {
  console.error('Province matching failed — refusing to write a partial dataset.')
  if (unmatched.length > 0) console.error('  unrecognised GeoNames provinces:', unmatched)
  if (missingPlates.length > 0) console.error('  official provinces with no data:', missingPlates)
  process.exit(1)
}

const withoutDistricts = cities.filter((c) => c.districts.length === 0)
if (withoutDistricts.length > 0) {
  console.error(
    'Provinces with no districts:',
    withoutDistricts.map((c) => c.name),
  )
  process.exit(1)
}

const payload = {
  source: 'GeoNames (https://download.geonames.org/export/dump/TR.zip)',
  licence: 'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Contains data from GeoNames (geonames.org), licensed under CC BY 4.0.',
  generatedFrom: 'TR.txt (ADM1, ADM2) + alternatenames/TR.txt (isolanguage=tr)',
  namesCorrectedFromTurkishAlternates: improved,
  generatedAt: new Date().toISOString().slice(0, 10),
  cityCount: cities.length,
  districtCount: cities.reduce((total, c) => total + c.districts.length, 0),
  cities,
}

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`)

console.log(`${OUTPUT}: ${payload.cityCount} cities, ${payload.districtCount} districts`)
