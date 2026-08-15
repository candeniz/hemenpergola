/** Tailwind 4: the PostCSS plugin is the whole build step; there is no tailwind.config.ts.
 *  Tokens live in src/app/globals.css under `@theme` (22-design-system.md §Tokens). */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
