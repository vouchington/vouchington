import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyGooglePubSubOidcJwt } from './oidc-verifier.mts'
import type { GoogleOidcPublicJwk, GoogleOidcTrustMaterial } from './types.mts'

const issuer = 'https://accounts.google.com'
const audience = 'https://example.com/google-play-rtdn'
const serviceAccountEmail = 'google-pubsub@example.iam.gserviceaccount.com'
const keyId = 'synthetic-google-key'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

describe('Google Pub/Sub OIDC verification', () => {
  it('accepts a signed token for the configured trust material', () => {
    expect(verifyGooglePubSubOidcJwt(createJwt(), createTrust())).toBe('valid')
  })

  it.each([
    ['a different audience', { aud: 'https://other.example.com' }],
    ['an audience array without the configured audience', { aud: ['https://other.example.com'] }],
    ['a different issuer', { iss: 'https://accounts.google.com.evil.example' }],
  ])('rejects tokens with %s', (_description, claims) => {
    expect(verifyGooglePubSubOidcJwt(createJwt(claims), createTrust())).toBe('invalid')
  })

  it('requires the configured service identity and verified email claim', () => {
    expect(
      verifyGooglePubSubOidcJwt(
        createJwt({ email: 'tests+0123456789abcdef@voucha.ai' }),
        createTrust(),
      ),
    ).toBe('invalid')
    expect(verifyGooglePubSubOidcJwt(createJwt({ email_verified: false }), createTrust())).toBe(
      'invalid',
    )
  })

  it('reports an unavailable trust key so the caller can retry after JWKS refresh', () => {
    expect(verifyGooglePubSubOidcJwt(createJwt({ kid: 'rotated-google-key' }), createTrust())).toBe(
      'key_unavailable',
    )
    expect(verifyGooglePubSubOidcJwt(createJwt(), { ...createTrust(), keysById: {} })).toBe(
      'key_unavailable',
    )
  })

  it('rejects malformed, expired, excessive-lifetime, and incorrectly signed tokens', () => {
    const now = Math.floor(Date.now() / 1000)
    for (const token of ['', 'one.two', 'one.two.three.four', 'x'.repeat(16_385)])
      expect(verifyGooglePubSubOidcJwt(token, createTrust())).toBe('invalid')
    expect(verifyGooglePubSubOidcJwt(createJwt({ exp: now - 3600 }), createTrust())).toBe('invalid')
    expect(verifyGooglePubSubOidcJwt(createJwt({ iat: now + 3600 }), createTrust())).toBe('invalid')
    expect(verifyGooglePubSubOidcJwt(createJwt({ exp: now + 7200 }), createTrust())).toBe('invalid')
    const signed = createJwt()
    expect(verifyGooglePubSubOidcJwt(`${signed.slice(0, -4)}AAAA`, createTrust())).toBe('invalid')
    expect(
      verifyGooglePubSubOidcJwt(createJwt(), {
        ...createTrust(),
        keysById: { [keyId]: { kty: 'RSA', n: 'invalid', e: 'AQAB' } },
      }),
    ).toBe('invalid')
  })

  it('rejects invalid JWT JSON and unsupported signing algorithms before key lookup', () => {
    const malformedPart = Buffer.from('{').toString('base64url')
    const validPart = Buffer.from('{}').toString('base64url')
    expect(
      verifyGooglePubSubOidcJwt(`${malformedPart}.${validPart}.signature`, createTrust()),
    ).toBe('invalid')
    expect(
      verifyGooglePubSubOidcJwt(`${validPart}.${malformedPart}.signature`, createTrust()),
    ).toBe('invalid')
    const unsupportedHeader = Buffer.from(JSON.stringify({ alg: 'none', kid: keyId })).toString(
      'base64url',
    )
    expect(
      verifyGooglePubSubOidcJwt(`${unsupportedHeader}.${validPart}.signature`, createTrust()),
    ).toBe('invalid')
  })

  it('rejects a trust entry that cannot be imported as an RSA key', () => {
    expect(
      verifyGooglePubSubOidcJwt(createJwt(), {
        ...createTrust(),
        keysById: { [keyId]: { kty: 'RSA', n: '', e: '' } },
      }),
    ).toBe('invalid')
  })
})

function createTrust(): GoogleOidcTrustMaterial {
  return {
    issuer,
    audience,
    serviceAccountEmail,
    keysById: {
      [keyId]: publicKey.export({ format: 'jwk' }) as GoogleOidcPublicJwk,
    },
  }
}

function createJwt(
  overrides: Partial<{
    aud: unknown
    email: unknown
    email_verified: unknown
    exp: unknown
    iat: unknown
    iss: unknown
    kid: string
  }> = {},
): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', kid: overrides.kid ?? keyId }
  const claims = {
    iss: overrides.iss ?? issuer,
    aud: overrides.aud ?? audience,
    email: overrides.email ?? serviceAccountEmail,
    email_verified: overrides.email_verified ?? true,
    iat: overrides.iat ?? now - 30,
    exp: overrides.exp ?? now + 300,
  }
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${encodedHeader}.${encodedClaims}`
  const encodedSignature = sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')
  return `${input}.${encodedSignature}`
}
