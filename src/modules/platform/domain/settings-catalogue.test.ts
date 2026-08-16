import { describe, expect, it } from 'vitest'

import { SETTING_DEFINITIONS, settingDefinition, validateSetting } from './settings-catalogue'

/**
 * `ADM-06` — the range check that turns a key-value table into a settings surface.
 *
 * Without it `pricing.band_percent = 900` is a valid row: every customer sees a band nine
 * times wider than the estimate, live, with no deploy, no review, and nothing in the schema
 * saying it was possible.
 */

describe('the catalogue covers what 17 §Platform settings lists', () => {
  it.each([
    'pricing.band_percent',
    'pricing.band_min_kurus',
    'pricing.round_step_kurus',
    'offer_request.sla_hours',
    'tax.kdv_default_percent',
    'matching.max_companies_per_project',
  ])('%s is defined', (key) => {
    expect(settingDefinition(key)).toBeDefined()
  })

  it('gives every setting a stated reason for its range', () => {
    // A bound with no reason is the first thing somebody widens when a value is refused.
    for (const definition of SETTING_DEFINITIONS) {
      expect(definition.rationale.length, definition.key).toBeGreaterThan(40)
      expect(definition.source.length, definition.key).toBeGreaterThan(3)
    }
  })

  it('matches the seeded keys exactly', () => {
    // A definition with no seed is a setting that reads as `null` forever; a seed with no
    // definition is a value nobody can edit. Both are silent.
    const seeded = [
      'pricing.band_percent',
      'pricing.band_min_kurus',
      'pricing.round_step_kurus',
      'offer_request.sla_hours',
      'tax.kdv_default_percent',
      'matching.max_companies_per_project',
    ].sort()

    expect(SETTING_DEFINITIONS.map((d) => d.key).sort()).toEqual(seeded)
  })
})

describe('band_percent', () => {
  it('accepts the seeded default and the edges', () => {
    expect(validateSetting('pricing.band_percent', 10).valid).toBe(true)
    // 0 is legitimate: it means "show the exact figure".
    expect(validateSetting('pricing.band_percent', 0).valid).toBe(true)
    expect(validateSetting('pricing.band_percent', 50).valid).toBe(true)
  })

  it('refuses 900 — the value this whole file exists for', () => {
    const verdict = validateSetting('pricing.band_percent', 900)

    expect(verdict.valid).toBe(false)
    if (verdict.valid) return
    expect(verdict.reason).toBe('out-of-range')
    if (verdict.reason !== 'out-of-range') return
    // The rationale travels with the refusal, so the screen can explain rather than just say no.
    expect(verdict.rationale).toContain('half the estimate')
  })

  it('refuses a negative percentage and a fractional one', () => {
    expect(validateSetting('pricing.band_percent', -1).valid).toBe(false)
    expect(validateSetting('pricing.band_percent', 10.5).valid).toBe(false)
  })

  it('refuses a string that looks like a number', () => {
    // The form posts strings; whoever forgets to coerce should get a refusal, not a row
    // holding `"10"` that every reader then has to guess about.
    expect(validateSetting('pricing.band_percent', '10').valid).toBe(false)
  })
})

describe('the other bounds', () => {
  it.each([
    ['offer_request.sla_hours', 48, 0, 200],
    ['tax.kdv_default_percent', 20, -1, 101],
    ['matching.max_companies_per_project', 5, 0, 11],
    ['pricing.round_step_kurus', 50_000, 99, 200_000],
    ['pricing.band_min_kurus', 500_000, -1, 2_000_000],
  ])('%s accepts %i and refuses %i and %i', (key, good, tooLow, tooHigh) => {
    expect(validateSetting(key, good).valid, `${key}=${good}`).toBe(true)
    expect(validateSetting(key, tooLow).valid, `${key}=${tooLow}`).toBe(false)
    expect(validateSetting(key, tooHigh).valid, `${key}=${tooHigh}`).toBe(false)
  })
})

describe('unknown keys', () => {
  it('are refused rather than created', () => {
    /*
     * `PlatformSetting` is key-value, so nothing in the database stops a typo from becoming
     * a row. `pricing.band_percnt` would then sit there being read by nobody while the real
     * setting keeps its old value — and the admin who "changed" it has no way to tell.
     */
    const verdict = validateSetting('pricing.band_percnt', 10)

    expect(verdict.valid).toBe(false)
    if (verdict.valid) return
    expect(verdict.reason).toBe('unknown-key')
  })
})
