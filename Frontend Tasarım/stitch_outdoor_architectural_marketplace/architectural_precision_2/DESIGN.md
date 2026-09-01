---
name: Architectural Precision
colors:
  surface: '#ffffff'
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
  secondary-container: '#7bf8a1'
  on-secondary-container: '#00210c'
  tertiary: '#220c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#411d00'
  on-tertiary-container: '#d87316'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#410002'
  primary-fixed: '#d2e4fb'
  primary-fixed-dim: '#b6c8df'
  on-primary-fixed: '#0a1d2d'
  on-primary-fixed-variant: '#37485b'
  secondary-fixed: '#9bf6b2'
  secondary-fixed-dim: '#80d997'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005228'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb784'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#713700'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
  warning: '#f78b30'
  warning-container: '#ffdfc0'
  on-warning-container: '#2b1700'
  text-main: '#191c1d'
  text-muted: '#43474c'
typography:
  headline-xl:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
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
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
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
  sidebar-width: 280px
  gutter: 24px
  margin-desktop: 32px
  margin-mobile: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style
The design system is rooted in the principles of modern architectural drafting: clarity, structural integrity, and intentionality. It targets professionals—architects, contractors, and landscape designers—who require factual data and professional reliability. 

The visual style is **Corporate Modern with Minimalist influences**. It prioritizes high legibility and generous whitespace to mimic the "breathing room" of a well-planned site map. Elements are grounded and stable, avoiding trendy decorations in favor of a utilitarian elegance that feels both premium and dependable. The customer dashboard should feel like a mission-control center: organized, hierarchical, and precise.

## Colors
The palette is anchored by **Deep Navy**, providing an authoritative tone reminiscent of technical blueprints. **Forest Green** and its associated light container are used for secondary actions and verified status states. 

A specific **Warning/Amber** tier is introduced for "Not Verified" or pending states, ensuring visibility without the alarm of a full error. Backgrounds use a very light grey to maintain a "gallery" feel, while the dashboard sidebar should utilize the **Deep Navy** or **Surface Variant** to create clear structural separation from the main content canvas.

## Typography
This design system utilizes a dual-type approach. **Montserrat** provides a geometric, sturdy presence for headings, echoing the bold lettering found in architectural logos and signage. **Inter** is employed for all functional and body text due to its exceptional clarity in technical data environments.

- **Headlines:** Use Montserrat with semi-bold weights for a modern, high-end feel.
- **Body Text:** Use Inter for all product descriptions and technical specifications.
- **Labels:** Dashboard labels and metadata should use `label-md` with increased letter spacing to maintain legibility at small scales.

## Layout & Spacing
The layout follows a **sidebar-based dashboard model**. The content area is fluid but maintains structural alignment with a strict 8px baseline grid.

- **Sidebar:** Fixed at 280px width on desktop. It should be persistent or collapsible into a rail.
- **Main Canvas:** 12-column fluid grid. On desktop, use a 24px gutter.
- **Form Factors:** On mobile, the sidebar transitions to a bottom sheet or a full-screen drawer. Margins reduce to 16px to maximize data density.
- **Reflow:** Cards within the dashboard should stack vertically on mobile and span across the grid in 2, 3, or 4 columns on desktop depending on data complexity.

## Elevation & Depth
Hierarchy is primarily conveyed through **Tonal Layers** and **Restrained Shadows**. 

The background uses `neutral` (#f8f9fa), while cards and the main dashboard container use `surface` (#ffffff). To define depth without clutter, use a single, diffused shadow for elevated elements (like modals or active cards): `0px 4px 20px rgba(22, 40, 57, 0.08)`. For standard separation, prefer a 1px `outline` (#74777d) at 12% opacity over heavy shadows.

## Shapes
The shape language is consistently **Rounded** (8px / 0.5rem) to balance the clinical nature of technical data with a modern, approachable feel.

- **Small UI elements:** Checkboxes and status dots use a 4px radius.
- **Standard elements:** Dashboard cards, input fields, and buttons use the base 8px radius.
- **Navigation:** Sidebar active state indicators (the "pill" highlight) should use a fully rounded/pill shape on one side to indicate directionality.

## Components
- **Dashboard Shell:** The sidebar uses a `primary` or `surface-variant` background. Navigation items utilize `label-lg` typography with 16px horizontal padding.
- **Status Variants:** 
    - **Verified:** `secondary-container` background with `on-secondary-container` text. 
    - **Not Verified/Warning:** `warning-container` background with `on-warning-container` text.
    - **Error:** `error-container` background with `on-error-container` text.
- **Buttons:** Primary buttons are solid Deep Navy. Secondary buttons use the `outline` token with `text-main`.
- **Input Fields:** 1px `outline` border that transitions to a 2px `primary` border on focus.
- **Cards:** White surface with an 8px radius. Use for grouping dashboard modules like "Recent Projects" or "Account Overview."
- **Data Tables:** Use `surface-variant` for header backgrounds and a simple 1px horizontal divider between rows.