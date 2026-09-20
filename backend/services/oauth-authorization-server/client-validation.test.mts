import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  clientSecretMatchesStoredHash,
  getTestOAuthClientStorage,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import {
  randomTestOAuthRedirectUri,
  TEST_OAUTH_RESOURCE,
  TEST_OAUTH_SCOPE,
} from './test-support.mts'
import {
  registerOAuthClient,
  validateOAuthAuthorizationRequest,
  validateRedirectUris,
  validateResource,
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

  it('rejects wildcard redirects and resources outside the configured site origin', () => {
    expect(() => validateRedirectUris(['https://*.example.com/callback'])).toThrowError(
      expect.objectContaining({ code: 'invalid_redirect_uri' }),
    )
    expect(() => validateResource('https://attacker.example/api/v1/mcp')).toThrowError(
      expect.objectContaining({ code: 'invalid_request' }),
    )
    expect(() => validateResource('http://127.0.0.1:9999/api/v1/mcp')).toThrowError(
      expect.objectContaining({ code: 'invalid_request' }),
    )
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
})
