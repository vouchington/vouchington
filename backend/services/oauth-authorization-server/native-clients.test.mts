import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveClientIdMetadataDocument,
  type ClientIdMetadataDependencies,
} from './client-id-metadata-document.mts'
import { getNativeOAuthClientDocument, NATIVE_OAUTH_CLIENT_APPS } from './native-clients.mts'

describe('native OAuth client metadata', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['http', 'https'] as const)(
    'resolves each %s document from code without self-fetch',
    async scheme => {
      const suffix = randomBytes(4).toString('hex')
      const origin =
        scheme === 'http'
          ? `http://localhost:${30_000 + (randomBytes(2).readUInt16BE(0) % 20_000)}`
          : `https://native-${suffix}.example.test`
      vi.stubEnv('SITE_ORIGIN', origin)
      for (const app of NATIVE_OAUTH_CLIENT_APPS) {
        const document = getNativeOAuthClientDocument(app)
        const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>()
        const client = await resolveClientIdMetadataDocument(document.client_id, { safeFetch })
        expect(client).toMatchObject({
          client_id: document.client_id,
          client_name: document.client_name,
          redirect_uris: document.redirect_uris,
          token_endpoint_auth_method: 'none',
        })
        expect(safeFetch).not.toHaveBeenCalled()
      }
    },
  )

  it('does not recognize a near-miss local native Client Identifier URL', async () => {
    vi.stubEnv('SITE_ORIGIN', 'http://localhost:41937')
    const clientId = `${getNativeOAuthClientDocument('ios').client_id}?other=1`
    const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>()
    await expect(resolveClientIdMetadataDocument(clientId, { safeFetch })).resolves.toBeNull()
    expect(safeFetch).not.toHaveBeenCalled()
  })
})
