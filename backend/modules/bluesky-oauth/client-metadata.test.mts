import { describe, expect, it } from 'vitest'
import {
  getBlueskyClientId,
  getBlueskyClientMetadata,
  getBlueskyRedirectUri,
} from './client-metadata.mts'

// getBlueskyClientMetadata() returns OAuthClientMetadataInput, whose jwks.keys is typed `unknown[]`
// (the pre-validation input shape) — narrow to what a public EC JWK is expected to carry.
interface InlinePublicEcJwk {
  kty?: unknown
  crv?: unknown
  d?: unknown
}

describe('getBlueskyClientMetadata', () => {
  it('is a confidential client: private_key_jwt with an inline ES256 JWKS', async () => {
    const metadata = await getBlueskyClientMetadata()
    expect(metadata.token_endpoint_auth_method).toBe('private_key_jwt')
    expect(metadata.token_endpoint_auth_signing_alg).toBe('ES256')
    const keys = (metadata.jwks?.keys ?? []) as InlinePublicEcJwk[]
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every(key => key.kty === 'EC' && key.crv === 'P-256')).toBe(true)
    // The private half must never leak into the served document. publicJwk sets d: undefined
    // rather than deleting the key, so 'd' in key stays true in-memory — assert on the actual
    // serialized shape instead, matching what the GET /client-metadata.json route serves.
    const serialized = JSON.parse(JSON.stringify(keys)) as InlinePublicEcJwk[]
    expect(serialized.every(key => !('d' in key))).toBe(true)
    expect('jwks_uri' in metadata).toBe(false)
  })

  it('advertises DPoP-bound tokens and the atproto scope', async () => {
    const metadata = await getBlueskyClientMetadata()
    expect(metadata.dpop_bound_access_tokens).toBe(true)
    expect(metadata.scope).toContain('atproto')
  })

  it('client_id is a self-referencing URL to the metadata document it describes', async () => {
    const metadata = await getBlueskyClientMetadata()
    expect(metadata.client_id).toBe(getBlueskyClientId())
    expect(metadata.client_id).toMatch(/\/client-metadata\.json$/)
  })

  it('redirect_uris contains exactly the OAuth callback route', async () => {
    const metadata = await getBlueskyClientMetadata()
    expect(metadata.redirect_uris).toEqual([getBlueskyRedirectUri()])
  })

  it('grant_types cover both the initial code exchange and token refresh', async () => {
    const metadata = await getBlueskyClientMetadata()
    expect(metadata.grant_types).toEqual(['authorization_code', 'refresh_token'])
  })
})
