# Noto Sans — SIL Open Font License 1.1

`noto-sans-tr-subset-regular.ttf`, `noto-sans-tr-subset-bold.ttf`

- **Family:** Noto Sans, v42 (Google Fonts)
- **Licence:** SIL Open Font License, Version 1.1 —
  <https://openfontlicense.org/> · the family's licence file:
  <https://fonts.google.com/noto/specimen/Noto+Sans/license>
- **Copyright:** © The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)
- **Source:** `https://fonts.gstatic.com`, resolved through the Google Fonts CSS2 API on
  **2026-08-25** — the same route and the same documented method as
  `material-symbols-outlined-subset.woff2` (see `README.md`).

The OFL permits redistribution of the font and of derivative subsets, bundled with
software, provided the font is not sold on its own and the licence travels with it — which
is what this file is. The family name is not modified, so the Reserved Font Name clause is
not engaged.

## Why these files exist

The KVKK data export is _"JSON + PDF"_ (`19` §Access). A PDF needs an **embedded** font:
the PDF standard-14 faces are WinAnsi-only and carry no `ı İ ş Ş ğ Ğ`, so a Turkish name
renders as tofu or, worse, silently wrong. The first candidate found in the tree
(`@vercel/og`'s bundled `noto-sans-v27-latin-regular.ttf`) was **rejected after reading
its cmap**: the Google "latin" subset has `ı` but not `İ ş Ş ğ Ğ ₺`. Assume nothing about
a font's coverage; the cmap is the answer.

## Regenerating

Subsetted through the CSS2 API's `text=` parameter to the repertoire a Turkish document
needs — Latin letters, digits, the six Turkish specials in both cases, circumflex vowels,
punctuation and the lira sign:

- full family (regular + bold): **1 114 340 bytes** (1.06 MB)
- these subsets: **50 116 bytes** (48.9 KB) — **95.5% smaller**

```bash
CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÇĞİÖŞÜçğıöşüÂÎÛâîû.,:;!?()[]{}'\"«»–—-_/\|+=<>*#%&@\$€₺°~^ "
ENC=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$CHARS")
# An OLD User-Agent is what makes the API serve TTF rather than woff2; PDF embedding
# needs TTF/OTF.
curl -s -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&text=$ENC" -o /tmp/noto.css
curl -s -o src/app/'[locale]'/fonts/noto-sans-tr-subset-regular.ttf "$(grep -o 'https://[^)]*' /tmp/noto.css | sed -n 1p)"
curl -s -o src/app/'[locale]'/fonts/noto-sans-tr-subset-bold.ttf    "$(grep -o 'https://[^)]*' /tmp/noto.css | sed -n 2p)"
```

A character used in a PDF but missing from the subset renders as a blank box — the export
integration test asserts the Turkish specials survive a round trip through the renderer,
so a narrowed subset fails there rather than in a customer's download.
