# 22 — Design System

## Which theme is canonical

`Frontend Tasarım/` ships four themes. They are not variants to choose between at runtime;
they are iterations of the same brand, and the screens are split across them:

| Theme (`DESIGN.md`) | Screens | Fonts | Primary |
|---|---:|---|---|
| **Architectural Outdoor Exchange** | **60** | Montserrat + Inter | `#162839` navy |
| Structure & Light | 13 | Montserrat + Hanken Grotesk | `#003527` emerald |
| Architectural Excellence | 4 | Montserrat only | `#003527` emerald |
| Emerald & Iron | 0 (tokens only) | Montserrat | `#003527` emerald |

**Canonical: Architectural Outdoor Exchange.** It carries the majority of screens and every
`*_final` screen (`outdoor_systems_public_homepage_final`, `customer_dashboard_final`,
`manufacturer_portal_dashboard_final`, `super_admin_command_center_final`), which are the
latest iteration. Where an older screen conflicts with a `_final` screen, the `_final` one
wins; where a `_refined_style` screen conflicts with an older one, the refined one wins.

Two known inconsistencies inside the canonical theme, resolved here so they are not resolved
differently in each PR:

1. **Prose vs tokens.** `DESIGN.md` prose names Deep Slate `#2C3E50`, Outdoor Green
   `#27AE60`, Terracotta `#E67E22`; the actual tokens are `#162839`, `#006d37`, `#411d00`.
   **Tokens win** — they are what the screens render. The prose colours are the narrative,
   and `#2c3e50` survives as `primary-container`.
2. **Radius scale.** `DESIGN.md` says `sm .25 / DEFAULT .5 / md .75 / lg 1 / xl 1.5rem`; the
   screen configs say `DEFAULT .25 / lg .5 / xl .75rem`. **The `DESIGN.md` scale wins**,
   because the prose commits to an 8px component radius and that is the one visible in the
   renders.

## Tokens

### One colour scheme, on purpose (noted 2026-08-26, Faz 13.1)

The system is deliberately **single-scheme light**, everywhere: `globals.css` carries no
`prefers-color-scheme` block and no dark variant of any token — the two occurrences of
the word "dark" in it are prose about light containers with dark text. The mobile app's
`userInterfaceStyle: "light"` is therefore a statement of what exists, not a shortcut:
its palette is DERIVED from these tokens (parity-tested), and "automatic" would hand half
the UI to OS defaults with no palette behind them. A dark scheme is a design task — a full
second semantic mapping here first, then the web, then the derived mobile tokens follow for
free — and it belongs to the post-placeholder visual pass, not to a config flag.


Defined once in `src/app/[locale]/globals.css` inside `@theme`. Never a hex literal in a
component.

**Tailwind 4 has no `tailwind.config.ts` and no `theme.extend`.** `@theme` *is* the
configuration: each entry becomes a CSS custom property on `:root` and generates the
matching utility. So "CSS custom properties consumed by Tailwind" is one block in one file
rather than two files that have to agree. (This paragraph replaces the v3 description; the
artefact named in `26-execution-plan.md` row 0.9 is likewise `globals.css` alone.)

Two token layers, in one file:

1. **Raw roles** — the palette below. Used by `globals.css` and by `/dev/tokens`, nowhere
   else.
2. **Semantic aliases** — §Semantic mapping. The only colour names application code may
   write.

`src/lib/design-tokens.ts` mirrors the palette in TypeScript so the contrast audit can do
arithmetic that CSS cannot. `design-tokens.test.ts` parses `globals.css` and fails if the
two disagree, so the duplication cannot rot.

### Colour

```
primary            #162839    on-primary            #ffffff
primary-container  #2c3e50    on-primary-container  #96a9be
secondary          #006d37    on-secondary          #ffffff
secondary-container#7bf8a1    on-secondary-container#007239
tertiary           #411d00    on-tertiary           #ffffff
tertiary-container #612f00    on-tertiary-container #f78b30
error              #ba1a1a    on-error              #ffffff
error-container    #ffdad6    on-error-container    #93000a

background         #f8f9fa    on-background         #191c1d
surface            #f8f9fa    on-surface            #191c1d
surface-variant    #e1e3e4    on-surface-variant    #43474c
surface-container-lowest #ffffff   surface-container-low  #f3f4f5
surface-container        #edeeef   surface-container-high #e7e8e9
surface-container-highest#e1e3e4   surface-dim #d9dadb   surface-bright #f8f9fa
outline            #74777d    outline-variant       #c4c6cd
inverse-surface    #2e3132    inverse-on-surface    #f0f1f2   inverse-primary #b5c8df
surface-tint       #4e6073
```

Plus the `*-fixed` / `*-fixed-dim` set from the theme file, kept for parity even though V1
uses few of them.

**Semantic mapping** (the only names application code should use):

| Semantic | Token |
|---|---|
| page background | `background` |
| card / panel | `surface-container-lowest` |
| subtle panel, table header | `surface-container-low` |
| primary action, headers, structural chrome | `primary` |
| success, confirm, primary CTA on marketing | `secondary` |
| warning / highlight badge | `tertiary-fixed` — see §Status badges |
| destructive | `error` |
| decorative divider | `outline-variant` |
| boundary that identifies a control | `outline` |
| muted text | `on-surface-variant` |

**`divider` and `control-border` are two names on purpose.** `outline-variant` measures
**1.61:1** against the page — far below the 3:1 that WCAG 1.4.11 requires of a boundary a
user needs in order to identify a control. It may separate table rows; it may never outline
an input, a select or a checkbox. Those use `outline`, at 4.25:1. Measured on `/dev/tokens`.

### Interaction states

Resting colours alone are not a design system. Without a name for the hovered state, every
component reaches past the semantic layer into the raw palette — which is how a `Button`
ended up with `hover:bg-on-error-container`, a **foreground** role used as a background. It
looked plausible and was wrong.

| Semantic | Token | Where it comes from |
|---|---|---|
| `action-hover` | `primary-container` `#2c3e50` | the screens: `<button class="bg-primary … hover:bg-primary-container">` |
| `confirm-hover` | `#00783d` | derived — `brightness(1.1)` of `secondary`, which is the effect `customer_dashboard_final` renders as `hover:brightness-110` |
| `destructive-hover` | `#cd1d1d` | derived — the same `brightness(1.1)`, applied to `error`; no destructive button appears in the screens |
| `action-wash` | `primary-fixed` | outline-button hover fill and the avatar fallback |
| `panel-hover` | `surface-variant` | the screens' commonest hover fill: 26 uses across the four `_final` screens |
| `track` | `surface-container-high` | inert fills — progress track, skeleton, switch when off |
| `inverse` / `on-inverse` | `inverse-surface` / `inverse-on-surface` | admin chrome, tooltip |
| `inverse-hover` | `primary-container` | admin nav item, hovered |
| `scrim` | `inverse-surface` | behind a modal, at 40% |

Only two values in the whole system are not lifted from the theme file — `confirm-hover`
and `destructive-hover` — and both are derived by the screens' own method rather than
picked. Every one of these pairs is in the `/dev/tokens` audit: **a hover state that drops
below AA is a hover state that hides its own label.**

One screen renders `bg-secondary hover:bg-secondary-fixed`. That is not adopted: white text
on `secondary-fixed` (`#7efba4`) is 1.5:1. Where the screens disagree with each other, the
one that passes AA wins.

### Status badges — the `*-fixed` family

`StatusBadge` uses the `*-fixed` tokens, **not** `*-container`:

| Tone | Background | Text | Statuses |
|---|---|---|---|
| `new` | `secondary-fixed` | `on-secondary-fixed-variant` | `PENDING` · `ACCEPTED` · `OFFER_ACCEPTED` · `WON` |
| `progress` | `primary-fixed` | `on-primary-fixed-variant` | `OFFER_SENT` · `SURVEY_COMPLETED` |
| `waiting` | `tertiary-fixed` | `on-tertiary-fixed-variant` | `SURVEY_SCHEDULED` |
| `neutral` | `surface-container-high` | `on-surface-variant` | `DECLINED` · `EXPIRED` · `LOST` · `CLOSED` |
| `cancelled` | `error-container` | `on-error-container` | `CANCELLED` |

**Why this changed.** An earlier version of this document mapped badges onto the
`*-container` family. That family is not tonally uniform in this theme:
`primary-container` (`#2c3e50`) and `tertiary-container` (`#612f00`) are dark chips with
light text, while `secondary-container` (`#7bf8a1`) is a light chip with dark text. A
request list showing `PENDING` next to `ACCEPTED` would have put orange-on-dark-brown beside
dark-green-on-light-green in the same column.

It was not a contrast failure — all three clear 4.5:1 (4.53, 4.55, 4.56). It was a
legibility failure, and the screens had already solved it: `manufacturer_portal_dashboard_final`
renders its badges as `bg-secondary-fixed`/`text-on-secondary-fixed-variant`,
`bg-primary-fixed`, `bg-tertiary-fixed` and `bg-surface-container`. The `*-fixed` family is
uniformly light-background/dark-text by construction, and every pair measures ≥ 7.2:1.
`ADR-012` says the screens win, so they do.

`offer_requests_manufacturer_portal` (an older screen) uses `bg-secondary-container/30` with
`text-secondary` for the same "New" state — a third variant, superseded by the `_final`
screen under the same rule.

### Typography

Montserrat (600/700) for headings, Inter (400/500/600) for body, data and labels. Both
self-hosted via `next/font` with Latin Extended subsets so Turkish glyphs never fall back
(`18-cms-seo.md` §Performance).

| Style | Font | Size / line | Weight | Use |
|---|---|---|---|---|
| `display-lg` | Montserrat | 48 / 56, `-0.02em` | 700 | marketing hero |
| `headline-lg` | Montserrat | 32 / 40 | 600 | page title (24/32 on mobile) |
| `headline-md` | Montserrat | 24 / 32 | 600 | section title |
| `body-lg` | Inter | 18 / 28 | 400 | lead paragraph |
| `body-md` | Inter | 16 / 24 | 400 | default body |
| `body-sm` | Inter | 14 / 20 | 400 | dense tables, help text |
| `label-md` | Inter | 12 / 16, `+0.05em` | 600 | uppercase field labels |

`label-md` uppercase is the technical register the screens use for every form label
(`WIDTH (MM)`, `SELECTED PRODUCT`). Keep it — it is what makes the portal read as an
engineering tool rather than a consumer app.

### Spacing, radius, elevation

```
spacing   xs 4 · base 8 · sm 12 · md 24 · lg 48 · xl 80 · gutter 24
          margin-mobile 16 · margin-desktop 64
radius    sm .25rem · DEFAULT .5rem · md .75rem · lg 1rem · xl 1.5rem · full 9999px
```

Elevation is tonal first: background `background`, raised surfaces
`surface-container-lowest`. One shadow only — `0 4px 12px rgba(22,40,57,.08)` — for cards,
dropdowns and modals. Data-dense tables use `1px solid outline-variant` instead of shadow.

Breakpoints: 600 / 900 / 1200.

## Density

Same tokens, two scale selections, chosen by shell (`07-frontend-architecture.md`):

| | Public / customer | Manufacturer / admin |
|---|---|---|
| Vertical rhythm | `lg` 48, `xl` 80 | `base` 8, `sm` 12 |
| Container | max 1200, 64px margins | full width, 24px gutters |
| Table row height | — | 44px, `body-sm` |
| Card radius | `lg` | `DEFAULT` |

A dashboard that breathes like the marketing page shows four rows per screen; a marketing
page as dense as the dashboard reads as cheap. This split is intentional and comes straight
from the theme's prose.

## Component base

shadcn/ui, with `components.json` pointed at the semantic tokens above. Restyle each
primitive once, centrally; never override colours at the call site.

Primitives in use: Button, Input, Select, Checkbox, Radio, Switch, Textarea, Label, Badge,
Card, Dialog, Sheet, Dropdown, Tabs, Tooltip, Toast, Table, Pagination, Skeleton, Progress,
Separator, Avatar, Calendar.

From the screens, the button contract is: primary = `secondary` background (the green) with
white text for marketing CTAs and confirmations; `primary` (navy) fill for portal primary
actions; outline = `primary` border on transparent; destructive = `error`. 8px radius, 16px
horizontal padding.

**Height: 44px below the `sm` breakpoint, 40px from `sm` up** (36px for the dense variant).
The screens specify 40px and Rule 4 below requires a 44px touch target — those contradict
each other on a phone, where the pointer is a finger. Resolution: Rule 4 wins while the
pointer is a finger, the screens win once it is a mouse. The same applies to inputs and
selects. Checkbox, radio and switch keep their drawn size and gain a 44px hit area from a
centred `::before` overlay, so the control looks 20px and behaves 44px. Verified at 375px
on `/dev/ui`: 65 interactive elements, none under 44px.

Icons: **Material Symbols Outlined**, as in every screen. Self-hosted variable font, weight
400, `FILL 0`, 24px default / 20px dense / 16px inside a 20px control. Do not mix icon sets.

The full variable font is 696 KB, which would dominate LCP on its own. The committed file is
subsetted by icon name to the glyphs actually used — 37 icons, **9.8 KB**. Adding an icon
means adding it to the list and regenerating: `src/app/[locale]/fonts/README.md` has the
command. `IconName` in `src/components/ui/icon.tsx` is the typed allowlist, so a name that
is not in the subset does not compile.

## Patterns

`src/components/patterns/` — the components that appear in more than one screen:

| Pattern | Screens |
|---|---|
| `ManufacturerCard` | matched results, directory, saved companies |
| `EstimateBand` | results, comparison, request detail |
| `StatusBadge` | every list in all three portals |
| `WizardStepper` | configurator, three stages |
| `ComparisonTable` | compare manufacturers (max 3) |
| `DataTable` | all admin and portal lists |
| `EmptyState` | dashboard empty, zero results |
| `FileDropzone` | project attachments, documents, portfolio |
| `ConsentCheckbox` | offer request (KVKK text version) |
| `TimelineItem` | request detail, audit log |
| `MetricTile` | all three dashboards |

`EstimateBand` is the one to get right first: it renders `bandLow–bandHigh`, the
"Estimated · excl. KDV" label, the "final price may change after technical inspection" note
(`PRC-04`), and the `priceOnRequest` variant. Every price a customer sees goes through it, so
the disclosure rules live in one component instead of eleven screens.

## Rules

1. No hex literals, no arbitrary Tailwind values (`text-[#162839]`), and **no raw palette
   names** (`bg-primary-container`, `hover:bg-secondary-fixed-dim`) in application code —
   semantic names only. All three are lint errors under `src/components`, and the raw-name
   list is generated from `globals.css` at lint time so it cannot drift. If no semantic name
   fits, the gap is in the semantic layer: add an alias, do not reach past it.
2. No `dark:` classes in V1. Tokens are structured so dark mode is a token-file change; the
   screens are light-only and shipping a half-done dark mode is worse than none.
3. Every interactive element has a visible focus ring: 2px `primary`, 2px offset.
4. Minimum touch target 44px; `body-sm` is the smallest text on any interactive surface.
5. Contrast AA against the surface it sits on. **Measured, not guessed**: `/dev/tokens`
   computes every pair in `src/lib/design-tokens.ts` and `design-tokens.test.ts` fails the
   build if one regresses. Current state: 24 audited pairs, 24 pass.

   Two corrections from the first measurement:

   - The pairing this rule used to name as "most likely to fail" —
     `on-surface-variant` on `surface-container-low` — is **8.49:1**, one of the
     comfortable ones. The palette's text roles are not where the risk is.
   - The real failure is a *boundary*, not text: `outline-variant` is **1.61:1**, which is
     why §Semantic mapping now splits `divider` from `control-border`.

   When adding a colour pair, add it to `contrastPairs` in the same PR. A pair that is
   deliberately exempt is marked `decorative` and still shown with its measured ratio —
   "decorative" has to be a decision someone made, not a label attached to whatever failed.
6. Loading states are skeletons matching the final layout, not spinners
   (`finding_manufacturers_loading_state`, `offer_results_loading_state`).
7. `prefers-reduced-motion` disables transitions; motion is never the only signal.

## Migrating a Stitch screen into the app

1. Open `code.html` and `screen.png` for the screen named in the route map.
2. Identify existing patterns and primitives; only what appears three times becomes a new
   pattern.
3. Rebuild with tokens — copy layout and hierarchy, never the CDN Tailwind config, the
   inline `<script>`, or the `googleusercontent` image URLs.
4. Replace English copy with `next-intl` keys; `en.json` takes the screen copy, `tr.json` is
   authored (`07-frontend-architecture.md` §i18n).
5. Add the states the mockup omits: loading, empty, error, permission-denied.
6. Check both locales, both densities, 375px width, and keyboard-only navigation.
