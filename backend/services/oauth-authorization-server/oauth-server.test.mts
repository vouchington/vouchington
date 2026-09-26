import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers/entities/users'
import {
  expireTestOAuthAuthorizationCode,
  getTestOAuthCredentialStorage,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import {
  createTestApprovedOAuthAuthorization,
  randomTestOAuthRedirectUri,
  TEST_OAUTH_SCOPE,
} from './test-support.mts'
import {
  exchangeOAuthAuthorizationCode,
  registerOAuthClient,
  validateOAuthAccessToken,
  validatePkceVerifier,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

describe('OAuth authorization-code exchange', () => {
  let owner: TestUser

  beforeAll(async () => {
    owner = await createTestUserDirect()
  })

  it('issues and exchanges an S256 authorization code exactly once', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const exchanges = await Promise.allSettled([
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
    ])

    const fulfilled = exchanges.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof exchangeOAuthAuthorizationCode>>
      > => result.status === 'fulfilled',
    )
    const rejected = exchanges.filter(result => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({ code: 'invalid_grant' })
    const token = fulfilled[0]!.value
    await expect(validateOAuthAccessToken(token.access_token, 'user')).resolves.toMatchObject({
      client_id: flow.client.client_id,
      user_id: owner.id,
      scopes: ['mcp.user:read', 'mcp.user:write'],
    })
    // The token is bound to the user resource, so the admin resource never accepts it.
    await expect(validateOAuthAccessToken(token.access_token, 'admin')).resolves.toBeNull()
    await expect(
      getTestOAuthCredentialStorage({
        accessToken: token.access_token,
        authorizationCode: flow.code,
        refreshToken: token.refresh_token,
      }),
    ).resolves.toMatchObject({
      accessTokenStored: true,
      authorizationCodeConsumed: true,
      refreshTokenConsumed: false,
    })
  })

  it('rejects a mismatched PKCE verifier without issuing tokens', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: randomBytes(32).toString('base64url'),
        redirectUri: flow.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(
      getTestOAuthCredentialStorage({ authorizationCode: flow.code }),
    ).resolves.toMatchObject({ authorizationCodeConsumed: false, accessTokenStored: false })
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
    ).resolves.toMatchObject({ token_type: 'Bearer' })
  })

  it('binds an authorization code to its client and exact redirect URI', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const otherClient = await registerOAuthClient({
      client_name: `Wrong exchange client ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      scope: TEST_OAUTH_SCOPE,
    })
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: otherClient.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: randomTestOAuthRedirectUri(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(
      getTestOAuthCredentialStorage({ authorizationCode: flow.code }),
    ).resolves.toMatchObject({ authorizationCodeConsumed: false })
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
    ).resolves.toMatchObject({ token_type: 'Bearer' })
  })

  it('rejects an expired authorization code without consuming it', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    await expireTestOAuthAuthorizationCode(flow.code)

    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(
      getTestOAuthCredentialStorage({ authorizationCode: flow.code }),
    ).resolves.toMatchObject({ authorizationCodeConsumed: false })
  })

  it('does not exchange a previously approved code after the grant owner is suspended', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    await suspendTestUser(owner.id)
    try {
      await expect(
        exchangeOAuthAuthorizationCode({
          clientId: flow.client.client_id,
          code: flow.code,
          codeVerifier: flow.verifier,
          redirectUri: flow.redirectUri,
        }),
      ).rejects.toMatchObject({ code: 'invalid_grant' })
    } finally {
      await unsuspendTestUser(owner.id)
    }
  })

  it('accepts the full RFC 7636 verifier length and character set', () => {
    const verifier = `${'.~_-'.repeat(31)}abcd`
    expect(verifier).toHaveLength(128)
    expect(validatePkceVerifier(verifier)).toBe(verifier)
  })
})
