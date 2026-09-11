import { describe, expect, it } from 'vitest'
import { toPositiveNumber } from '../cache-policy.mts'

describe('toPositiveNumber', () => {
  it('returns the parsed value for valid positive numbers', () => {
    expect(toPositiveNumber('30', 60)).toBe(30)
    expect(toPositiveNumber('86400', 60)).toBe(86400)
    expect(toPositiveNumber('1', 60)).toBe(1)
  })

  it('returns the fallback for zero or negative values', () => {
    expect(toPositiveNumber('0', 60)).toBe(60)
    expect(toPositiveNumber('-5', 60)).toBe(60)
  })

  it('returns the fallback for non-numeric strings', () => {
    expect(toPositiveNumber('not-a-number', 60)).toBe(60)
    expect(toPositiveNumber('', 60)).toBe(60)
    expect(toPositiveNumber(undefined, 60)).toBe(60)
  })

  it('returns the fallback for non-finite values', () => {
    expect(toPositiveNumber('Infinity', 60)).toBe(60)
    expect(toPositiveNumber('NaN', 60)).toBe(60)
  })

  it('floors decimal values', () => {
    expect(toPositiveNumber('30.9', 60)).toBe(30)
    expect(toPositiveNumber('1.1', 60)).toBe(1)
  })
})
