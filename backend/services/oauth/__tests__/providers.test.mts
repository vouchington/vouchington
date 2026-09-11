import { describe, expect, it } from 'vitest'
import { assertValidProvider, oauthProviders } from '../providers.mts'

describe('assertValidProvider', () => {
  for (const provider of oauthProviders) {
    it(`returns '${provider}' for valid provider`, () => {
      expect(assertValidProvider(provider)).toBe(provider)
    })
  }

  it('throws 400 for unknown provider', () => {
    let caughtError: (Error & { status: number }) | undefined
    try {
      assertValidProvider('myspace')
    } catch (error) {
      caughtError = error as Error & { status: number }
    }
    expect(caughtError).toBeDefined()
    const error = caughtError!
    expect(() => {
      throw new Error(error.message)
    }).toThrow(/Invalid OAuth provider/)
    expect(error.status).toBe(400)
  })

  it('throws 400 for empty string', () => {
    let caughtError: (Error & { status: number }) | undefined
    try {
      assertValidProvider('')
    } catch (error) {
      caughtError = error as Error & { status: number }
    }
    expect(caughtError).toBeDefined()
    const error = caughtError!
    expect(() => {
      throw new Error(error.message)
    }).toThrow(/Invalid OAuth provider/)
    expect(error.status).toBe(400)
  })
})
