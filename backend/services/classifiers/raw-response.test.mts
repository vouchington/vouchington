import { describe, expect, it } from 'vitest'
import { serializeClassifierRawResponse } from './raw-response.mts'

describe('serializeClassifierRawResponse', () => {
  it('serializes JSON recursively with stable object key order', () => {
    expect(serializeClassifierRawResponse({ z: [2, null], a: { y: true, x: 'value' } })).toBe(
      '{"a":{"x":"value","y":true},"z":[2,null]}',
    )
  })

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, undefined, () => undefined])(
    'rejects a non-JSON value',
    value => {
      expect(() => serializeClassifierRawResponse(value)).toThrow('JSON serializable')
    },
  )
})
