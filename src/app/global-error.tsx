'use client'

/*
 * `I18N-01`'s lint rule, disabled for this file only, with the argument in the docblock
 * below: `NextIntlClientProvider` lives inside the layout that has just failed, so there is
 * no catalogue to read and no resolved locale to read it with. Both languages are shown
 * instead of guessing one. The rule is right everywhere else — this is the one page that
 * must render when nothing else does.
 */
/* eslint-disable react/jsx-no-literals */

/**
 * The last resort — task 14.2.
 *
 * `[locale]/error.tsx` catches a throw inside the locale layout. This catches a throw **in
 * that layout itself**, which is why it renders its own `<html>` and `<body>`: at this point
 * nothing above it rendered, and there is no shell to sit in.
 *
 * ## The one place `I18N-01` cannot hold, and why
 *
 * `CLAUDE.md` §Conventions and `I18N-01` say no hardcoded user-facing strings. Here it is
 * structural rather than a shortcut: `NextIntlClientProvider` lives inside the layout that
 * just failed, so there is no catalogue, and there is no resolved locale to pick one with —
 * `params` never reached a component. Reading `navigator.language` would guess, and guessing
 * wrong on the one page that exists to be honest is worse than showing both.
 *
 * So: **both languages, three short lines, no design system**. The tokens come from
 * `globals.css`, which is imported by the failed layout and therefore unavailable too, so
 * the colours are inline literals — the only file in the repository where that is true, and
 * the reason is that a stylesheet is one more thing that can be missing when this renders.
 * Recorded in `25-progress.md` (14.2) so the next reader does not take it as licence.
 *
 * It is deliberately unstyled beyond legibility. A polished page here would be a page that
 * depends on more machinery, which is the opposite of what a last resort is for.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f8f9fa',
          color: '#191c1d',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 8px' }}>Bir şeyler ters gitti</h1>
          <p style={{ margin: '0 0 24px', color: '#43474c' }}>
            Sorun bizim tarafımızda. Tekrar denemek çoğu zaman işe yarar.
          </p>

          <h2 style={{ fontSize: '1.25rem', margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 24px', color: '#43474c' }}>
            The problem is on our side. Trying again usually works.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: '44px',
              padding: '0 24px',
              border: 0,
              borderRadius: '8px',
              background: '#162839',
              color: '#ffffff',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Tekrar dene · Try again
          </button>

          {error.digest === undefined ? null : (
            <p style={{ marginTop: '24px', fontSize: '0.875rem', color: '#74777d' }}>
              {`Referans / Reference: ${error.digest}`}
            </p>
          )}
        </main>
      </body>
    </html>
  )
}
