import { describe, expect, it } from 'vitest'
import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'
import { tokenToBody } from './oauth-token-body'

describe('tokenToBody', () => {
  it('handles facebook token', () => {
    const token: OAuthLoginToken = { provider: 'facebook', token: 'fb-token-123' }
    expect(tokenToBody(token)).toEqual({ token: 'fb-token-123' })
  })

  it('handles apple token without userData', () => {
    const token: OAuthLoginToken = {
      provider: 'apple',
      token: 'apple-token-123',
      nonce: 'nonce-123',
    }
    expect(tokenToBody(token)).toEqual({
      token: 'apple-token-123',
      nonce: 'nonce-123',
    })
  })

  it('handles apple token with userData', () => {
    const token: OAuthLoginToken = {
      provider: 'apple',
      token: 'apple-token-123',
      nonce: 'nonce-123',
      userData: { name: 'John Doe' },
    }
    expect(tokenToBody(token)).toEqual({
      token: 'apple-token-123',
      nonce: 'nonce-123',
      userData: { name: 'John Doe' },
    })
  })

  it('handles google token', () => {
    const token: OAuthLoginToken = { provider: 'google', credential: 'google-cred-123' }
    expect(tokenToBody(token)).toEqual({ credential: 'google-cred-123' })
  })

  it.each(['x', 'linkedin', 'microsoft'] as const)('handles %s token', provider => {
    const token: OAuthLoginToken = {
      provider,
      code: `${provider}-code`,
      codeVerifier: `${provider}-verifier`,
      redirectUri: `${provider}-uri`,
    }
    expect(tokenToBody(token)).toEqual({
      code: `${provider}-code`,
      codeVerifier: `${provider}-verifier`,
      redirectUri: `${provider}-uri`,
    })
  })

  it('handles github token', () => {
    const token: OAuthLoginToken = { provider: 'github', code: 'gh-code', redirectUri: 'gh-uri' }
    expect(tokenToBody(token)).toEqual({ code: 'gh-code', redirectUri: 'gh-uri' })
  })
})
