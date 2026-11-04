import { describe, expect, it } from 'vitest'
import { postTimeRangeParams } from './time-range'

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
