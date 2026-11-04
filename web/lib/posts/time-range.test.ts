import { describe, expect, it } from 'vitest'
import { hackerNewsPostTimeRange, postTimeRangeParams } from './time-range'

describe('postTimeRangeParams', () => {
  it('passes supported ranges through as the API code', () => {
    expect(postTimeRangeParams('1w')).toEqual({ time_range: '1w' })
    expect(postTimeRangeParams('all')).toEqual({ time_range: 'all' })
  })

  it('omits absent, repeated, and unsupported values so the API default applies', () => {
    expect(postTimeRangeParams(undefined)).toEqual({})
    expect(postTimeRangeParams(['1w', '1y'])).toEqual({})
    expect(postTimeRangeParams('1d')).toEqual({})
  })
})

describe('hackerNewsPostTimeRange', () => {
  it('keeps bounded ranges and normalizes absent or all-time ranges to one year', () => {
    for (const range of ['1w', '1m', '1y'] as const) {
      expect(hackerNewsPostTimeRange(range)).toBe(range)
    }
    for (const range of [undefined, null, 'all', 'invalid', ['1w']]) {
      expect(hackerNewsPostTimeRange(range)).toBe('1y')
    }
  })
})
