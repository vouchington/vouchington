import { describe, expect, it } from 'vitest'
import { publicationPageLimit } from './page-limit.mts'

describe('publication page structural row budget', () => {
  it.each([1, 100, Number.MAX_SAFE_INTEGER])('renders the safe positive integer %s', value => {
    expect(publicationPageLimit(value)).toBe(String(value))
  })
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an unsafe structural SQL budget %s',
    value => {
      expect(() => publicationPageLimit(value)).toThrow(TypeError)
    },
  )
})
