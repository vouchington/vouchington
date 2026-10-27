import { it, expect, describe } from 'vitest'
import { assertValidLoginToken, createLoginToken, LOGIN_TOKEN_LENGTH } from './login-token.mts'

describe('login-token', () => {
  it('creates a ten-character uppercase base32 code', () => {
    expect(createLoginToken()).toMatch(/^[A-Z2-7]{10}$/)
  })

  it('maps five unbiased bits from each random byte into the code alphabet', () => {
    const byteLengths: number[] = []
    const token = createLoginToken(byteLength => {
      byteLengths.push(byteLength)
      return Buffer.from([0, 25, 26, 31, 32, 57, 58, 63, 64, 255])
    })
    expect(token).toBe('AZ27AZ27A7')
    expect(byteLengths).toEqual([LOGIN_TOKEN_LENGTH])
  })

  it('rejects the wrong alphabet, casing, or length', () => {
    expect(() => assertValidLoginToken('ABCDEFG234')).not.toThrow()
    for (const token of ['abcdefgh23', 'ABCDEFG230', 'ABCDEFG239', 'ABCD2345', 'ABCDEFGHIJK']) {
      expect(() => assertValidLoginToken(token)).toThrow(
        'Login token must be 10 uppercase base32 characters',
      )
    }
  })
})
