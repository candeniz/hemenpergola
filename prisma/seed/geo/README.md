# Geography seed — Turkish provinces and districts

`turkey.json` holds all 81 provinces and their districts, each with a centre point. It is
generated, committed, and read by `prisma/seed/geo/seed-geo.ts`. A seed run needs no
network access.

## Source and licence

|                 |                                                                                  |
| --------------- | -------------------------------------------------------------------------------- |
| Source          | **GeoNames** — `https://download.geonames.org/export/dump/TR.zip`, file `TR.txt` |
| Records used    | feature codes `ADM1` (province) and `ADM2` (district)                            |
| Licence         | **Creative Commons Attribution 4.0 International (CC BY 4.0)**                   |
| Licence text    | https://creativecommons.org/licenses/by/4.0/                                     |
| Data downloaded | **2026-08-15**                                                                   |
| Coverage        | 81 provinces, 974 districts                                                      |

**Why GeoNames and not OpenStreetMap.** OSM and its derivatives (Nominatim, Overpass
extracts, most "Turkey districts" repositories on GitHub) are **ODbL**, which carries a
share-alike obligation on derived databases. Shipping an ODbL-derived table inside a
commercial product's database is exactly the case ODbL §4.4 is about, and it is not a
question to leave to a later reading. CC BY 4.0 asks for attribution and nothing else:
commercial use and redistribution are explicitly permitted, and there is no share-alike
clause.

**The attribution obligation is real and must be honoured.** Before launch, the public site
needs a visible credit — the natural home is the colophon or the legal pages built in
Phase 8 (`18-cms-seo.md` §CMS):

> Contains data from GeoNames (geonames.org), licensed under CC BY 4.0.

That line is carried in `turkey.json` under `attribution` so it cannot be lost.

**The date matters.** District boundaries change: Turkey has created districts as recently
as the 2010s, and provinces were last renumbered when Düzce became 81 in 1999. `generatedAt`
in the JSON records when this snapshot was taken, so a future mismatch with reality is
dateable rather than mysterious.

## Regenerating

```bash
curl -o TR.zip https://download.geonames.org/export/dump/TR.zip
unzip TR.zip TR.txt
node scripts/build-geo-seed.mjs ./TR.txt
```

The build script is deliberately strict: if a GeoNames province name does not match the
official list, or a province ends up with no districts, it **fails rather than writing a
partial dataset**. That guard has already earned its place — GeoNames spells Elazığ as
`Elâzığ`, with a circumflex the official name does not use, and the build stopped instead of
silently dropping the province.

## Two things the script does not take from GeoNames

**Plate codes.** GeoNames' `admin1 code` is its own sequence and does not match Turkish
plate numbering. Plate codes are the numbers on every licence plate, ID card and address in
the country — 34 is İstanbul — so they come from the official list held in the script and
are matched to GeoNames records by name.

**Spelling.** A short alias table maps GeoNames spellings to official ones: `Icel` → Mersin,
`Elâzığ` → Elazığ, `Hakkari` → Hakkâri. Kept as a visible table rather than patched into the
data, so re-running the build reproduces the same result.

## Shape

```jsonc
{
  "source": "GeoNames (…)",
  "licence": "CC BY 4.0 — …",
  "attribution": "Contains data from GeoNames (geonames.org), licensed under CC BY 4.0.",
  "generatedAt": "2026-08-15",
  "cityCount": 81,
  "districtCount": 974,
  "cities": [
    {
      "plateCode": 1,
      "name": "Adana",
      "latitude": 37.05,
      "longitude": 35.32,
      "districts": [{ "name": "Aladağ", "latitude": 37.55, "longitude": 35.4 }],
    },
  ],
}
```

Coordinates are WGS 84 (SRID 4326) decimal degrees, rounded to five places — about a metre,
far finer than a district centre needs.

## How the points are used

`09-manufacturer-matching.md` §Service-area coverage: when a customer does not give a
precise location, the project point is the **district centroid**, and the radius test runs
against that. A district with no point would silently drop every radius-based manufacturer
for that district, which is why `seed-geo.ts` asserts every district has one.

The `point` column is PostGIS `geography(Point, 4326)` and invisible to Prisma
(`ADR-015`), so the seed writes it through `src/shared/geo` rather than through the client.
