import { describe, expect, it } from 'vitest'
import { assertValidRedirectUri } from '../assert-valid-redirect-uri.mts'

describe('assertValidRedirectUri', () => {
  const origin = 'https://example.com'

  it('passes for a valid redirect URI', () => {
    expect(() =>
      assertValidRedirectUri('https://example.com/auth/callback/github', 'github', origin),
    ).not.toThrow()
  })

  it('throws 422 for an invalid URL', () => {
    let caughtError: (Error & { status: number }) | undefined
    try {
      assertValidRedirectUri('not-a-url', 'github', origin)
    } catch (error) {
      caughtError = error as Error & { status: number }
    }
    expect(caughtError).toBeDefined()
    const error = caughtError!
    expect(() => {
      throw new Error(error.message)
    }).toThrow(/^Invalid redirectUri/)
    expect(error.status).toBe(422)
  })

  it('throws 422 for wrong pathname', () => {
    expect(() =>
      assertValidRedirectUri('https://example.com/auth/callback/x', 'github', origin),
    ).toThrow('Invalid redirectUri')
  })

  it('throws 422 for wrong origin', () => {
    expect(() =>
      assertValidRedirectUri('https://evil.com/auth/callback/github', 'github', origin),
    ).toThrow('Invalid redirectUri')
  })

  it('works for each code-based provider', () => {
    for (const provider of ['x', 'linkedin', 'microsoft', 'github'] as const) {
      expect(() =>
        assertValidRedirectUri(`https://example.com/auth/callback/${provider}`, provider, origin),
      ).not.toThrow()
    }
  })
})
