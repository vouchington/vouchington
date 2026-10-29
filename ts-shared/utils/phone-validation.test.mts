import { describe, expect, it } from 'vitest'
import { verifyPhoneNumber } from './phone-validation.mts'

describe('verifyPhoneNumber', () => {
  it('returns normalized phone number for valid input', () => {
    expect(verifyPhoneNumber('(415) 555-2671')).toBe('+14155552671')
  })

  it('throws 422 for invalid phone number', () => {
    expect(() => verifyPhoneNumber('not-a-phone')).toThrowError(
      expect.objectContaining({ message: 'Invalid phone number', status: 422 }),
    )
  })
})
