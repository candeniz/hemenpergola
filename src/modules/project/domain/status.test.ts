import { describe, expect, it } from 'vitest'

import {
  canEdit,
  isTerminal,
  statusAfterEdit,
  statusAfterValidation,
  type ProjectStatus,
} from './status'

/**
 * The two bugs this file exists to prevent, both found in review:
 *
 *   validating a `SUBMITTED` project reported `READY` while the database said `SUBMITTED`;
 *   validating a `CLOSED` project resurrected it to `DRAFT`.
 *
 * Both came from the same cause — status written in two places with two different guards —
 * so the assertions below are written against the *transition function*, where a third write
 * site will also land.
 */

const ALL: ProjectStatus[] = ['DRAFT', 'READY', 'SUBMITTED', 'CLOSED']

describe('terminal states', () => {
  it('is exactly SUBMITTED and CLOSED', () => {
    expect(ALL.filter(isTerminal)).toEqual(['SUBMITTED', 'CLOSED'])
  })

  it('refuses editing in every terminal state and allows it in every other', () => {
    for (const status of ALL) {
      expect(canEdit(status), status).toBe(!isTerminal(status))
    }
  })
})

describe('statusAfterEdit', () => {
  it('returns an editable project to DRAFT', () => {
    // It was READY against the *old* values; carrying the flag through an edit is how a stale
    // readiness reaches Phase 6's offer request.
    expect(statusAfterEdit('DRAFT')).toBe('DRAFT')
    expect(statusAfterEdit('READY')).toBe('DRAFT')
  })

  it('leaves a terminal state alone', () => {
    // The caller refuses the edit first; this is the second line of defence.
    expect(statusAfterEdit('SUBMITTED')).toBe('SUBMITTED')
    expect(statusAfterEdit('CLOSED')).toBe('CLOSED')
  })
})

describe('statusAfterValidation', () => {
  it('promotes and demotes an editable project', () => {
    expect(statusAfterValidation('DRAFT', true)).toBe('READY')
    expect(statusAfterValidation('READY', false)).toBe('DRAFT')
    expect(statusAfterValidation('DRAFT', false)).toBe('DRAFT')
    expect(statusAfterValidation('READY', true)).toBe('READY')
  })

  it('does not move a SUBMITTED project, whatever the check says', () => {
    // Bug 1. The caller returns this value, so "does not move it" and "does not misreport it"
    // are the same assertion.
    expect(statusAfterValidation('SUBMITTED', true)).toBe('SUBMITTED')
    expect(statusAfterValidation('SUBMITTED', false)).toBe('SUBMITTED')
  })

  it('does not resurrect a CLOSED project', () => {
    // Bug 2. The edit path refused CLOSED; the validation path did not, so a closed project
    // came back to life by being validated.
    expect(statusAfterValidation('CLOSED', true)).toBe('CLOSED')
    expect(statusAfterValidation('CLOSED', false)).toBe('CLOSED')
  })

  it('never produces a status outside the enum', () => {
    for (const status of ALL) {
      for (const ready of [true, false]) {
        expect(ALL).toContain(statusAfterValidation(status, ready))
        expect(ALL).toContain(statusAfterEdit(status))
      }
    }
  })
})
