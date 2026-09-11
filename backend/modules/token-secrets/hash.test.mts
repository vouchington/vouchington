import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { hashToken } from './hash.mts'

const HASH_SECRET = 'this is a fake test OTP HMAC secret'

describe('hashToken', () => {
  let previousHashSecret: string | undefined

  beforeEach(() => {
    previousHashSecret = process.env.VOUCHA_OTP_TOKEN_HASH_SECRET
    process.env.VOUCHA_OTP_TOKEN_HASH_SECRET = HASH_SECRET
  })

  afterEach(() => {
    if (previousHashSecret === undefined) delete process.env.VOUCHA_OTP_TOKEN_HASH_SECRET
    else process.env.VOUCHA_OTP_TOKEN_HASH_SECRET = previousHashSecret
  })

  it('hashes the same token differently by purpose', () => {
    const emailHash = hashToken('email-address-login-token', '123456')
    const phoneHash = hashToken('phone-number-login-token', '123456')

    expect(emailHash).toMatch(/^[A-F0-9]{64}$/)
    expect(phoneHash).toMatch(/^[A-F0-9]{64}$/)
    expect(emailHash).not.toBe(phoneHash)
  })

  it('matches the legacy stored-token digest', () => {
    expect(hashToken('email-address-login-token', '123456')).toBe(
      '7867DC59F99D5CD9D356920FCB9D8B9F70B7AF0AF0E77378F1496D788EA384E1',
    )
  })

  it('does not use bare SHA-256 of the token', () => {
    const token = '123456'
    const bareSha256 = createHash('sha256').update(token).digest('hex').toUpperCase()

    expect(hashToken('email-address-login-token', token)).not.toBe(bareSha256)
  })

  it('requires the HMAC secret', () => {
    delete process.env.VOUCHA_OTP_TOKEN_HASH_SECRET

    expect(() => hashToken('email-address-login-token', '123456')).toThrow(
      'VOUCHA_OTP_TOKEN_HASH_SECRET is not set',
    )
  })

  it('uses the trimmed configured secret', () => {
    const expected = hashToken('email-address-login-token', '123456')
    process.env.VOUCHA_OTP_TOKEN_HASH_SECRET = ` ${HASH_SECRET} `

    expect(hashToken('email-address-login-token', '123456')).toBe(expected)
  })

  it('refreshes cached hashing state when the configured secret changes', () => {
    const original = hashToken('email-address-login-token', '123456')
    process.env.VOUCHA_OTP_TOKEN_HASH_SECRET = 'a different fake test OTP HMAC secret'

    expect(hashToken('email-address-login-token', '123456')).not.toBe(original)

    process.env.VOUCHA_OTP_TOKEN_HASH_SECRET = HASH_SECRET
    expect(hashToken('email-address-login-token', '123456')).toBe(original)
  })
})
