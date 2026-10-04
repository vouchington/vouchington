import { describe, expect, it } from 'vitest'
import { parseCopyrightDsaSorDatabaseFrom } from './dsa-start-date.mts'

describe('DSA statement UTC start date', () => {
  it('accepts real calendar days at UTC midnight', () => {
    expect(parseCopyrightDsaSorDatabaseFrom('2024-02-29')).toEqual(
      new Date('2024-02-29T00:00:00.000Z'),
    )
  })

  it.each(['', '0000-01-01', '2025-02-29', '2026-10-04T00:00:00Z', 20261004])(
    'rejects an unset, invalid, or non-day value (%s)',
    value => {
      expect(parseCopyrightDsaSorDatabaseFrom(value)).toBeNull()
    },
  )
})
