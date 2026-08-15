---
name: Emerald & Iron
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#404944'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#707974'
  outline-variant: '#bfc9c3'
  surface-tint: '#2b6954'
  primary: '#003527'
  on-primary: '#ffffff'
  primary-container: '#064e3b'
  on-primary-container: '#80bea6'
  inverse-primary: '#95d3ba'
  secondary: '#5d5e61'
  on-secondary: '#ffffff'
  secondary-container: '#e2e2e5'
  on-secondary-container: '#636467'
  tertiary: '#2b2f33'
  on-tertiary: '#ffffff'
  tertiary-container: '#414549'
  on-tertiary-container: '#afb2b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b0f0d6'
  primary-fixed-dim: '#95d3ba'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#0b513d'
  secondary-fixed: '#e2e2e5'
  secondary-fixed-dim: '#c6c6c9'
  on-secondary-fixed: '#1a1c1e'
  on-secondary-fixed-variant: '#454749'
  tertiary-fixed: '#e0e3e8'
  tertiary-fixed-dim: '#c3c7cc'
  on-tertiary-fixed: '#181c20'
  on-tertiary-fixed-variant: '#43474b'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  warm-grey: '#71717A'
  off-white: '#FDFDFD'
  data-teal: '#0D9488'
  status-success: '#059669'
  status-pending: '#D97706'
  status-alert: '#DC2626'
  status-neutral: '#52525B'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: 0.02em
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: 0.01em
  headline-sm:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-sm:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-caps:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.12em
  label-md:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter-desktop: 32px
  margin-desktop: 64px
  column-gap: 24px
  section-gap: 80px
  unit-xs: 4px
  unit-sm: 8px
  unit-md: 16px
  unit-lg: 24px
---

## Brand & Style

The design system is engineered for a premium architectural marketplace, prioritizing precision, structural integrity, and high-end aesthetics. It targets architects, manufacturers, and developers who value clarity and professional-grade tooling.

The visual style is **Architectural Minimalism**. It utilizes heavy whitespace to allow high-resolution imagery and technical data to breathe. The interface mimics the rhythmic patterns found in modern blueprints—relying on alignment, intentional voids, and a restrained color palette to convey authority. The emotional response is one of calm control, high-status professionalism, and absolute reliability.

## Colors

The palette is rooted in a high-contrast, low-saturation "Emerald and Iron" concept.

- **Primary Emerald (#064E3B):** Reserved for high-intent actions, active navigation states, and brand signatures. It represents the "outdoor" aspect of the architectural exchange.
- **Deep Charcoal (#1A1C1E):** Used for primary text and structural UI elements to provide a weighted, grounded feel.
- **Neutral Scale:** Utilizes `off-white` for large surfaces and `warm-grey` for secondary information to maintain a high-end, sophisticated warmth rather than clinical coldness.
- **Analytics & Data:** Use the Primary Emerald as the lead data color, complemented by `data-teal` for secondary variables to maintain a monochromatic, professional harmony.

## Typography

The typographic system exclusively uses **Montserrat** to ensure a cohesive, geometric, and modern identity across both display and technical data.

- **Generous Spacing:** Headlines and `label-caps` utilize expanded letter-spacing to evoke a sense of "luxury space" and architectural clarity.
- **Hierarchy:** Technical data and labels should favor the `label-caps` style for headers and `body-sm` for values to maintain a blueprint-like precision.
- **Contrast:** Always use Deep Charcoal for headings to ensure maximum readability against off-white backgrounds.

## Layout & Spacing

This design system is optimized for desktop usage, employing a **12-column fixed grid** with a maximum content width of 1440px.

- **Grid Dynamics:** Use 32px gutters for marketing and public pages to maximize whitespace. For dense manufacturer dashboards, gutters can be reduced to 24px.
- **Rhythm:** All internal spacing must follow an 8px base unit. 
- **Editorial Feel:** Large 64px outer margins are required to prevent content from crowding the screen edges, maintaining the "premium marketplace" aesthetic.
- **Sectioning:** Use `section-gap` (80px) to clearly define different functional areas on a page, allowing the architectural "voids" to guide the user's eye.

## Elevation & Depth

To maintain the minimal architectural feel, the system avoids heavy drop shadows in favor of **Tonal Layers** and **Crisp Outlines**.

- **Surface Tiers:** Public-facing cards use a very soft, ambient shadow (Deep Charcoal at 4% opacity, 20px blur) to appear "floated" over the background. 
- **Dashboard Flatness:** Manufacturer and admin views should remove shadows entirely, using 1px borders (#E5E7EB) to define functional zones.
- **Interactive Depth:** Elements like dropdowns or modals use a slightly more defined shadow to indicate they are on the highest z-index, but should remain diffused and tinted with the Deep Charcoal color.

## Shapes

The shape language is **Technical and Precise**. 

- **Standard Radius:** 4px (Soft) is applied to all buttons, inputs, and chips. This provides a professional, "engineered" look that is softer than a hard 90-degree angle but far more serious than a rounded pill.
- **Card Consistency:** While standard components use 4px, larger architectural gallery containers may use 8px (`rounded-lg`) to gently frame high-resolution photography without losing the geometric edge.

## Components

### Buttons
- **Primary:** Solid Deep Emerald background with White text. 4px radius. 
- **Secondary (Outline):** 1px Deep Charcoal border, transparent background.
- **Ghost:** No border or background. Emerald text on hover.
- **Icon-only:** Used for gallery controls or table actions; 1px border with Deep Charcoal icons.

### Inputs & Dropdowns
- **Styling:** Minimalist 1px borders in `warm-grey` (low opacity). 
- **States:** Focus state uses a 1px Primary Emerald border. Labels should be `label-caps` and placed above the input field for maximum clarity.

### Cards
- **Public Cards:** Elevated with subtle ambient shadows and 8px radius.
- **Dashboard Cards:** Flat with 1px `warm-grey` borders and 4px radius.

### Tables
- **Manufacturer Views:** High-density with 40px row heights. 
- **Styling:** Use clear zebra striping (Off-White and White) or 1px dividers. Header text must be `label-caps`.

### Status Chips
- **Aesthetic:** Desaturated backgrounds (10% opacity) with high-contrast text using the semantic color palette (e.g., Success-Green, Alert-Red).

### Specialized Components
- **Architectural Gallery:** Full-bleed imagery with minimal overlay controls and 1px white borders for internal thumbnails.
- **Price Displays:** Use `headline-md` for the amount. The currency symbol should be smaller and lighter in weight to emphasize the numerical value.
- **Project Timelines:** A vertical 2px Charcoal line with Emerald nodes for completed stages and outlined nodes for pending stages.