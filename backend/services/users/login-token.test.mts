import { it, expect, describe } from 'vitest'
import { assertValidLoginToken, createLoginToken, LOGIN_TOKEN_LENGTH } from './login-token.mts'

describe('login-token', () => {
  it('createLoginToken returns exactly 8 uppercase hex characters', () => {
    const token = createLoginToken()
    expect(token).toHaveLength(8)
    expect(token).toMatch(/^[0-9A-F]{8}$/)
  })

  it('createLoginToken requests enough random bytes for the configured token length', () => {
    const byteLengths: number[] = []
    const token = createLoginToken(byteLength => {
      byteLengths.push(byteLength)
      return Buffer.from([0xab, 0xcd, 0x12, 0x34])
    })

    expect(token).toBe('ABCD1234')
    expect(byteLengths).toEqual([LOGIN_TOKEN_LENGTH / 2])
  })

  it('assertValidLoginToken rejects tokens that are not 8 uppercase hex characters', () => {
    expect(() => assertValidLoginToken('ABC12345')).not.toThrow()
    expect(() => assertValidLoginToken('ABC123456789')).toThrow(
      'Login token must be 8 uppercase hex characters',
    )
    expect(() => assertValidLoginToken('abc12345')).toThrow(
      'Login token must be 8 uppercase hex characters',
    )
  })
})
