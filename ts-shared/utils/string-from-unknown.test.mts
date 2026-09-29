import { describe, expect, it } from 'vitest'
import { stringFromUnknown } from './string-from-unknown.mts'

describe('stringFromUnknown', () => {
  it('keeps primitive String() results and joins arrays', () => {
    expect(stringFromUnknown('seed')).toBe('seed')
    expect(stringFromUnknown(12)).toBe('12')
    expect(stringFromUnknown(false)).toBe('false')
    expect(stringFromUnknown(null)).toBe('null')
    expect(stringFromUnknown(undefined)).toBe('undefined')
    expect(stringFromUnknown(['a', 1])).toBe('a,1')
  })

  it('serializes objects instead of using the default object tag', () => {
    expect(stringFromUnknown({ code: 42 })).toBe('{"code":42}')
  })
})
