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

Defined once as CSS custom properties on `:root` in `src/app/globals.css`, consumed by
Tailwind via `theme.extend`. Never a hex literal in a component.

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
| warning / highlight badge | `tertiary-container` |
| destructive | `error` |
| border, divider | `outline-variant` |
| muted text | `on-surface-variant` |

Status colours for `StatusBadge`, derived not invented:
`PENDING` → `tertiary-container`, `ACCEPTED`/`WON` → `secondary-container`,
`DECLINED`/`EXPIRED`/`LOST` → `surface-container-high`, `OFFER_SENT` → `primary-container`,
`CANCELLED` → `error-container`.

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
horizontal padding, 40px height (36px in dense shells).

Icons: **Material Symbols Outlined**, as in every screen. Self-hosted variable font, weight
400, `FILL 0`, 24px default / 20px dense. Do not mix icon sets.

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

1. No hex literals, no arbitrary Tailwind values (`text-[#162839]`) in application code.
2. No `dark:` classes in V1. Tokens are structured so dark mode is a token-file change; the
   screens are light-only and shipping a half-done dark mode is worse than none.
3. Every interactive element has a visible focus ring: 2px `primary`, 2px offset.
4. Minimum touch target 44px; `body-sm` is the smallest text on any interactive surface.
5. Contrast AA against the surface it sits on — check `on-surface-variant` (`#43474c`) on
   `surface-container-low`, which is the pairing most likely to fail.
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
