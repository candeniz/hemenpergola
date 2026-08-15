---
name: Architectural Outdoor Exchange
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
  primary: '#162839'
  on-primary: '#ffffff'
  primary-container: '#2c3e50'
  on-primary-container: '#96a9be'
  inverse-primary: '#b5c8df'
  secondary: '#006d37'
  on-secondary: '#ffffff'
  secondary-container: '#7bf8a1'
  on-secondary-container: '#007239'
  tertiary: '#411d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#612f00'
  on-tertiary-container: '#f78b30'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d1e4fb'
  primary-fixed-dim: '#b5c8df'
  on-primary-fixed: '#091d2e'
  on-primary-fixed-variant: '#36485b'
  secondary-fixed: '#7efba4'
  secondary-fixed-dim: '#61de8a'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005228'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb783'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#713700'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
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
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style

The design system is rooted in the intersection of structural engineering and natural landscapes. It targets architects, developers, and premium manufacturers, requiring a UI that feels as stable and deliberate as the products it showcases.

The design style is **Corporate / Modern** with a **Minimalist** focus on white space. It prioritizes clarity and high-quality imagery of architectural installations. The aesthetic avoids unnecessary decoration, instead using precision, structural alignment, and generous breathing room to convey expertise. The emotional goal is to provide a sense of "built to last" reliability through technical precision and premium finishing.

## Colors

The palette is anchored by **Deep Slate (#2C3E50)**, used for structural elements, headers, and primary text to evoke the feeling of steel and stone. 

**Outdoor Green (#27AE60)** is used exclusively for primary actions, success states, and indicating ecological certifications. 

**Terracotta (#E67E22)** serves as a warm accent for highlights, specific architectural callouts, or "Natural Material" badges, providing a human-centric contrast to the cooler slate and green.

Backgrounds utilize **Light Gray (#F8F9FA)** to differentiate content sections without the harshness of pure white, while keeping the interface feeling open and modern.

## Typography

This design system uses a dual-font strategy to balance marketing impact with technical utility. 

**Montserrat** is used for headlines to provide a confident, geometric, and architectural feel. Its bold weights reflect the strength of physical structures.

**Inter** is utilized for all body copy, technical specifications, and data-heavy labels. Its neutral, systematic nature ensures high legibility when architects are comparing complex dimensions or material grades.

For mobile, large headlines scale down to prevent excessive wrapping, while body sizes remain consistent to maintain readability.

## Layout & Spacing

The layout utilizes a **Fluid Grid** model with a distinct shift in density based on the user's role:

1.  **Customer/Public Experience:** Employs a wide-margin 12-column grid with `lg` (48px) and `xl` (80px) vertical rhythm to create a premium, gallery-like experience.
2.  **Manufacturer/Admin Dashboard:** Shifts to a high-density model using the `base` (8px) and `sm` (12px) increments to maximize the visibility of technical data, order tables, and inventory management.

Breakpoints follow standard patterns (600px, 900px, 1200px). On mobile, margins shrink to 16px to maximize horizontal space for product diagrams.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layers** and **Ambient Shadows**. 

The background uses the neutral light gray, while interactive components like cards and modals sit on white surfaces. To signify elevation, use a soft, highly-diffused shadow with a slight Deep Slate tint (e.g., `box-shadow: 0 4px 12px rgba(44, 62, 80, 0.08)`).

For secondary technical information, use **low-contrast outlines** (1px solid #E9ECEF) instead of shadows to keep the interface clean and avoid visual clutter in data-heavy views.

## Shapes

The design system uses a **Rounded** shape language to soften the industrial nature of the products. 

A consistent 8px (`0.5rem`) corner radius is applied to buttons, input fields, and product cards. This strikes a balance between the precision of architecture and the approachability of a modern digital marketplace. Larger components, like container cards or hero image blocks, may use `rounded-lg` (16px) to define distinct sections of the page.

## Components

- **Buttons:** Primary buttons use the Outdoor Green background with white text. Secondary buttons use a Deep Slate outline. Use 8px rounded corners and 16px horizontal padding.
- **Input Fields:** Use white backgrounds with a 1px border of light gray. Labels should use `label-md` for a technical, precise appearance.
- **Product Cards:** Feature a white surface with the ambient shadow defined in Elevation. Images should have a 0px top-radius to flush with the card top, while the bottom of the card maintains the 8px radius.
- **Chips/Badges:** Use small, 4px rounded corners and a background tint derived from the color (e.g., a 10% opacity Green for "In Stock").
- **Data Tables:** For the admin side, remove shadows and use light gray horizontal dividers only. This ensures the "High-Density" requirement is met without visual noise.
- **Iconography:** Use a "Linear" style with a 2px stroke weight. Icons should be functional and geometric, avoiding overly decorative or "bubbly" styles.