/**
 * JSON-LD embedding — `18` §Structured data. One rule governs every use: **markup must
 * match what a visitor sees** (a mismatch is a manual-action risk), which is why the
 * profile's `AggregateRating` only exists from three published reviews — the same
 * threshold the visible page uses — and why `Product` carries no `Offer` until a price
 * is actually rendered on the page.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Serialised server-side from values we construct; the escape guards `</script>`.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
