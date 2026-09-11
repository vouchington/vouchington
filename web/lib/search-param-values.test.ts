import { describe, expect, it } from 'vitest'
import { joinSearchParamValues } from './search-param-values'

describe('joinSearchParamValues', () => {
  it('joins repeated params and preserves single params', () => {
    expect(joinSearchParamValues('topic-1')).toBe('topic-1')
    expect(joinSearchParamValues(['topic-1', 'topic-2'])).toBe('topic-1,topic-2')
  })

  it('dedupes and caps joined params', () => {
    expect(joinSearchParamValues(['topic-1,topic-2', 'topic-1', 'topic-3'])).toBe(
      'topic-1,topic-2,topic-3',
    )
    expect(
      joinSearchParamValues([
        'topic-1',
        'topic-2',
        'topic-3',
        'topic-4',
        'topic-5',
        'topic-6',
        'topic-7',
        'topic-8',
        'topic-9',
        'topic-10',
        'topic-11',
      ]),
    ).toBe('topic-1,topic-2,topic-3,topic-4,topic-5,topic-6,topic-7,topic-8,topic-9,topic-10')
  })

  it('returns undefined for empty params', () => {
    expect(joinSearchParamValues(undefined)).toBeUndefined()
    expect(joinSearchParamValues('')).toBeUndefined()
    expect(joinSearchParamValues([''])).toBeUndefined()
  })
})
