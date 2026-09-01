---
name: Architectural Precision
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#43474c'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#74777d'
  outline-variant: '#c4c6cd'
  surface-tint: '#4e6073'
  primary: '#011323'
  on-primary: '#ffffff'
  primary-container: '#162839'
  on-primary-container: '#7d8fa4'
  inverse-primary: '#b6c8df'
  secondary: '#006d37'
  on-secondary: '#ffffff'
  secondary-container: '#98f3af'
  on-secondary-container: '#0b723b'
  tertiary: '#1e0f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#362309'
  on-tertiary-container: '#a68967'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4fb'
  primary-fixed-dim: '#b6c8df'
  on-primary-fixed: '#0a1d2d'
  on-primary-fixed-variant: '#37485b'
  secondary-fixed: '#9bf6b2'
  secondary-fixed-dim: '#80d997'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005228'
  tertiary-fixed: '#ffddb7'
  tertiary-fixed-dim: '#e2c19b'
  on-tertiary-fixed: '#291802'
  on-tertiary-fixed-variant: '#594226'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-xl:
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
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin: 32px
---

## Brand & Style
The design system is rooted in the principles of modern architectural drafting: clarity, structural integrity, and intentionality. It targets architects, contractors, and landscape designers who require factual data and professional reliability. 

The visual style is **Corporate Modern with Minimalist influences**. It prioritizes high legibility and generous whitespace to mimic the "breathing room" of a well-planned site map. Elements are grounded and stable, avoiding trendy decorations in favor of a utilitarian elegance that feels both premium and dependable.

## Colors
The palette is dominated by **Deep Navy (#162839)**, providing an authoritative anchor reminiscent of traditional blueprints and heavy steel. **Forest Green (#006d37)** is used for secondary actions and success states, reflecting the "outdoor" and "living" nature of the products. 

**Amber (#f78b30)** serves as a high-visibility accent for calls-to-action or critical highlights, ensuring they stand out against the cooler primary tones. The background remains a crisp, gallery-like light grey to ensure product photography and technical specs remain the focal point.

## Typography
This design system utilizes a dual-type approach. **Montserrat** provides a geometric, sturdy presence for headings, echoing the bold lettering found in architectural logos and signage. **Inter** is employed for all functional and body text due to its exceptional clarity in technical data environments.

- **Headlines:** Use Montserrat with tight letter-spacing for a modern, high-end feel.
- **Body Text:** Use Inter for all product descriptions and technical specifications.
- **Labels:** Small labels and metadata should use uppercase Inter with increased letter spacing to maintain legibility at small scales.

## Layout & Spacing
The layout follows a **Fluid Grid** philosophy with fixed maximum widths for content containers on desktop (1280px). A strict 8px baseline grid ensures vertical rhythm.

- **Desktop:** 12-column grid with 24px gutters. Use large `xl` (80px) vertical spacing between major sections to emphasize the "calm" brand personality.
- **Tablet:** 8-column grid with 24px gutters and 24px side margins.
- **Mobile:** 4-column grid with 16px gutters and 16px side margins. Large headlines should scale down to `headline-md` equivalents.

## Elevation & Depth
Depth is achieved through **Low-contrast outlines** and **Restrained shadows**. Instead of heavy shadows, the system uses the `surface-variant` color for background layering and 1px `outline` (#74777d) with low opacity to define boundaries.

When elevation is required (e.g., a modal or an active card), use a single, highly diffused shadow: `0px 4px 20px rgba(22, 40, 57, 0.08)`. This "tinted shadow" uses the Primary color as its base to keep the UI grounded and cohesive.

## Shapes
The shape language is **Rounded**, utilizing a consistent 8px (`0.5rem`) radius across buttons, input fields, and cards. This softens the "industrial" nature of the content, making the professional marketplace feel accessible.

- **Small elements (Checkboxes):** 4px radius.
- **Standard elements (Buttons/Inputs/Cards):** 8px radius.
- **Large containers (Hero sections):** 16px radius or sharp edges where they bleed to the screen edge.

## Components
- **Buttons:** Primary buttons use the Deep Navy background with white text. Secondary buttons use an outline style with the Primary color. The Accent color is reserved for "Buy" or "Contact Architect" actions.
- **Cards:** White surface with an 8px radius and a subtle 1px `outline`. Use the restrained shadow only on hover to indicate interactivity.
- **Input Fields:** Use a 1px `outline` border. On focus, the border weight increases to 2px using the Primary color.
- **Chips:** Used for material categories (e.g., "Steel", "Cedar"). These should use the `surface-variant` background with `body-sm` text.
- **Lists:** Technical spec lists should use a subtle horizontal divider in `surface-variant` with generous vertical padding (16px) between items.
- **Icons:** Use **Material Symbols** (Rounded style) with a "Weight" of 300 for a precise, technical appearance that doesn't overwhelm the text.