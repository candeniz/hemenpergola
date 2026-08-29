/**
 * The seeded accounts a **human being types into a login form**, and the one password they
 * share (task 13.6a).
 *
 * ## Why this is its own file
 *
 * Five e2e specs, two launcher scripts and two documents hand these values to a person or a
 * browser, and until now every one of them wrote the address out as a string literal. That
 * made a rename a nine-file edit, which is the same thing as saying the addresses could
 * never change. They are constants here, and `profiles.ts` re-exports them, so the next
 * change is one line.
 *
 * It is a separate module from `profiles.ts` rather than a section of it because the specs
 * import it: `profiles.ts` pulls in the geography, catalogue and content seeds, and every
 * spec that wanted one email address would load all of them.
 *
 * ## The addresses
 *
 * `@dikont.com` so that a person in the E6 round can type them without inventing a domain,
 * and so that a mistyped address fails as a wrong password rather than as a plausible
 * `.local` host somebody tries to resolve. The `e2e-*` fixtures in `profiles.ts` keep their
 * `.local` addresses on purpose: no human signs into those, and renaming them would buy
 * nothing.
 *
 * ## The password
 *
 * **`1234`, and yes, that is below `MIN_PASSWORD_LENGTH` (10).** It is deliberate and it is
 * reachable only by seeded accounts:
 *
 *   - the **login** schema validates `min(1)` (`modules/iam/application/dto.ts`) — it exists
 *     to reject an empty field, not to re-run the policy on an existing account, because a
 *     password already stored has already been through it;
 *   - the **register** schema is where `MIN_PASSWORD_LENGTH` is enforced, and the seed does
 *     not go through it — it writes the Argon2 hash directly.
 *
 * So nothing here weakens the policy for a real account: an account created by a person
 * still cannot have a four-character password. What it buys is that the E6 round, a demo and
 * the D3 pilot session do not begin with somebody reading a 34-character string aloud.
 *
 * **This must never run against production.** `20` §Test data and `23` §Environments say
 * seeds are for `local`, `preview` and test databases. Note that this is a convention and
 * NOT a mechanism today — `prisma/seed/index.ts` runs against whatever `DATABASE_URL`
 * points at, with no environment check. Recorded as Q34 in `25-progress.md`.
 */

/** The bootstrap admin (`e2e/phase2-gate.spec.ts` has to be one to prove the Phase 2 gate). */
export const SEED_ADMIN_EMAIL = 'admin@dikont.com'

/** The customer for `e2e/core-flow.spec.ts` and for the E6 round's customer half. */
export const SEED_CUSTOMER_EMAIL = 'musteri@dikont.com'

/**
 * The manufacturer a human signs in as: **Ege Pergola**, the demo company with the published
 * price book, the leads and the offers. This is the account the two-role round walks
 * (`mobile/TEST-APK.md`, `Hemen Pergola.cmd`, `e2e/core-flow.spec.ts` steps 5–9).
 */
export const SEED_MANUFACTURER_EMAIL = 'uretici@dikont.com'
export const SEED_SALES_EMAIL = 'satis@dikont.com'
export const SEED_COMPANY_ADMIN_EMAIL = 'yonetici@dikont.com'

/**
 * **Marmara Cam Sistemleri** — the D3 pilot company (`27-d3-pilot-guide.md`,
 * `e2e/phase3-gate.spec.ts`). A second manufacturer rather than a synonym for the one above:
 * it is deliberately seeded *without* a price book, because the pilot session observes a
 * manufacturer building one from nothing.
 */
export const SEED_PILOT_OWNER_EMAIL = 'uretici2@dikont.com'
export const SEED_PILOT_SALES_EMAIL = 'satis2@dikont.com'

/** One value, three roles — see the note above on why it is this short. */
export const SEED_PASSWORD = '1234'
