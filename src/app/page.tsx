// Deliberately plain. Design tokens (0.9), shells (0.12) and next-intl (0.13) each
// replace part of this page; half-doing any of them now would be undone then.
//
// `{brand}` is a placeholder, not a name: Q1 in 25-progress.md is undecided and its
// documented default is exactly this token.
export default function Page() {
  return (
    <main>
      <h1>{'{brand}'}</h1>
      <p>Phase 0 — foundation. Tasks 0.1, 0.2 and 0.3 complete.</p>
    </main>
  )
}
