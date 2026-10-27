import { describe, expect, it } from 'vitest'
import { isModerationAppealVisibleToAppellant } from './visibility.mts'

describe('member appeal history access window', () => {
  it('keeps pending history visible and includes the exact 24-calendar-month boundary', () => {
    const now = new Date('2026-03-31T12:34:56.789Z')
    expect(isModerationAppealVisibleToAppellant({ resolved_at: null }, now)).toBe(true)
    expect(
      isModerationAppealVisibleToAppellant(
        { resolved_at: new Date('2024-03-31T12:34:56.789Z') },
        now,
      ),
    ).toBe(true)
    expect(
      isModerationAppealVisibleToAppellant(
        { resolved_at: new Date('2024-03-31T12:34:56.788Z') },
        now,
      ),
    ).toBe(false)
  })

  it('clamps leap-day subtraction to the last day of the earlier February', () => {
    const now = new Date('2024-02-29T12:00:00Z')
    expect(
      isModerationAppealVisibleToAppellant({ resolved_at: new Date('2022-02-28T12:00:00Z') }, now),
    ).toBe(true)
    expect(
      isModerationAppealVisibleToAppellant(
        { resolved_at: new Date('2022-02-28T11:59:59.999Z') },
        now,
      ),
    ).toBe(false)
  })
})
