import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  clientSecretMatchesStoredHash,
  getTestOAuthClientStorage,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import {
  randomTestOAuthRedirectUri,
  TEST_OAUTH_RESOURCE,
  TEST_OAUTH_SCOPE,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  assertScopeSubset,
  beginValidatedOAuthAuthorizationRequest,
  createOwnedOAuthApp,
  parseOAuthScopes,
  getOAuthResourceUrl,
  registerOAuthClient,
  updateOwnedOAuthApp,
  validateOAuthAuthorizationRequest,
} from './index.mts'

describe('OAuth client and authorization validation', () => {
  it('registers a confidential client without persisting plaintext credentials', async () => {
    const registered = await registerOAuthClient({
      client_name: `Test confidential ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: TEST_OAUTH_SCOPE,
    })

    expect(registered.client_secret).toMatch(/^voucha_secret_/)
    expect(registered).not.toHaveProperty('registration_access_token')
    const stored = await getTestOAuthClientStorage(registered.client_id)
    expect(stored?.client_secret_hash).not.toBe(registered.client_secret)
    await expect(
      clientSecretMatchesStoredHash(registered.client_id, registered.client_secret!),
    ).resolves.toBe(true)
  })

  it('enforces product scope validation boundaries', () => {
    expect(() => parseOAuthScopes(undefined)).toThrowError(
      expect.objectContaining({ code: 'invalid_scope' }),
    )
    expect(() => assertScopeSubset(['mcp.user:write'], ['mcp.user:read'])).toThrowError(
      expect.objectContaining({ code: 'invalid_scope' }),
    )
  })

  it.each([
    ['an unsupported authentication method', { token_endpoint_auth_method: 'client_secret_post' }],
    ['invalid grant types', { grant_types: [] }],
    ['an unsupported response type', { response_types: ['token'] }],
  ])('rejects registration metadata with %s', async (_name, override) => {
    await expect(
      registerOAuthClient({
        client_name: `Unsupported registration ${randomBytes(6).toString('hex')}`,
        redirect_uris: [randomTestOAuthRedirectUri()],
        scope: TEST_OAUTH_SCOPE,
        ...override,
      }),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
  })

  it.each([
    'Voucha',
    ' VOUCHA ',
    'Ｖｏｕｃｈａ',
    'Voucha for iOS',
    'voucha  for macOS',
    'Voucha for Windows',
  ])('reserves the first-party client name %s', async clientName => {
    await expect(
      registerOAuthClient({
        client_name: clientName,
        redirect_uris: [randomTestOAuthRedirectUri()],
        scope: TEST_OAUTH_SCOPE,
      }),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
  })

  it('applies reserved names to owned app renames', async () => {
    const owner = await createTestUserDirect()
    const issued = await createOwnedOAuthApp(owner.id, {
      client_name: 'Independent app',
      redirect_uris: [randomTestOAuthRedirectUri()],
      scopes: ['mcp.user:read'],
    })
    await expect(
      updateOwnedOAuthApp(owner.id, issued.oauth_app.id, {
        client_name: 'Voucha for iOS',
      }),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
  })

  it('rewrites scope validation failures as invalid client metadata', async () => {
    await expect(
      registerOAuthClient({
        client_name: `Invalid scope registration ${randomBytes(6).toString('hex')}`,
        redirect_uris: [randomTestOAuthRedirectUri()],
        scope: 'mcp.user:read invalid:scope',
      }),
    ).rejects.toMatchObject({ code: 'invalid_client_metadata' })
  })

  it.each([
    ['missing state', { state: undefined }, 'invalid_request'],
    ['plain PKCE', { codeChallengeMethod: 'plain' }, 'invalid_request'],
    ['an unknown scope', { scope: 'mcp.user:read unknown:scope' }, 'invalid_scope'],
  ])('rejects authorization with %s', async (_name, override, errorCode) => {
    const redirectUri = randomTestOAuthRedirectUri()
    const client = await registerOAuthClient({
      client_name: `Authorization rejection ${randomBytes(6).toString('hex')}`,
      redirect_uris: [redirectUri],
      scope: TEST_OAUTH_SCOPE,
    })
    const verifier = randomBytes(32).toString('base64url')

    await expect(
      validateOAuthAuthorizationRequest({
        clientId: client.client_id,
        codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
        codeChallengeMethod: 'S256',
        redirectUri,
        resource: TEST_OAUTH_RESOURCE,
        responseType: 'code',
        scope: TEST_OAUTH_SCOPE,
        state: randomBytes(16).toString('base64url'),
        ...override,
      }),
    ).rejects.toMatchObject({ code: errorCode })
  })

  it('rejects an authorization redirect URI that is not registered to the client', async () => {
    const client = await registerOAuthClient({
      client_name: `Redirect registration ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      scope: TEST_OAUTH_SCOPE,
    })
    const verifier = randomBytes(32).toString('base64url')

    await expect(
      validateOAuthAuthorizationRequest({
        clientId: client.client_id,
        codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
        codeChallengeMethod: 'S256',
        redirectUri: randomTestOAuthRedirectUri(),
        resource: TEST_OAUTH_RESOURCE,
        responseType: 'code',
        scope: TEST_OAUTH_SCOPE,
        state: randomBytes(16).toString('base64url'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it.each([
    ['admin', 'mcp.admin:read'],
    ['legal', 'copyright-notices:read'],
  ] as const)(
    'rechecks the registered client boundary for the %s resource before persistence',
    async (audience, scope) => {
      const owner = await createTestUserDirect({ administrator: true })
      const redirectUri = randomTestOAuthRedirectUri()
      const client = await registerOAuthClient({
        client_name: 'Resource boundary app',
        redirect_uris: [redirectUri],
        scope: `mcp.user:read ${scope}`,
      })
      const validated = await validateOAuthAuthorizationRequest({
        clientId: client.client_id,
        codeChallenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
        codeChallengeMethod: 'S256',
        redirectUri,
        resource: TEST_OAUTH_RESOURCE,
        responseType: 'code',
        scope: 'mcp.user:read',
        state: 'opaque-state',
      })
      validated.resource = getOAuthResourceUrl(audience)
      validated.scopes = [scope]
      await expect(
        beginValidatedOAuthAuthorizationRequest(
          {
            userId: owner.id,
            deviceId: crypto.randomUUID(),
            sessionId: crypto.randomUUID(),
          },
          validated,
        ),
      ).rejects.toMatchObject({ code: 'unauthorized_client' })
    },
  )

  it('rechecks a validated redirect URI after its owner removes it', async () => {
    const owner = await createTestUserDirect()
    const redirectUri = randomTestOAuthRedirectUri()
    const issued = await createOwnedOAuthApp(owner.id, {
      client_name: 'Redirect replacement client',
      redirect_uris: [redirectUri],
      scopes: ['mcp.user:read'],
    })
    const verifier = randomBytes(32).toString('base64url')
    const validated = await validateOAuthAuthorizationRequest({
      clientId: issued.oauth_app.client_id,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
      redirectUri,
      resource: TEST_OAUTH_RESOURCE,
      responseType: 'code',
      scope: 'mcp.user:read',
      state: randomBytes(16).toString('base64url'),
    })
    await updateOwnedOAuthApp(owner.id, issued.oauth_app.id, {
      redirect_uris: [randomTestOAuthRedirectUri()],
    })

    await expect(
      beginValidatedOAuthAuthorizationRequest(
        { userId: owner.id, deviceId: crypto.randomUUID(), sessionId: crypto.randomUUID() },
        validated,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  // Registers a client for `registeredScope`, then validates an authorization for `requestedScope`.
  async function authorizeRegisteredScope(registeredScope: string, requestedScope: string) {
    const redirectUri = randomTestOAuthRedirectUri()
    const client = await registerOAuthClient({
      client_name: `Scope coverage ${randomBytes(6).toString('hex')}`,
      redirect_uris: [redirectUri],
      scope: registeredScope,
    })
    const verifier = randomBytes(32).toString('base64url')
    return validateOAuthAuthorizationRequest({
      clientId: client.client_id,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
      redirectUri,
      resource: TEST_OAUTH_RESOURCE,
      responseType: 'code',
      scope: requestedScope,
      state: randomBytes(16).toString('base64url'),
    })
  }

  it('rejects a requested scope that the registered scopes do not cover', async () => {
    await expect(authorizeRegisteredScope('mcp.user:read', TEST_OAUTH_SCOPE)).rejects.toMatchObject(
      { code: 'invalid_scope' },
    )
  })

  it.each([
    'financial-profile:read',
    'financial-profile:write',
    'spending:read',
    'spending:write',
    'households:read',
    'households:write',
  ])('rejects umbrella-only registration requesting %s', async scope => {
    const read = scope.replace(':write', ':read')
    await expect(
      authorizeRegisteredScope(TEST_OAUTH_SCOPE, scope === read ? scope : `${read} ${scope}`),
    ).rejects.toMatchObject({ code: 'invalid_scope' })
  })

  it('accepts resource scopes covered by the registered MCP audience scopes', async () => {
    await expect(
      authorizeRegisteredScope(TEST_OAUTH_SCOPE, 'cards:read cards:write'),
    ).resolves.toMatchObject({ scopes: ['cards:read', 'cards:write'] })
  })
})
