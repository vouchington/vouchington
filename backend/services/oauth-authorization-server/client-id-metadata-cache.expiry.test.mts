import { describe, expect, it, vi } from 'vitest'
import { createTestOAuthMetadataExpiryFixture } from '@voucha/test-helpers/oauth-client-metadata-expiry'
import { getFreshClientIdMetadataClient } from './client-id-metadata-cache.mts'
import {
  resolveClientIdMetadataDocument,
  type ClientIdMetadataDependencies,
} from './client-id-metadata-document.mts'

function fetchedMetadata(
  clientId: string,
): Pick<ClientIdMetadataDependencies, 'safeFetch' | 'readResponseBodyAsBuffer'> {
  return {
    safeFetch: async () => ({
      body: null,
      headers: new Headers({ 'content-type': 'application/json', 'cache-control': 'max-age=600' }),
      ok: true,
      status: 200,
      url: clientId,
    }),
    readResponseBodyAsBuffer: async () =>
      Buffer.from(
        JSON.stringify({
          client_id: clientId,
          client_name: 'Fetched metadata',
          redirect_uris: ['https://app.example/oauth/callback'],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          scope: 'mcp.user:read',
        }),
      ),
  }
}

describe('Client ID metadata native freshness predicate', () => {
  it.each([-1, 0, 1] as const)(
    'uses strict expiry at transaction time plus %sms',
    async offsetMs => {
      await using fixture = await createTestOAuthMetadataExpiryFixture(offsetMs)
      const fresh = await getFreshClientIdMetadataClient(fixture.clientId, fixture.query)
      expect(fresh?.client_name ?? null).toBe(offsetMs > 0 ? 'Cached metadata' : null)
      const provider = fetchedMetadata(fixture.clientId)
      const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>(provider.safeFetch)
      const result = await resolveClientIdMetadataDocument(fixture.clientId, {
        ...provider,
        query: fixture.query,
        safeFetch,
      })
      expect(result).toMatchObject({
        client_id: fixture.clientId,
        client_name: offsetMs > 0 ? 'Cached metadata' : 'Fetched metadata',
        revoked_at: null,
      })
      expect(safeFetch).toHaveBeenCalledTimes(offsetMs > 0 ? 0 : 1)
      expect(await fixture.readClock()).toEqual(fixture.clock)
      await expect(
        getFreshClientIdMetadataClient(fixture.clientId, fixture.query),
      ).resolves.toMatchObject({
        id: result?.id,
        client_name: result?.client_name,
      })
    },
  )

  it('does not reuse or revive a revoked row even when its expiry is still fresh', async () => {
    await using fixture = await createTestOAuthMetadataExpiryFixture(1, true)
    await expect(
      getFreshClientIdMetadataClient(fixture.clientId, fixture.query),
    ).resolves.toBeNull()
    const provider = fetchedMetadata(fixture.clientId)
    const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>(provider.safeFetch)
    await expect(
      resolveClientIdMetadataDocument(fixture.clientId, {
        ...provider,
        query: fixture.query,
        safeFetch,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized_client' })
    expect(safeFetch).toHaveBeenCalledOnce()
    expect(await fixture.readClock()).toEqual(fixture.clock)
    await expect(
      getFreshClientIdMetadataClient(fixture.clientId, fixture.query),
    ).resolves.toBeNull()
  })
})
