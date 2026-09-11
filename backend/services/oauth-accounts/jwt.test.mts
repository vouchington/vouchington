import { describe, expect, it } from 'vitest'
import { decodeJwtPart } from './jwt.mts'

describe('decodeJwtPart', () => {
  it('decodes a base64url-encoded JSON part', () => {
    const part = Buffer.from(JSON.stringify({ sub: 'user-id' })).toString('base64url')

    expect(decodeJwtPart(part)).toEqual({ sub: 'user-id' })
  })

  it('throws a 422 when the part does not decode to valid JSON', () => {
    expect(() => decodeJwtPart('not-valid-jwt-part')).toThrow('Invalid JWT format')

    let thrown: unknown
    try {
      decodeJwtPart('not-valid-jwt-part')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({ status: 422, message: 'Invalid JWT format' })
  })
})
