import { expect, type Page } from '@playwright/test'

/** Contact data disguised as a note — `ADR-026`'s reason, as a fixture every walk plants. */
export const NOTE_TRAP = 'Zili çalışmıyor, beni 0532 555 0000 numaradan arayın'

/**
 * The shared wizard walk — used by `core-flow.spec.ts` (signed in) and
 * `phase4-gate.spec.ts` (anonymous), because both gates end at the same claim: *the project
 * reaches `READY`*. One implementation, so the two specs cannot drift into walking two
 * different wizards.
 *
 * Sequencing leans on **server-backed signals**, not on the "Kaydedildi." text (which
 * persists between saves and therefore sequences nothing after the first): a `ChoiceStep`
 * advances itself on save, so the next step's controls appearing is the round-trip; an
 * options input reflects `view.values`, so `toBeChecked` is the save.
 */

/**
 * Open the chooser and start a draft of the named product. By product name, not `.first()`:
 * the chooser lists every configurable product and the first one is whatever sorts first in
 * this database — on a long-lived dev database that can be a half-specified leftover whose
 * required attribute has no options. "Bioklimatik Pergola" is one of the seed's two fully
 * specified products (`catalogue-data.test.ts` asserts it stays that way).
 */
export async function startDraft(page: Page, productName = 'Bioklimatik Pergola'): Promise<string> {
  await page.goto('/proje/yeni')

  await page
    .getByRole('heading', { name: productName, exact: true })
    .first()
    .locator('..')
    .getByRole('button', { name: /yapılandır|configure/i })
    .click()

  // `(?!yeni)`: the entry point itself matches `/proje/<something>`, so the lookahead is
  // what stops this resolving before the redirect.
  await page.waitForURL(/\/proje\/(?!yeni)[^/]+$/)
  return page.url()
}

/**
 * Walk every step to `READY`, choosing the first answer wherever a choice exists, and
 * assert the wizard's own readiness verdict at the end — `21`'s gate text is *"a project
 * reaches `READY`"*, and a walk that stops short of the verdict proves navigation, not
 * readiness. That gap is exactly how "no real catalogue product could ever reach READY"
 * survived Phase 4.
 */
export async function walkWizardToReady(page: Page, cityName: string): Promise<void> {
  // ── dimensions, then Devam (which saves) ──────────────────────────────────
  await page.getByLabel(/genişlik|width/i).fill('5000')
  await page.getByLabel(/derinlik|depth/i).fill('4000')
  await page.getByLabel(/yükseklik|height/i).fill('2800')
  await page.getByRole('button', { name: 'Devam' }).click()

  // ── project type → installation type: choosing saves and advances ─────────
  await page.getByRole('button', { name: 'Yeni yapı' }).click()
  await page.getByRole('button', { name: 'Duvara montaj' }).click()

  // ── options: first answer per question; `showIf` may reveal followers, so
  //    sweep until a pass finds nothing unanswered ────────────────────────────
  await expect(page.getByRole('button', { name: 'Devam' })).toBeVisible({ timeout: 30_000 })

  for (let pass = 0; pass < 5; pass += 1) {
    const fieldsets = page.locator('fieldset')
    const count = await fieldsets.count()
    let answered = 0

    for (let index = 0; index < count; index += 1) {
      const group = fieldsets.nth(index)
      // Nothing to click, nothing owed: an optionless group is not a question.
      if ((await group.locator('input').count()) === 0) continue
      if ((await group.locator('input:checked').count()) > 0) continue

      const input = group.locator('input').first()
      // `click`, not `check`: these are controlled inputs whose checked state arrives with
      // the server's view, and `check()`'s built-in "state changed immediately" assertion
      // calls that round-trip a failure. The expect below is the real wait.
      await input.click()
      await expect(input).toBeChecked({ timeout: 30_000 })
      answered += 1
    }

    if (answered === 0) break
  }

  await page.getByRole('button', { name: 'Devam' }).click()

  // ── location ──────────────────────────────────────────────────────────────
  /*
   * By role, not by label: `getByLabel` failed to resolve these selects even while the
   * accessibility snapshot showed `combobox "İl"` on screen — the dotted capital İ plus a
   * wrapping <label><span> is apparently a combination its matching does not survive.
   * `exact`, because "İl" is a prefix of "İlçe".
   */
  const citySelect = page.getByRole('combobox', { name: 'İl', exact: true })
  const districtSelect = page.getByRole('combobox', { name: 'İlçe', exact: true })

  await citySelect.selectOption({ label: cityName })
  await expect
    .poll(async () => districtSelect.locator('option').count(), { timeout: 30_000 })
    .toBeGreaterThan(1)
  await districtSelect.selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Devam' }).click()

  // ── timing (advances itself) → attachments → summary ─────────────────────
  await page.getByRole('button', { name: 'En kısa sürede' }).click()
  await expect(page.getByLabel('Eklemek istedikleriniz')).toBeVisible({ timeout: 30_000 })
  // The ADR-026 trap, planted on every walk: contact data written INTO the free text,
  // which must not surface anywhere pre-acceptance and must surface after it.
  await page.getByLabel('Eklemek istedikleriniz').fill(NOTE_TRAP)
  await page.getByRole('button', { name: 'Devam' }).click()

  await assertReady(page)
}

/**
 * Run the readiness check on the summary step and assert the verdict. Separately callable,
 * because `phase4-gate.spec.ts` asserts it twice: before the browser restart (the project
 * *reached* `READY`) and after it (`READY` *survived*).
 */
export async function assertReady(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Hazır mı, kontrol et' }).click()
  // `.first()`: the wizard announces readiness in its status line AND in the summary body.
  await expect(page.getByText('Projeniz teklif almaya hazır.').first()).toBeVisible({
    timeout: 30_000,
  })
}
