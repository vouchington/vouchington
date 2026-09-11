import { describe, it, expect } from 'vitest'
import { parseStringArray, parseBooleanish, parseNumberParam, parseNumberParams } from './query.mts'

describe('parseStringArray', () => {
  it('should parse comma-separated string', () => {
    const result = parseStringArray('foo,bar,baz')
    expect(result).toEqual(['foo', 'bar', 'baz'])
  })

  it('should parse comma-separated string with spaces', () => {
    const result = parseStringArray('foo, bar , baz')
    expect(result).toEqual(['foo', 'bar', 'baz'])
  })

  it('should parse array input', () => {
    const result = parseStringArray(['foo', 'bar'])
    expect(result).toEqual(['foo', 'bar'])
  })

  it('should convert array elements to strings', () => {
    const result = parseStringArray([1, 2, 3])
    expect(result).toEqual(['1', '2', '3'])
  })

  it('should filter out empty strings', () => {
    const result = parseStringArray('foo,,bar,')
    expect(result).toEqual(['foo', 'bar'])
  })

  it('should return empty array for non-string, non-array', () => {
    expect(parseStringArray(123)).toEqual([])
    expect(parseStringArray(null)).toEqual([])
    expect(parseStringArray({})).toEqual([])
  })

  it('should return empty array for empty string', () => {
    expect(parseStringArray('')).toEqual([])
  })
})

describe('parseBooleanish', () => {
  it('should parse boolean true', () => {
    expect(parseBooleanish(true)).toBe(true)
  })

  it('should parse boolean false', () => {
    expect(parseBooleanish(false)).toBe(false)
  })

  it('should parse string "true"', () => {
    expect(parseBooleanish('true')).toBe(true)
    expect(parseBooleanish('TRUE')).toBe(true)
    expect(parseBooleanish('True')).toBe(true)
  })

  it('should parse string "false"', () => {
    expect(parseBooleanish('false')).toBe(false)
    expect(parseBooleanish('FALSE')).toBe(false)
    expect(parseBooleanish('False')).toBe(false)
  })

  it('should parse string "1"', () => {
    expect(parseBooleanish('1')).toBe(true)
  })

  it('should parse string "0"', () => {
    expect(parseBooleanish('0')).toBe(false)
  })

  it('should parse number 1', () => {
    expect(parseBooleanish(1)).toBe(true)
  })

  it('should parse number 0', () => {
    expect(parseBooleanish(0)).toBe(false)
  })

  it('should parse non-zero numbers as true', () => {
    expect(parseBooleanish(5)).toBe(true)
    expect(parseBooleanish(-1)).toBe(true)
  })

  it('should return false for null and other falsy values', () => {
    expect(parseBooleanish(null)).toBe(false)
  })

  it('should return false for empty string', () => {
    expect(parseBooleanish('')).toBe(false)
  })

  it('should return false for other strings', () => {
    expect(parseBooleanish('yes')).toBe(false)
    expect(parseBooleanish('no')).toBe(false)
    expect(parseBooleanish('random')).toBe(false)
  })
})

describe('parseNumberParam', () => {
  it('returns undefined when key is missing', () => {
    expect(parseNumberParam({}, 'limit')).toBeUndefined()
  })

  it('parses numeric strings', () => {
    expect(parseNumberParam({ limit: '42' }, 'limit')).toBe(42)
  })

  it('parses numbers as-is', () => {
    expect(parseNumberParam({ limit: 7 }, 'limit')).toBe(7)
  })

  it('preserves null and whitespace-only values as zero', () => {
    expect(parseNumberParam({ limit: null }, 'limit')).toBe(0)
    expect(parseNumberParam({ limit: '  ' }, 'limit')).toBe(0)
  })

  it('returns undefined for NaN inputs', () => {
    expect(parseNumberParam({ limit: 'not-a-number' }, 'limit')).toBeUndefined()
  })
})

describe('parseNumberParams', () => {
  it('returns parsed values for present keys and omits absent keys', () => {
    const result = parseNumberParams({ a: '1', b: 2, c: 'bad' }, ['a', 'b', 'c', 'd'])
    expect(result).toEqual({ a: 1, b: 2 })
  })
})
