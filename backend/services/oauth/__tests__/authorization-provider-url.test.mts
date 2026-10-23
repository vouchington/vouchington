import { describe, expect, it } from 'vitest'
import { buildProviderAuthorizationUrl } from '../authorization-provider-url.mts'

describe('LinkedIn authorization URL', () => {
  it('enables extended login only for native broker callbacks', () => {
    const request = {
      provider: 'linkedin',
      clientId: 'linkedin-client-id',
      redirectUri: 'https://example.com/auth/callback/linkedin/broker',
      state: 'opaque-state',
      codeChallenge: 'Z'.repeat(43),
    } as const
    const native = new URL(buildProviderAuthorizationUrl({ ...request, callbackMode: 'native' }))
    const web = new URL(buildProviderAuthorizationUrl({ ...request, callbackMode: 'web' }))

    expect(native.searchParams.get('enable_extended_login')).toBe('true')
    expect(web.searchParams.has('enable_extended_login')).toBe(false)
    expect(native.searchParams.get('redirect_uri')).toBe(web.searchParams.get('redirect_uri'))
    expect(native.searchParams.get('scope')).toBe(web.searchParams.get('scope'))
  })
})

describe('Google authorization URL', () => {
  it('requests minimal OIDC scopes with S256 PKCE and the confidential callback', () => {
    const authorization = new URL(
      buildProviderAuthorizationUrl({
        provider: 'google',
        callbackMode: 'native',
        clientId: 'google-client',
        redirectUri: 'https://example.com/auth/callback/google/broker',
        state: 'opaque-state',
        codeChallenge: 'challenge',
      }),
    )
    expect(authorization.origin + authorization.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(Object.fromEntries(authorization.searchParams)).toMatchObject({
      client_id: 'google-client',
      redirect_uri: 'https://example.com/auth/callback/google/broker',
      response_type: 'code',
      scope: 'openid profile email',
      state: 'opaque-state',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    })
  })
})

describe('nonce-bound OIDC provider confirmation', () => {
  it('requests the Microsoft confirmation nonce without adding it to ordinary authorization', () => {
    const provider = 'microsoft' as const
    const request = {
      provider,
      callbackMode: 'web',
      clientId: 'synthetic-client',
      redirectUri: 'https://example.com/callback',
      state: 'synthetic-state',
      codeChallenge: 'synthetic-challenge',
    } as const
    const ordinary = new URL(buildProviderAuthorizationUrl(request))
    const confirmation = new URL(
      buildProviderAuthorizationUrl({ ...request, reAuthNonce: 'fresh-server-nonce' }),
    )
    expect(ordinary.searchParams.has('nonce')).toBe(false)
    expect(confirmation.searchParams.get('nonce')).toBe('fresh-server-nonce')
    expect(confirmation.searchParams.get('prompt')).toBe('login')
  })
})
