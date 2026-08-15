---
name: Architectural Excellence
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
  inverse-on-surface: '#f0f1f1'
  outline: '#707974'
  outline-variant: '#bfc9c3'
  surface-tint: '#2b6954'
  primary: '#003527'
  on-primary: '#ffffff'
  primary-container: '#064e3b'
  on-primary-container: '#80bea6'
  inverse-primary: '#95d3ba'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#252f3c'
  on-tertiary: '#ffffff'
  tertiary-container: '#3b4553'
  on-tertiary-container: '#a8b2c3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b0f0d6'
  primary-fixed-dim: '#95d3ba'
  on-primary-fixed: '#002117'
  on-primary-fixed-variant: '#0b513d'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#d9e3f4'
  tertiary-fixed-dim: '#bdc7d8'
  on-tertiary-fixed: '#121c28'
  on-tertiary-fixed-variant: '#3e4755'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  surface-border: '#e5e7eb'
  text-muted: '#6b7280'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0.01em
  body-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Montserrat
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  section-gap: 80px
---

## Brand & Style

The design system is engineered for a premium architectural marketplace, bridging the gap between raw natural landscapes and structural precision. The personality is defined by **Premium Trust, Technology, and Professionalism**. 

The design style is **Minimalism** with a **Corporate / Modern** influence. It prioritizes clarity, utilizing generous whitespace and a rigid structural alignment to evoke a high-end, editorial feel. The aesthetic is intentionally "under-designed" to allow architectural photography and technical details to stand out. Visuals are clean, high-contrast, and avoid any decorative clutter like gradients or rounded "bubbly" elements, instead favoring sharp geometry and subtle, deliberate elevation.

## Colors

The palette is anchored by **Emerald Green**, a deep, sophisticated accent that represents both nature and the precision of architectural design. This is used sparingly for primary calls to action and key indicators.

**Charcoal** serves as the secondary color, providing a strong, structural foundation for typography and primary UI elements. The background is a clean **Off-White**, which provides a softer, more premium experience than pure white.

Greyscale tones are used to create hierarchy:
- **Primary Text:** Charcoal (#1a1a1a) for maximum legibility and authority.
- **Secondary Text:** Slate Gray (#4b5563) for subheadings and metadata.
- **Borders:** Soft, low-contrast grays to define zones without breaking the visual flow.

## Typography

This design system uses **Montserrat** exclusively to maintain a cohesive, geometric, and architectural appearance. The hierarchy is "top-heavy," with bold, structural headings that command attention.

- **Intentional Tracking:** Display and Headline levels use tighter tracking (-0.02em) to feel more cohesive and "built." Smaller labels use increased tracking (0.1em) and uppercase styling to evoke technical blueprints and professional labeling.
- **Hierarchy:** Body text is set with generous line heights (1.6) to ensure readability against complex architectural specifications.
- **Mobile Adaptation:** Headlines scale down significantly to ensure structural integrity on smaller screens without excessive line-breaking.

## Layout & Spacing

The layout is built on a **Fixed 12-column grid** for desktop, ensuring that content alignment feels intentional and rigid, much like a floor plan.

- **Desktop (1200px+):** 64px outer margins with 24px gutters. Content is often centered with significant whitespace on the flanks to emphasize a "gallery" feel.
- **Tablet (600px - 1199px):** Transitions to a fluid 8-column grid with 32px margins.
- **Mobile (<600px):** 4-column fluid grid with 16px margins to maximize screen real estate for imagery.

Vertical rhythm is governed by a 4px baseline unit, with standard section gaps of 80px to create a sense of luxury and breathing room.

## Elevation & Depth

To maintain a high-end architectural look, depth is communicated through **Soft, Ambient Shadows** and **Tonal Layering**.

- **Shadows:** Use extremely low-density, diffused shadows. Avoid harsh blacks; instead, use a faint charcoal tint (e.g., `rgba(26, 26, 26, 0.04)`). The goal is to make elements look like they are resting lightly on a surface, not floating far above it.
- **Low-Contrast Outlines:** For technical data and input areas, use subtle 1px borders (#e5e7eb) instead of shadows to maintain a "blueprint" clarity.
- **Tonal Layers:** Primary content sits on the off-white background, while interactive elements like modals or active cards use a pure white (#ffffff) surface to provide a subtle lift.

## Shapes

The shape language is **Soft (0.25rem)**. This subtle rounding maintains a crisp, professional edge that reflects physical materials like cut stone or steel beams, while avoiding the clinical coldness of perfectly sharp 0px corners.

- **Standard Elements:** Buttons, inputs, and cards use the base 4px (0.25rem) radius.
- **Large Containers:** Section containers or hero image blocks may scale up to 8px (0.5rem) to provide a slightly softer frame for high-impact photography.

## Components

- **Buttons:** Primary buttons are solid Emerald Green with white text. They are wide with generous horizontal padding (32px) and no icons unless strictly necessary for navigation. Secondary buttons use a Charcoal outline.
- **Cards:** Product and project cards use a pure white background with a subtle ambient shadow. Images should be full-bleed to the top and sides of the card.
- **Input Fields:** Labels are always positioned above the field using the `label-caps` style. Fields have a 1px soft gray border and 12px vertical padding.
- **Chips/Status:** For availability or material types, use a "ghost" style—light gray background with Charcoal text and no border.
- **Iconography:** Use light-weight (1.5px or 2px) linear icons. Icons must be geometric and strictly functional, never decorative.
- **Lists:** Technical specs should be presented in a clean, striped list format using alternating off-white and pure white backgrounds to ensure clarity in complex data sets.