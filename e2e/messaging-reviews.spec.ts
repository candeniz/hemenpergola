import { expect, test, type Page } from '@playwright/test'

import { SEED_CUSTOMER_EMAIL, SEED_MANUFACTURER_EMAIL } from '../prisma/seed/accounts'

/**
 * **F5 (messaging) and F6 (reviews)** — `03-user-flows.md`, the two secondary flows that
 * sat as `fixme` from Phase 0 until their surfaces existed. Phase 9's last code pass
 * un-skips them: both are fully built, so a `fixme` here would now be a lie about the
 * product rather than a note about the plan.
 *
 * The engagement is **planted through SQL** rather than re-walked through the wizard, and
 * that is a deliberate division of labour, not a shortcut: the release gate already walks
 * the whole F1 journey (nine steps, ~90 s), the service paths behind these states are
 * locked by `messaging.integration.test.ts` and `review.integration.test.ts`, and what is
 * unproven — and only provable here — is that the SURFACES work for a real signed-in
 * user in a browser. Re-walking the wizard twice more would buy a slower suite and the
 * same evidence. (The same reasoning as `public-directory.spec.ts`'s slug-redirect test.)
 */

const RUN = Number(process.env.PW_RUN_ID ?? 1) % 250

async function pgQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  const { Client } = await import('pg')
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://pergola:pergola@localhost:5432/pergola',
  })
  await client.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    await client.end()
  }
}

/**
 * The **session fixture**, not a real-form login — and the reason is written in
 * `session-fixture.ts`'s own comment, which this spec reproduced before adopting it.
 *
 * `06` §Rate limits allows 10 auth attempts / 15 min per IP *and per account*. The
 * suite's real auth specs (registration, login, reset, the phase-4 gate) legitimately
 * spend most of that budget on the seeded customer. Three more form logins from here —
 * for a spec whose subject is messaging and reviews, not signing in — pushed the budget
 * over, and the next auth call in the run failed: in three consecutive full-suite runs
 * the casualty was `phase4-gate`'s email verification, exactly the failure the fixture
 * was written for. Signing in for real is proven by `core-flow.spec.ts`; proving it a
 * fourth time here costs another spec its pass.
 */
async function signInCustomer(page: Page): Promise<void> {
  const { seedSessionCookie } = await import('./session-fixture')
  await seedSessionCookie(page, SEED_CUSTOMER_EMAIL)
}

/**
 * Plant an engagement in a given status for the seeded customer and Ege Pergola, and
 * return the project it hangs off. Everything the surfaces need, nothing they do not.
 */
async function plantEngagement(status: string): Promise<{ projectId: string; requestId: string }> {
  const [customer] = await pgQuery<{ id: string }>(`SELECT "id" FROM "User" WHERE "email" = $1`, [
    SEED_CUSTOMER_EMAIL,
  ])
  const [company] = await pgQuery<{ id: string }>(
    `SELECT c."id" FROM "Company" c
     JOIN "CompanyMembership" m ON m."companyId" = c."id"
     JOIN "User" u ON u."id" = m."userId"
     WHERE u."email" = $1 LIMIT 1`,
    [SEED_MANUFACTURER_EMAIL],
  )
  const [product] = await pgQuery<{ id: string }>(
    `SELECT p."id" FROM "Product" p
     JOIN "ProductTranslation" t ON t."productId" = p."id"
     WHERE t."locale" = 'tr' AND t."name" = 'Bioklimatik Pergola' LIMIT 1`,
    [],
  )
  const [city] = await pgQuery<{ id: string }>(
    `SELECT "id" FROM "City" WHERE "plateCode" = 34 LIMIT 1`,
    [],
  )
  expect(customer && company && product && city).toBeTruthy()

  const suffix = `${RUN}-${Date.now()}`
  const [project] = await pgQuery<{ id: string }>(
    `INSERT INTO "Project" ("id","customerId","productId","status","quantity","areaM2","cityId","createdAt","updatedAt")
     VALUES ($1,$2,$3,'SUBMITTED',1,20,$4,now(),now()) RETURNING "id"`,
    [`prj_e2e_${suffix}`, customer!.id, product!.id, city!.id],
  )
  const [consent] = await pgQuery<{ id: string }>(
    `INSERT INTO "Consent" ("id","userId","type","textVersion","ip","userAgent","grantedAt")
     VALUES ($1,$2,'CONTACT_SHARING','e2e.v1','127.0.0.1','playwright',now()) RETURNING "id"`,
    [`cns_e2e_${suffix}`, customer!.id],
  )
  const [request] = await pgQuery<{ id: string }>(
    `INSERT INTO "OfferRequest"
       ("id","projectId","customerId","companyId","status","slaExpiresAt","respondedAt",
        "contactDisclosedAt","consentId","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,now() + interval '48 hours',now(),now(),$6,now(),now())
     RETURNING "id"`,
    [`ofr_e2e_${suffix}`, project!.id, customer!.id, company!.id, status, consent!.id],
  )
  return { projectId: project!.id, requestId: request!.id }
}

test.describe('F5 · messaging', () => {
  test('the customer writes on an ACCEPTED request and the message appears in the thread', async ({
    page,
  }) => {
    const { projectId } = await plantEngagement('ACCEPTED')

    await signInCustomer(page)
    await page.goto(`/hesap/projeler/${projectId}/talepler`)

    // The thread opens exactly where the disclosure opens (`ADR-028`).
    const box = page.getByLabel('Mesajınız')
    await expect(box).toBeVisible({ timeout: 30_000 })

    const body = `E2E mesajı ${Date.now()} — kapı kodu değişti`
    await box.fill(body)
    await page.getByRole('button', { name: 'Gönder' }).click()

    await expect(page.getByText(body)).toBeVisible({ timeout: 30_000 })
  })

  test('a PENDING request offers no message box at all — ADR-028 on the surface', async ({
    page,
  }) => {
    const { projectId } = await plantEngagement('PENDING')

    await signInCustomer(page)
    await page.goto(`/hesap/projeler/${projectId}/talepler`)

    // Not "disabled" — absent. The channel does not exist before acceptance.
    await expect(page.getByText('Yanıt bekleniyor').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByLabel('Mesajınız')).toHaveCount(0)
  })
})

test.describe('F6 · reviews', () => {
  test('review is possible only after SURVEY_COMPLETED, and lands in moderation', async ({
    page,
  }) => {
    /*
     * Clear the rows THIS spec planted on earlier runs, and only those (`ofr_e2e_` ids).
     *
     * `16` §Anti-gaming caps a customer at two reviews of one company per 12 months, and
     * the seeded customer + Ege Pergola is the pair every run uses — so the third run of
     * this test met the cap and failed. The cap was right and the test was not
     * idempotent; weakening the rule to make a fixture convenient would have been the
     * wrong repair.
     */
    await pgQuery(`DELETE FROM "Review" WHERE "offerRequestId" LIKE 'ofr_e2e_%'`, [])

    // Before survey: the form is not offered.
    const early = await plantEngagement('ACCEPTED')
    await signInCustomer(page)
    await page.goto(`/hesap/projeler/${early.projectId}/talepler`)
    await expect(page.getByRole('heading', { name: 'Deneyiminizi değerlendirin' })).toHaveCount(0)

    // From SURVEY_COMPLETED the form appears.
    const eligible = await plantEngagement('SURVEY_COMPLETED')
    await page.goto(`/hesap/projeler/${eligible.projectId}/talepler`)
    await expect(page.getByRole('heading', { name: 'Deneyiminizi değerlendirin' })).toBeVisible({
      timeout: 30_000,
    })

    // Four dimensions, each 1..5 — `16` §Content.
    for (const dimension of ['Genel değerlendirme', 'İşçilik kalitesi', 'İletişim', 'Zamanlama']) {
      await page
        .getByRole('radiogroup', { name: dimension })
        .getByRole('radio', { name: '5' })
        .click()
    }
    await page
      .getByLabel('Yorumunuz')
      .fill(
        'Keşif zamanında yapıldı, montaj ekibi titiz çalıştı ve sonuç beklediğimizden iyi oldu. Teşekkürler.',
      )
    await page.getByRole('button', { name: 'Yorumu gönder' }).click()

    /*
     * Moderated before publication: the customer is told, not left wondering.
     *
     * **Either sentence satisfies that, and asserting only the first was a race.** The form
     * shows "Yorumunuz alındı ve moderasyona gönderildi." on the action's result; the server
     * then revalidates and the section re-renders from state, where a submitted review reads
     * "Yorumunuz moderasyonda — yayınlandığında görünür olacak." and the form is gone. Which
     * one is on screen depends on whether the revalidation lands first.
     *
     * It passed by timing until Phase 10.2 added four specs and a customer nav item, at which
     * point the revalidation started winning and this went red — while the review was created
     * correctly every single time, PENDING, as the assertion below kept proving. The product
     * was right and the assertion was watching the wrong thing.
     */
    await expect(page.getByText(/moderasyon/i).first()).toBeVisible({ timeout: 30_000 })

    // And it is PENDING in the database — invisible until an admin publishes it.
    const rows = await pgQuery<{ status: string }>(
      `SELECT "status" FROM "Review" WHERE "offerRequestId" = $1`,
      [eligible.requestId],
    )
    expect(rows[0]?.status).toBe('PENDING')
  })
})
