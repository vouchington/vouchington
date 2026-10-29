import { describe, expect, it } from 'vitest'
import { validateCopyrightDsaSorDatabaseFrom } from './registry-copyright-validators.mts'

describe('copyright DSA start-date operator validation', () => {
  it('permits the unset state and real UTC days', () => {
    expect(() =>
      validateCopyrightDsaSorDatabaseFrom({ replayPolicyReviewedAt: '', dsaSorDatabaseFrom: '' }),
    ).not.toThrow()
    expect(() =>
      validateCopyrightDsaSorDatabaseFrom({
        replayPolicyReviewedAt: '',
        dsaSorDatabaseFrom: '2024-02-29',
      }),
    ).not.toThrow()
  })

  it.each(['not-a-date', '2025-02-30T00:00:00.000Z', '2999-01-01T00:00:00.000Z'])(
    'refuses invalid or future review timestamp %s',
    value => {
      expect(() =>
        validateCopyrightDsaSorDatabaseFrom({
          dsaSorDatabaseFrom: '',
          replayPolicyReviewedAt: value,
        }),
      ).toThrow('past UTC ISO timestamp')
    },
  )

  it.each(['0000-01-01', '2025-02-29', '2026-10-04T00:00:00Z'])(
    'refuses invalid operator cutoff %s',
    value => {
      expect(() =>
        validateCopyrightDsaSorDatabaseFrom({
          replayPolicyReviewedAt: '',
          dsaSorDatabaseFrom: value,
        }),
      ).toThrow('real YYYY-MM-DD calendar date')
    },
  )
})
