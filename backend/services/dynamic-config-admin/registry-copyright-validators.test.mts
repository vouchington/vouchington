import { describe, expect, it } from 'vitest'
import { validateCopyrightDsaSorDatabaseFrom } from './registry-copyright-validators.mts'

describe('copyright DSA start-date operator validation', () => {
  it('permits the unset state and real UTC days', () => {
    expect(() => validateCopyrightDsaSorDatabaseFrom({ dsaSorDatabaseFrom: '' })).not.toThrow()
    expect(() =>
      validateCopyrightDsaSorDatabaseFrom({ dsaSorDatabaseFrom: '2024-02-29' }),
    ).not.toThrow()
  })

  it.each(['0000-01-01', '2025-02-29', '2026-10-04T00:00:00Z'])(
    'refuses invalid operator cutoff %s',
    value => {
      expect(() => validateCopyrightDsaSorDatabaseFrom({ dsaSorDatabaseFrom: value })).toThrow(
        'real YYYY-MM-DD calendar date',
      )
    },
  )
})
