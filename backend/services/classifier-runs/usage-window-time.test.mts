import { describe, expect, it } from 'vitest'
import { parseClassifierUsageTime } from './usage-window-time.mts'

describe('parseClassifierUsageTime (deterministic fixtures)', () => {
  it.each([
    ['2026-10-01T00:00:00Z', '2026-10-01T00:00:00.000Z'],
    ['2026-10-01T12:34:56.7Z', '2026-10-01T12:34:56.700Z'],
    ['2026-10-01T12:34:56.789Z', '2026-10-01T12:34:56.789Z'],
    ['2028-02-29T23:59:59Z', '2028-02-29T23:59:59.000Z'],
  ])('reads %s as that UTC instant', (text, iso) => {
    expect(parseClassifierUsageTime(text)?.toISOString()).toBe(iso)
  })

  it.each([
    ['a date with no time', '2026-10-01'],
    ['a bare number', '0'],
    ['no zone', '2026-10-01T00:00:00'],
    ['an offset', '2026-10-01T00:00:00+02:00'],
    ['a space instead of T', '2026-10-01 00:00:00Z'],
    ['a locale date', '10/01/2026'],
    ['words', 'yesterday'],
    ['an empty string', ''],
  ])('rejects %s', (_label, text) => {
    expect(parseClassifierUsageTime(text)).toBeNull()
  })

  it.each([
    ['a day the month lacks', '2026-02-30T00:00:00Z'],
    ['a leap day in a common year', '2027-02-29T00:00:00Z'],
    ['hour 24', '2026-10-01T24:00:00Z'],
    ['month 13', '2026-13-01T00:00:00Z'],
    ['minute 60', '2026-10-01T00:60:00Z'],
  ])('rejects %s instead of moving the window', (_label, text) => {
    expect(parseClassifierUsageTime(text)).toBeNull()
  })
})
