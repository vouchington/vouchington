import { describe, expect, it } from 'vitest'
import {
  enumerateUtcDaysInclusive,
  getCurrentUtcDay,
  getDayBounds,
  getPreviousUtcDays,
  getUtcDayFromDate,
  parseDuration,
  parseUtcDay,
} from './dates.mts'

describe('date helpers', () => {
  it('formats a date as a UTC day', () => {
    expect(getUtcDayFromDate(new Date('2026-03-04T01:02:03.000Z'))).toBe('2026-03-04')
  })

  it('reports the current UTC day in YYYY-MM-DD format', () => {
    expect(getCurrentUtcDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('enumerates UTC days inclusively', () => {
    expect(enumerateUtcDaysInclusive('2026-03-01', '2026-03-03')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ])
  })

  it('returns an empty array when the start day is after the end day', () => {
    expect(enumerateUtcDaysInclusive('2026-03-05', '2026-03-01')).toEqual([])
  })

  it('gets previous UTC days from a fixed base date', () => {
    expect(getPreviousUtcDays(3, { baseDate: new Date('2026-03-04T12:00:00.000Z') })).toEqual([
      '2026-03-04',
      '2026-03-03',
      '2026-03-02',
    ])
  })

  it('honors includeToday=false', () => {
    expect(
      getPreviousUtcDays(2, {
        baseDate: new Date('2026-03-04T12:00:00.000Z'),
        includeToday: false,
      }),
    ).toEqual(['2026-03-03', '2026-03-02'])
  })

  it('returns an empty array for non-positive counts', () => {
    expect(getPreviousUtcDays(0)).toEqual([])
    expect(getPreviousUtcDays(-1)).toEqual([])
  })

  it('parses a UTC day and computes day bounds', () => {
    expect(parseUtcDay('2026-03-04')).toEqual({
      year: '2026',
      month: '03',
      day: '04',
    })
    expect(getDayBounds('2026-03-04')).toEqual({
      startMs: Date.parse('2026-03-04T00:00:00.000Z'),
      endMs: Date.parse('2026-03-05T00:00:00.000Z'),
    })
  })

  it('throws when parseUtcDay receives an invalid date string', () => {
    expect(() => parseUtcDay('not-a-day')).toThrow('Invalid UTC day: not-a-day')
  })

  it('throws when parseUtcDay receives a non-existent calendar day', () => {
    expect(() => parseUtcDay('2026-02-30')).toThrow('Invalid UTC day: 2026-02-30')
  })

  it('enumerateUtcDaysInclusive throws when start or end is an invalid calendar day', () => {
    expect(() => enumerateUtcDaysInclusive('invalid-date', '2026-03-03')).toThrow(
      'Invalid UTC day: invalid-date',
    )
    expect(() => enumerateUtcDaysInclusive('2026-03-01', 'invalid-date')).toThrow(
      'Invalid UTC day: invalid-date',
    )
  })
})

describe('parseDuration', () => {
  it('returns null for absent values', () => {
    expect(parseDuration(undefined)).toBeNull()
    expect(parseDuration(null)).toBeNull()
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('  ')).toBeNull()
  })

  it('returns null for non-parseable values', () => {
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration({})).toBeNull()
    expect(parseDuration(-1)).toBeNull()
    expect(parseDuration('-5')).toBeNull()
  })

  it('returns null for non-finite numbers', () => {
    expect(parseDuration(Number.POSITIVE_INFINITY)).toBeNull()
    expect(parseDuration(Number.NaN)).toBeNull()
  })

  it('parses plain number (seconds)', () => {
    expect(parseDuration(90)).toBe(90)
    expect(parseDuration(0)).toBe(0)
    expect(parseDuration('3600')).toBe(3600)
  })

  it('parses MM:SS format', () => {
    expect(parseDuration('45:30')).toBe(45 * 60 + 30)
    expect(parseDuration('0:59')).toBe(59)
  })

  it('parses HH:MM:SS format', () => {
    expect(parseDuration('1:30:00')).toBe(3600 + 1800)
    expect(parseDuration('0:45:30')).toBe(45 * 60 + 30)
  })

  it('returns null for unsupported segment counts', () => {
    expect(parseDuration('1:2:3:4')).toBeNull()
  })

  it('returns null when colon-separated value has non-digit segment', () => {
    expect(parseDuration('1:ab')).toBeNull()
  })

  it('floors non-integer numbers', () => {
    expect(parseDuration(90.9)).toBe(90)
  })
})
