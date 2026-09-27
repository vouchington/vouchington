import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { testOAuthClientExists } from '@voucha/test-helpers/data-stores/psql/oauth-client-metadata'
import {
  CLIENT_ID_METADATA_MAX_SIZE_BYTES,
  parseClientIdMetadataUrl,
  resolveClientIdMetadataDocument,
  type ClientIdMetadataDependencies,
} from './client-id-metadata-document.mts'
import { getOAuthClientDisplayName } from './known-clients.mts'

function randomMetadataUrl(): string {
  return `https://client.example/${randomBytes(12).toString('hex')}/metadata.json`
}

function metadataDocument(clientId: string, overrides: Record<string, unknown> = {}) {
  return {
    client_id: clientId,
    client_name: 'Metadata client',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: ['https://app.example:443/oauth/callback'],
    response_types: ['code'],
    scope: 'mcp.user:read',
    token_endpoint_auth_method: 'none',
    ...overrides,
  }
}

function responseFor(
  body: unknown,
  init: ResponseInit = {},
): Awaited<ReturnType<ClientIdMetadataDependencies['safeFetch']>> {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...init.headers },
    ...init,
  }) as unknown as Awaited<ReturnType<ClientIdMetadataDependencies['safeFetch']>>
}

describe('Client ID Metadata Documents', () => {
  it('uses a reviewed name only for an exact known Client Identifier URL', () => {
    const metadataUrl = 'https://client.example/metadata.json'
    const knownClients = { [metadataUrl]: 'Reviewed client' }
    expect(getOAuthClientDisplayName(metadataUrl, knownClients)).toBe('Reviewed client')
    expect(getOAuthClientDisplayName(`${metadataUrl}?other`, knownClients)).toBe('client.example')
  })

  it.each([
    ['mismatched client ID', { client_id: 'https://other.example/metadata.json' }],
    ['shared client secret', { client_secret: 'secret' }],
    ['client secret expiry', { client_secret_expires_at: 0 }],
    ['private RSA key material', { jwks: { keys: [{ kty: 'RSA', d: 'private' }] } }],
    ['symmetric key material', { jwks: { keys: [{ kty: 'oct', k: 'private' }] } }],
    ['confidential authentication', { token_endpoint_auth_method: 'client_secret_basic' }],
    ['unlisted grant', { grant_types: ['client_credentials'] }],
  ])('rejects %s without persisting the document', async (_name, overrides) => {
    const clientId = randomMetadataUrl()
    await expect(
      resolveClientIdMetadataDocument(clientId, {
        safeFetch: async () => responseFor(metadataDocument(clientId, overrides)),
      }),
    ).rejects.toMatchObject({ code: 'unauthorized_client' })
    await expect(testOAuthClientExists(clientId)).resolves.toBe(false)
  })

  it('accepts public JWK metadata because only private key material is forbidden', async () => {
    const clientId = randomMetadataUrl()
    const client = await resolveClientIdMetadataDocument(clientId, {
      safeFetch: async () =>
        responseFor(
          metadataDocument(clientId, {
            jwks: { keys: [{ e: 'AQAB', kty: 'RSA', n: 'public-modulus' }] },
          }),
        ),
    })
    expect(client?.client_id).toBe(clientId)
  })

  it.each([
    'http://client.example/metadata.json',
    'https://user@client.example/metadata.json',
    'https://@client.example/metadata.json',
    'https://client.example/metadata.json#fragment',
    'https://client.example/metadata.json#',
    'https://client.example/metadata.json\n',
    'https://client.example\\other.example/metadata.json',
    'https://client.example/a/../metadata.json',
    'https://client.example/a/%2e%2e/metadata.json',
    'https://client.example',
  ])('rejects an invalid Client Identifier URL before fetching: %s', async clientId => {
    const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>()
    await expect(resolveClientIdMetadataDocument(clientId, { safeFetch })).resolves.toBeNull()
    expect(safeFetch).not.toHaveBeenCalled()
  })

  it.each(['https://127.0.0.1/metadata.json', 'https://[::1]/metadata.json'])(
    'rejects private and loopback targets through the SSRF-safe fetch: %s',
    async clientId => {
      await expect(resolveClientIdMetadataDocument(clientId)).rejects.toMatchObject({
        code: 'unauthorized_client',
      })
    },
  )

  it('rejects redirects without following them', async () => {
    const clientId = randomMetadataUrl()
    const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>(async (_url, options) => {
      expect(options?.maxRedirects).toBe(0)
      throw new Error('too many redirects')
    })
    await expect(resolveClientIdMetadataDocument(clientId, { safeFetch })).rejects.toMatchObject({
      code: 'unauthorized_client',
    })
    expect(safeFetch).toHaveBeenCalledOnce()
  })

  it('bounds the response body and rejects oversized or timed-out reads', async () => {
    const clientId = randomMetadataUrl()
    let requestSignal: AbortSignal | null | undefined
    const readResponseBodyAsBuffer = vi.fn<
      ClientIdMetadataDependencies['readResponseBodyAsBuffer']
    >(async options => {
      expect(options.maxSizeBytes).toBe(CLIENT_ID_METADATA_MAX_SIZE_BYTES)
      expect(options.signal).toBeInstanceOf(AbortSignal)
      expect(options.signal).not.toBe(requestSignal)
      expect(requestSignal?.aborted).toBe(false)
      throw new Error('body too large')
    })
    await expect(
      resolveClientIdMetadataDocument(clientId, {
        readResponseBodyAsBuffer,
        safeFetch: async (_url, options) => {
          requestSignal = options?.signal
          return responseFor(metadataDocument(clientId))
        },
      }),
    ).rejects.toMatchObject({ code: 'unauthorized_client' })
    expect(readResponseBodyAsBuffer).toHaveBeenCalledOnce()
  })

  it('rejects non-JSON and non-200 responses and cancels their bodies', async () => {
    const clientId = randomMetadataUrl()
    const body = { cancel: vi.fn<() => Promise<void>>(async () => undefined) }
    await expect(
      resolveClientIdMetadataDocument(clientId, {
        safeFetch: async () =>
          ({
            body,
            headers: new Headers({ 'content-type': 'text/html' }),
            ok: false,
            status: 302,
            url: clientId,
          }) as unknown as Awaited<ReturnType<ClientIdMetadataDependencies['safeFetch']>>,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized_client' })
    expect(body.cancel).toHaveBeenCalledOnce()
  })

  it('applies cache age and the one-hour freshness ceiling', async () => {
    const clientId = randomMetadataUrl()
    const now = new Date()
    const client = await resolveClientIdMetadataDocument(clientId, {
      safeFetch: async () =>
        responseFor(metadataDocument(clientId), {
          headers: {
            age: '1200',
            'cache-control': 'max-age=7200',
            'content-type': 'application/json',
            date: now.toUTCString(),
          },
        }),
    })
    if (!client?.metadata_expires_at || !client.metadata_refreshed_at) {
      throw new Error('persisted metadata freshness timestamps were not returned')
    }
    expect(client.metadata_expires_at.getTime() - client.metadata_refreshed_at.getTime()).toBe(
      40 * 60_000,
    )
  })

  it('gives no-store precedence over a conflicting positive max-age', async () => {
    const clientId = randomMetadataUrl()
    const client = await resolveClientIdMetadataDocument(clientId, {
      safeFetch: async () =>
        responseFor(metadataDocument(clientId), {
          headers: {
            'cache-control': 'no-store, max-age=3600',
            'content-type': 'application/json',
          },
        }),
    })
    expect(client?.metadata_expires_at?.getTime()).toBe(client?.metadata_refreshed_at?.getTime())
  })

  it('keeps the later-started document when concurrent refreshes complete out of order', async () => {
    const clientId = randomMetadataUrl()
    let releaseOlder: (() => void) | undefined
    let releaseNewer: (() => void) | undefined
    let markOlderStarted: (() => void) | undefined
    const olderWait = new Promise<void>(resolve => {
      releaseOlder = resolve
    })
    const newerWait = new Promise<void>(resolve => {
      releaseNewer = resolve
    })
    const olderStarted = new Promise<void>(resolve => {
      markOlderStarted = resolve
    })
    const older = resolveClientIdMetadataDocument(clientId, {
      safeFetch: async () => {
        markOlderStarted?.()
        await olderWait
        return responseFor(metadataDocument(clientId, { client_name: 'Older' }))
      },
    })
    await olderStarted
    const newer = resolveClientIdMetadataDocument(clientId, {
      safeFetch: async () => {
        await newerWait
        return responseFor(metadataDocument(clientId, { client_name: 'Newer' }))
      },
    })
    releaseNewer?.()
    await expect(newer).resolves.toMatchObject({ client_name: 'Newer' })
    releaseOlder?.()
    await expect(older).resolves.toMatchObject({ client_name: 'Newer' })
  })

  it('does not reuse an immediately stale winner after losing a refresh race', async () => {
    const clientId = randomMetadataUrl()
    let releaseOlder: (() => void) | undefined
    let markOlderStarted: (() => void) | undefined
    const olderWait = new Promise<void>(resolve => {
      releaseOlder = resolve
    })
    const olderStarted = new Promise<void>(resolve => {
      markOlderStarted = resolve
    })
    const older = resolveClientIdMetadataDocument(clientId, {
      safeFetch: async () => {
        markOlderStarted?.()
        await olderWait
        return responseFor(metadataDocument(clientId, { client_name: 'Older' }))
      },
    })
    const olderResult = older.catch((error: unknown) => error)
    await olderStarted
    await expect(
      resolveClientIdMetadataDocument(clientId, {
        safeFetch: async () =>
          responseFor(metadataDocument(clientId, { client_name: 'Newer' }), {
            headers: {
              'cache-control': 'no-store',
              'content-type': 'application/json',
            },
          }),
      }),
    ).resolves.toMatchObject({ client_name: 'Newer' })
    releaseOlder?.()
    await expect(olderResult).resolves.toMatchObject({ code: 'unauthorized_client' })
  })
})

describe('parseClientIdMetadataUrl', () => {
  it('keeps the exact URL spelling used as the client identifier', () => {
    expect(parseClientIdMetadataUrl('https://CLIENT.example:443/metadata.json?version=1')).toBe(
      'https://CLIENT.example:443/metadata.json?version=1',
    )
  })
})
