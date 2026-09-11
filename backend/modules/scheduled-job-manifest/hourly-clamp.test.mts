import { describe, expect, it } from 'vitest'
import {
  HOURLY_FLOOR_MS,
  HOURLY_FLOOR_PATTERN,
  clampScheduledJobRepeatToHourlyFloor,
  maxCronFiringsPerHour,
} from './hourly-clamp.mts'

describe('maxCronFiringsPerHour', () => {
  it.each([
    ['* * * * *', 60],
    ['*/5 * * * *', 12],
    ['*/15 * * * *', 4],
    ['*/30 * * * *', 2],
    ['0 * * * *', 1],
    ['0 2 * * *', 1],
    ['0 0 1 * *', 1],
    ['0 9 * * 1', 1],
    ['30 2 * * *', 1],
    ['0,30 * * * *', 2],
    ['10-20 * * * *', 11],
    ['0-30/10 * * * *', 4],
    ['5/10 * * * *', 6],
  ] as const)('%s -> %d firings/hr', (pattern, expected) => {
    expect(maxCronFiringsPerHour(pattern)).toBe(expected)
  })

  it('rejects a pattern that is not exactly 5 fields', () => {
    expect(() => maxCronFiringsPerHour('* * * *')).toThrow('Expected a 5-field cron pattern')
    expect(() => maxCronFiringsPerHour('* * * * * *')).toThrow('Expected a 5-field cron pattern')
  })

  it('rejects an invalid minute field item', () => {
    expect(() => maxCronFiringsPerHour('a * * * *')).toThrow('Invalid cron minute field item')
    expect(() => maxCronFiringsPerHour('70 * * * *')).toThrow('out of range 0-59')
    expect(() => maxCronFiringsPerHour('*/0 * * * *')).toThrow('Invalid cron minute field step')
    expect(() => maxCronFiringsPerHour('1/2/3 * * * *')).toThrow('Invalid cron minute field item')
  })
})

describe('clampScheduledJobRepeatToHourlyFloor', () => {
  describe('every-type repeat', () => {
    it.each([
      [60_000, HOURLY_FLOOR_MS],
      [300_000, HOURLY_FLOOR_MS],
      [5_000, HOURLY_FLOOR_MS],
    ])('clamps every: %d up to the hourly floor', (every, expected) => {
      const result = clampScheduledJobRepeatToHourlyFloor({ every })
      expect(result).toEqual({ repeat: { every: expected }, clamped: true })
    })

    it('leaves every: exactly the floor untouched, same reference', () => {
      const repeat = { every: HOURLY_FLOOR_MS }
      const result = clampScheduledJobRepeatToHourlyFloor(repeat)
      expect(result).toEqual({ repeat, clamped: false })
      expect(result.repeat).toBe(repeat)
    })

    it('leaves every: less frequent than hourly untouched, same reference', () => {
      const repeat = { every: 7_200_000 }
      const result = clampScheduledJobRepeatToHourlyFloor(repeat)
      expect(result).toEqual({ repeat, clamped: false })
      expect(result.repeat).toBe(repeat)
    })
  })

  describe('pattern-type repeat', () => {
    it.each(['* * * * *', '*/5 * * * *', '*/15 * * * *', '*/30 * * * *'])(
      'clamps pattern %s down to the hourly floor',
      pattern => {
        const result = clampScheduledJobRepeatToHourlyFloor({ pattern })
        expect(result).toEqual({ repeat: { pattern: HOURLY_FLOOR_PATTERN }, clamped: true })
      },
    )

    it.each([
      '0 * * * *',
      '0 2 * * *',
      '30 2 * * *',
      '0 0 1 * *',
      '0 9 * * 1',
      '0 3 * * 0',
      '0 4 * * 1',
    ])('leaves already-hourly-or-slower pattern %s untouched, same reference', pattern => {
      const repeat = { pattern }
      const result = clampScheduledJobRepeatToHourlyFloor(repeat)
      expect(result).toEqual({ repeat, clamped: false })
      expect(result.repeat).toBe(repeat)
    })
  })
})
