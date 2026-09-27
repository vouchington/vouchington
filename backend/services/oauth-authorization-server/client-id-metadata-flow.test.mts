import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { revokeTestOAuthClient } from '@voucha/test-helpers/data-stores/psql/oauth-client-metadata'
import {
  resolveClientIdMetadataDocument,
  type ClientIdMetadataDependencies,
} from './client-id-metadata-document.mts'
import {
  beginOAuthAuthorizationRequest,
  beginValidatedOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  getOAuthAuthorizationErrorRedirect,
  getOAuthAuthorizationRequestForUser,
  getOAuthResourceUrl,
  OAuthProtocolError,
  validateOAuthAuthorizationRequest,
} from './index.mts'

function randomMetadataUrl(): string {
  return `https://client.example/${randomBytes(12).toString('hex')}/metadata.json`
}

function metadataDocument(clientId: string) {
  return {
    client_id: clientId,
    client_name: 'Metadata client',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: ['https://app.example:443/oauth/callback'],
    response_types: ['code'],
    scope: 'mcp.user:read',
    token_endpoint_auth_method: 'none',
  }
}

function responseFor(
  clientId: string,
  headers: Record<string, string> = {},
): Awaited<ReturnType<ClientIdMetadataDependencies['safeFetch']>> {
  return new Response(JSON.stringify(metadataDocument(clientId)), {
    headers: { 'content-type': 'application/json', ...headers },
  }) as unknown as Awaited<ReturnType<ClientIdMetadataDependencies['safeFetch']>>
}

describe('Client ID Metadata Document OAuth flow', () => {
  it('persists exact strings and reuses a fresh cache', async () => {
    const clientId = randomMetadataUrl()
    const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>(async (_url, options) => {
      expect(options).toMatchObject({ allowedProtocols: ['https:'], maxRedirects: 0 })
      return responseFor(clientId, { 'cache-control': 'max-age=600' })
    })
    const first = await resolveClientIdMetadataDocument(clientId, { safeFetch })
    const second = await resolveClientIdMetadataDocument(clientId, { safeFetch })
    expect(first).toMatchObject({
      client_id: clientId,
      metadata_url: clientId,
      client_name: 'Metadata client',
      client_type: 'public',
      token_endpoint_auth_method: 'none',
      redirect_uris: ['https://app.example:443/oauth/callback'],
      scopes: ['mcp.user:read'],
    })
    expect(second?.id).toBe(first?.id)
    expect(safeFetch).toHaveBeenCalledOnce()
  })

  it('does not revive a revoked document client during refresh', async () => {
    const clientId = randomMetadataUrl()
    await resolveClientIdMetadataDocument(clientId, {
      safeFetch: async () => responseFor(clientId),
    })
    await revokeTestOAuthClient(clientId)
    const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>(async () =>
      responseFor(clientId),
    )

    await expect(resolveClientIdMetadataDocument(clientId, { safeFetch })).rejects.toMatchObject({
      code: 'unauthorized_client',
    })
    expect(safeFetch).toHaveBeenCalledOnce()
  })

  it('completes consent and token exchange with S256 PKCE', async () => {
    const user = await createTestUserDirect()
    const clientId = randomMetadataUrl()
    const redirectUri = 'https://app.example:443/oauth/callback'
    const verifier = randomBytes(32).toString('base64url')
    const deviceId = uuidv7()
    const sessionId = uuidv7()
    const pending = await beginOAuthAuthorizationRequest(
      {
        clientId,
        codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
        codeChallengeMethod: 'S256',
        deviceId,
        redirectUri,
        resource: getOAuthResourceUrl('user'),
        responseType: 'code',
        scope: 'mcp.user:read',
        sessionId,
        state: randomBytes(12).toString('base64url'),
        userId: user.id,
      },
      { safeFetch: async () => responseFor(clientId) },
    )
    const bindingHash = createOAuthBrowserBindingHash(deviceId, sessionId)
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, pending.request_id, bindingHash),
    ).resolves.toMatchObject({
      client_hostname: 'client.example',
      client_name: 'client.example',
    })
    const decision = await decideOAuthAuthorizationRequest(
      user.id,
      pending.request_id,
      'approve',
      bindingHash,
    )
    const code = new URL(decision.redirect_uri).searchParams.get('code')
    if (!code) throw new Error('authorization code was not returned')
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId,
        code,
        codeVerifier: verifier,
        redirectUri,
      }),
    ).resolves.toMatchObject({ scope: 'mcp.user:read', token_type: 'Bearer' })
  })

  it('reuses one no-store metadata fetch when beginning an already validated request', async () => {
    const user = await createTestUserDirect()
    const clientId = randomMetadataUrl()
    const verifier = randomBytes(32).toString('base64url')
    const safeFetch = vi.fn<ClientIdMetadataDependencies['safeFetch']>(async () =>
      responseFor(clientId, { 'cache-control': 'no-store' }),
    )
    const parameters = {
      clientId,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
      redirectUri: 'https://app.example:443/oauth/callback',
      resource: getOAuthResourceUrl('user'),
      responseType: 'code',
      scope: 'mcp.user:read',
      state: randomBytes(12).toString('base64url'),
    }
    const validated = await validateOAuthAuthorizationRequest(parameters, { safeFetch })

    await beginValidatedOAuthAuthorizationRequest(
      { deviceId: uuidv7(), sessionId: uuidv7(), userId: user.id },
      validated,
    )

    expect(safeFetch).toHaveBeenCalledOnce()
  })

  it('resolves an uncached document before returning a redirectable protocol error', async () => {
    const clientId = randomMetadataUrl()
    const redirectUri = 'https://app.example:443/oauth/callback'
    const state = 'opaque-state'
    const safeFetch: ClientIdMetadataDependencies['safeFetch'] = async () => responseFor(clientId)
    const error = await validateOAuthAuthorizationRequest({
      clientId,
      codeChallenge: 'unused-for-this-error',
      codeChallengeMethod: 'S256',
      redirectUri,
      resource: getOAuthResourceUrl('user'),
      responseType: 'token',
      scope: 'mcp.user:read',
      state,
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'unsupported_response_type' })
    if (!(error instanceof OAuthProtocolError)) throw new Error('expected OAuth protocol error')

    const location = await getOAuthAuthorizationErrorRedirect(
      { clientId, redirectUri, state, error },
      { safeFetch },
    )
    expect(location).not.toBeNull()
    const errorRedirect = new URL(location ?? '')
    expect(errorRedirect.origin + errorRedirect.pathname).toBe('https://app.example/oauth/callback')
    expect(errorRedirect.searchParams.get('error')).toBe('unsupported_response_type')
    expect(errorRedirect.searchParams.get('error_description')).toBe('response_type must be code')
    expect(errorRedirect.searchParams.get('state')).toBe(state)
    expect(errorRedirect.searchParams.get('iss')).toBeTruthy()
    await expect(
      getOAuthAuthorizationErrorRedirect(
        { clientId, redirectUri: 'https://attacker.example/callback', state, error },
        { safeFetch },
      ),
    ).resolves.toBeNull()
    await expect(
      getOAuthAuthorizationErrorRedirect(
        { clientId: randomMetadataUrl(), redirectUri, state, error },
        { safeFetch: async () => Promise.reject(new Error('unavailable')) },
      ),
    ).resolves.toBeNull()
  })

  it('refreshes stale metadata before deciding whether an error redirect is safe', async () => {
    const clientId = randomMetadataUrl()
    const verifier = randomBytes(32).toString('base64url')
    const safeFetch: ClientIdMetadataDependencies['safeFetch'] = async () =>
      responseFor(clientId, { 'cache-control': 'max-age=0' })
    await expect(
      validateOAuthAuthorizationRequest(
        {
          clientId,
          codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
          codeChallengeMethod: 'S256',
          redirectUri: 'https://app.example/oauth/callback',
          resource: getOAuthResourceUrl('user'),
          responseType: 'code',
          scope: 'mcp.user:read',
          state: 'opaque-state',
        },
        { safeFetch },
      ),
    ).rejects.toMatchObject({
      code: 'invalid_request',
      message: 'redirect_uri is not registered for this client',
    })
    const redirectInput = {
      clientId,
      redirectUri: 'https://app.example:443/oauth/callback',
      state: 'opaque-state',
      error: new OAuthProtocolError('invalid_scope', 'scope rejected'),
    }
    await expect(getOAuthAuthorizationErrorRedirect(redirectInput, { safeFetch })).resolves.toMatch(
      /^https:\/\/app\.example\/oauth\/callback\?error=invalid_scope/u,
    )
    await expect(
      getOAuthAuthorizationErrorRedirect(redirectInput, {
        safeFetch: async () => Promise.reject(new Error('unavailable')),
      }),
    ).resolves.toBeNull()
  })
})
