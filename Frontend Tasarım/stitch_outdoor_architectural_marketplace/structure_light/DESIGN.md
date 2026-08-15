---
name: Structure & Light
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#404944'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#707974'
  outline-variant: '#bfc9c3'
  surface-tint: '#2b6954'
  primary: '#003527'
  on-primary: '#ffffff'
  primary-container: '#064e3b'
  on-primary-container: '#80bea6'
  inverse-primary: '#95d3ba'
  secondary: '#6b5e2b'
  on-secondary: '#ffffff'
  secondary-container: '#f4e2a2'
  on-secondary-container: '#716430'
  tertiary: '#2e2e2e'
  on-tertiary: '#ffffff'
  tertiary-container: '#454444'
  on-tertiary-container: '#b3b1b1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b0f0d6'
  primary-fixed-dim: '#95d3ba'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#0b513d'
  secondary-fixed: '#f4e2a2'
  secondary-fixed-dim: '#d7c689'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#524616'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474746'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
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
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1440px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
  unit-xs: 4px
  unit-sm: 8px
  unit-md: 16px
  unit-lg: 24px
  unit-xl: 48px
---

## Brand & Style

The design system is engineered for a premium architectural SaaS environment, prioritizing precision, structural integrity, and high-end aesthetics. It targets architects, manufacturers, and outdoor space developers who value clarity and professional-grade tooling.

The visual style is **Architectural Minimalism**. It utilizes heavy whitespace to allow high-resolution imagery and technical data to breathe. The interface mimics the rhythmic patterns found in modern blueprints and high-end building facades—relying on alignment, intentional voids, and a restrained color palette to convey authority. The emotional response should be one of calm control, high-status professionalism, and absolute reliability.

## Colors

This color palette is rooted in the "Emerald and Iron" concept. 

- **Primary Emerald (#064e3b):** Reserved for high-intent actions, active navigation states, and brand signatures. It represents growth and the "outdoor" aspect of the exchange.
- **Secondary Gold (#b3a369):** A muted, metallic gold used sparingly for "Premium" or "Verified" badges and subtle high-end accents.
- **Charcoal & Off-White:** The core structural colors. Charcoal (#1a1a1a) is used for primary text and dark-themed surfaces, while Off-White (#f9f9f9) provides a subtle contrast to pure white backgrounds to reduce eye strain in data-heavy views.
- **Semantic Tones:** These are desaturated to maintain the minimalist aesthetic, ensuring alerts do not disrupt the sophisticated visual harmony.

## Typography

The typographic system utilizes **Montserrat** for structural elements and **Hanken Grotesk** for functional reading.

- **Headlines:** Set with generous letter spacing to evoke a sense of "luxury space." Headlines are always high-contrast against the background.
- **Labels:** The `label-caps` style is used for section headers and table headers to provide an architectural, blueprint-like feel.
- **Body Text:** Hanken Grotesk is chosen for its modern, clean apertures which maintain legibility in dense manufacturer data tables.
- **Scale:** Maintain a strict 4px or 8px baseline grid for all type alignments to ensure visual precision.

## Layout & Spacing

This design system uses a **12-column fluid grid** for desktop and a **4-column grid** for mobile. 

- **Desktop Layout:** Content should be centered within a 1440px max-width container. Use 64px outer margins to create an "editorial" feel that avoids crowding the screen edges.
- **The 8px Rhythm:** All spacing between elements must be a multiple of 8px. Use `unit-xl` (48px) for separating major sections (e.g., between a hero section and a product grid).
- **Data Density:** In admin or manufacturer views, spacing can be compressed to `unit-sm` (8px) for table rows, but should never compromise the "architectural" clarity of the design.

## Elevation & Depth

To maintain a minimalist architectural feel, the design system avoids heavy shadows in favor of **Tonal Layers** and **Low-Contrast Outlines**.

- **Surfaces:** Use `#f9f9f9` (Surface-Dim) for background regions to separate them from `#ffffff` (Card/Surface) elements.
- **Borders:** Instead of shadows, use 1px borders in `#e5e7eb` to define containers.
- **Elevation Shadows:** Only use shadows for floating elements like Modals or Dropdowns. These should be "Ambient Shadows"—extremely diffused, using the charcoal color at 4%–8% opacity with a large blur radius (20px+) and 0px spread.
- **Interactions:** On hover, a card may transition from a 1px border to a subtle 2px Primary Emerald border to indicate focus without shifting the layout.

## Shapes

The shape language is **Soft-Structural**. 

- **Base Radius:** 4px is the standard for buttons, inputs, and small components. This provides a professional, precise "engineered" look that is softer than a hard 90-degree angle but more serious than a fully rounded pill.
- **Container Radius:** Use 8px for larger cards and project summaries.
- **Interactive Elements:** Checkboxes and radio buttons follow the 4px rule.

## Components

### Buttons
- **Primary:** Solid Emerald (#064e3b) with White text. 4px radius. Bold Montserrat caps for the label.
- **Secondary:** Solid Charcoal (#1a1a1a) for high-contrast utility actions.
- **Outline:** 1px Charcoal border with transparent background.
- **Ghost:** No border or background; text turns Emerald on hover. Used for tertiary actions.

### Inputs & Selects
- **Styling:** 1px border (#e5e7eb), 4px radius, 16px horizontal padding.
- **Focus State:** 1px Primary Emerald border with a subtle 2px emerald glow (opacity 10%).
- **Dropdowns:** Use the Charcoal color for text; include a custom chevron icon that is thin and geometric.

### Cards
- **Project Cards:** 1px border, 8px radius. Full-bleed imagery at the top. Use `label-caps` for the category (e.g., "LANDSCAPE") and `headline-md` for the title.
- **Product Cards:** Minimalist. Product image on a light gray background, followed by price and manufacturer name in `body-sm`.

### Data Tables
- **Header:** Background `#f9f9f9`, `label-caps` typography, 1px bottom border.
- **Rows:** 1px subtle bottom border. High density (48px row height) for manufacturer data.

### Specialized Components
- **Price Displays:** Use `headline-md` with Montserrat. The currency symbol should be slightly smaller and superscripted for a refined look.
- **Project Timeline:** A vertical 2px line in Charcoal. Completed steps use the Emerald Primary dot; upcoming steps use an outlined dot.
- **File Upload:** A dashed 1px border area in Emerald-Light (10% opacity). Use a "cloud-upload" icon in Emerald.
- **Badges:** Small, 2px radius. "Verified" badges use the Secondary Gold color with white text. "Status" badges use desaturated semantic colors.