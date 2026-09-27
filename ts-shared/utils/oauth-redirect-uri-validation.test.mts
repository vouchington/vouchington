import { describe, expect, it } from 'vitest'
import { validateOAuthRedirectUris } from './oauth-redirect-uri-validation.mts'

describe('validateOAuthRedirectUris', () => {
  it('normalizes valid HTTPS and loopback HTTP URIs', () => {
    expect(
      validateOAuthRedirectUris(['https://example.com/callback', 'http://localhost:3000/callback']),
    ).toEqual({
      valid: true,
      redirectUris: ['https://example.com/callback', 'http://localhost:3000/callback'],
    })
  })

  it('returns a stable code for each rejected redirect-URI rule', () => {
    expect(validateOAuthRedirectUris([])).toMatchObject({ code: 'invalid_count' })
    expect(
      validateOAuthRedirectUris(Array.from({ length: 11 }, () => 'https://example.com/callback')),
    ).toMatchObject({ code: 'invalid_count' })
    expect(validateOAuthRedirectUris(['not a URL'])).toMatchObject({ code: 'invalid_uri' })
    expect(
      validateOAuthRedirectUris(['https://example.com/callback\u0000'], { serialize: false }),
    ).toMatchObject({ code: 'invalid_uri' })
    expect(validateOAuthRedirectUris(['https://example.com/call back'])).toMatchObject({
      code: 'invalid_uri',
    })
    expect(validateOAuthRedirectUris([`https://example.com/${'a'.repeat(2048)}`])).toMatchObject({
      code: 'invalid_uri',
    })
    expect(validateOAuthRedirectUris([`https://example.com/${'💩'.repeat(1000)}`])).toMatchObject({
      code: 'invalid_uri',
    })
    expect(validateOAuthRedirectUris(['https://*.example.com/callback'])).toMatchObject({
      code: 'wildcard',
    })
    expect(
      validateOAuthRedirectUris(['https://%75%73%65%72@redirect.test/callback']),
    ).toMatchObject({ code: 'userinfo_or_fragment' })
    expect(validateOAuthRedirectUris(['https://example.com/callback#fragment'])).toMatchObject({
      code: 'userinfo_or_fragment',
    })
    expect(validateOAuthRedirectUris(['http://example.com/callback'])).toMatchObject({
      code: 'invalid_scheme',
    })
  })

  it('detects duplicates after URL serialization', () => {
    expect(
      validateOAuthRedirectUris([
        'https://example.com/callback',
        'https://example.com:443/callback',
      ]),
    ).toMatchObject({ code: 'duplicate' })
  })

  it('preserves redirect URI strings when serialization is disabled', () => {
    const redirectUris = ['https://EXAMPLE.com:443/callback', 'https://example.com/callback']

    expect(validateOAuthRedirectUris(redirectUris, { serialize: false })).toEqual({
      valid: true,
      redirectUris,
    })
  })
})
