import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  getTestOAuthClientStorage,
  getTestOAuthCredentialStorage,
  getTestOAuthTokenRevocationState,
  revokeTestOAuthGrant,
  setTestOAuthArtifactExpiry,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import { getTestOAuthLifecycleEvents } from '@voucha/test-helpers/entities/oauth-authorization-server-events'
import {
  createTestApprovedOAuthAuthorization,
  randomTestOAuthRedirectUri,
  TEST_OAUTH_SCOPE,
} from './test-support.mts'
import {
  deleteExpiredOAuthAuthorizationServerArtifactsBatch,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  registerOAuthClient,
  revokeOAuthToken,
  validateOAuthAccessToken,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

describe('OAuth token revocation and retention', () => {
  let owner: TestUser

  beforeAll(async () => {
    owner = await createTestUserDirect()
  })

  it('revokes access tokens without affecting another client', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const other = await registerOAuthClient({
      client_name: `Other revoker ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      scope: TEST_OAUTH_SCOPE,
    })

    await revokeOAuthToken({ clientId: other.client_id, token: tokens.access_token })
    await expect(validateOAuthAccessToken(tokens.access_token)).resolves.not.toBeNull()
    await revokeOAuthToken({ clientId: flow.client.client_id, token: tokens.access_token })
    await expect(validateOAuthAccessToken(tokens.access_token)).resolves.toBeNull()
    await expect(
      getTestOAuthTokenRevocationState({ accessToken: tokens.access_token }),
    ).resolves.toMatchObject({ accessTokenRevoked: true })
    await expect(getTestOAuthLifecycleEvents(flow.client.client_id)).resolves.toContain(
      'access_token_revoked',
    )
  })

  it('revokes a refresh family and every access token derived from it', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })

    await revokeOAuthToken({ clientId: flow.client.client_id, token: tokens.refresh_token })

    await expect(validateOAuthAccessToken(tokens.access_token)).resolves.toBeNull()
    await expect(
      getTestOAuthTokenRevocationState({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      }),
    ).resolves.toEqual({
      accessTokenRevoked: true,
      refreshTokenRevoked: true,
      refreshFamilyRevoked: true,
    })
    await expect(getTestOAuthLifecycleEvents(flow.client.client_id)).resolves.toContain(
      'refresh_family_revoked',
    )
  })

  it('requires a confidential client secret for revocation', async () => {
    const client = await registerOAuthClient({
      client_name: `Confidential revoker ${randomBytes(6).toString('hex')}`,
      redirect_uris: [randomTestOAuthRedirectUri()],
      scope: TEST_OAUTH_SCOPE,
      token_endpoint_auth_method: 'client_secret_basic',
    })

    await expect(
      revokeOAuthToken({ clientId: client.client_id, token: 'unknown' }),
    ).rejects.toMatchObject({ code: 'invalid_client' })
    await expect(
      revokeOAuthToken({
        clientId: client.client_id,
        clientSecret: client.client_secret,
        token: 'unknown',
      }),
    ).resolves.toBeUndefined()
  })

  it('deletes expired protocol artifacts while retaining durable evidence', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const lowerBoundDate = new Date(Date.now() + 10_000)
    const expiresAt = new Date(lowerBoundDate.getTime() + 10_000)
    await setTestOAuthArtifactExpiry(flow.client.client_id, expiresAt)

    const retention = await deleteExpiredOAuthAuthorizationServerArtifactsBatch(100, {
      lowerBoundDate,
      now: new Date(expiresAt.getTime() + 10_000),
    })
    expect(retention.deleted).toBeGreaterThanOrEqual(4)
    expect(retention.hasMore).toBe(false)
    await expect(getTestOAuthClientStorage(flow.client.client_id)).resolves.not.toBeNull()
    await expect(getTestOAuthLifecycleEvents(flow.client.client_id)).resolves.toContain(
      'consent_approved',
    )
    await expect(
      getTestOAuthCredentialStorage({
        accessToken: tokens.access_token,
        authorizationCode: flow.code,
        refreshToken: tokens.refresh_token,
      }),
    ).resolves.toEqual({
      accessTokenStored: false,
      authorizationCodeConsumed: null,
      refreshTokenConsumed: null,
      refreshFamilyRevoked: null,
      refreshReuseDetected: null,
    })
  })

  it('rejects tokens after their grant is revoked', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    await revokeTestOAuthGrant(flow.client.client_id)

    await expect(validateOAuthAccessToken(tokens.access_token)).resolves.toBeNull()
    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })
})
