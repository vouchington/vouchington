import { describe, expect, it } from 'vitest'
import { isPhoneNumber, verifyPhoneNumber } from './validation.mts'

describe('isPhoneNumber', () => {
  it('returns true for valid international phone numbers', () => {
    expect(isPhoneNumber('+14155552671')).toBe(true)
    expect(isPhoneNumber('+447911123456')).toBe(true)
  })

  it('returns false for invalid phone numbers', () => {
    expect(isPhoneNumber('not-a-phone')).toBe(false)
    expect(isPhoneNumber('')).toBe(false)
    expect(isPhoneNumber('12345')).toBe(false)
  })
})

describe('verifyPhoneNumber', () => {
  it('returns normalized phone number for valid input', () => {
    const result = verifyPhoneNumber('+14155552671')
    expect(result).toBe('+14155552671')
  })

  it('throws 422 for invalid phone number', () => {
    expect(() => verifyPhoneNumber('not-a-phone')).toThrowError(
      expect.objectContaining({ message: 'Invalid phone number', status: 422 }),
    )
  })
})
