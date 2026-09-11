import { describe, expect, it } from 'vitest'
import { isPhoneNumber, verifyPhoneNumber } from '@ts-shared/utils/phone-validation'

describe('shared phone validation in the Cloudflare Worker workspace', () => {
  it('validates and normalizes phone numbers through @ts-shared/utils', () => {
    expect(isPhoneNumber('+14155552671')).toBe(true)
    expect(verifyPhoneNumber('(415) 555-2671')).toBe('+14155552671')
  })

  it('rejects invalid phone numbers with a 422-like error', () => {
    expect(isPhoneNumber('not-a-phone')).toBe(false)
    expect(() => verifyPhoneNumber('not-a-phone')).toThrowError(
      expect.objectContaining({ message: 'Invalid phone number', status: 422 }),
    )
  })
})
