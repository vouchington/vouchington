import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import {
  getTestOAuthClientStorage,
  getTestOAuthCredentialStorage,
  getTestOAuthTokenRevocationState,
  revokeTestOAuthGrant,
  setTestOAuthArtifactExpiry,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import {
  getTestOAuthRetentionRowCounts,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import { getTestOAuthLifecycleEvents } from '@voucha/test-helpers/entities/oauth-authorization-server-events'
import {
  createTestApprovedOAuthAuthorization,
  randomTestOAuthRedirectUri,
  TEST_OAUTH_SCOPE,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  deleteExpiredOAuthAuthorizationServerArtifacts,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  registerOAuthClient,
  revokeOAuthToken,
} from './index.mts'
import { validateOAuthAccessToken } from './access-tokens.mts'

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
    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.not.toBeNull()
    await revokeOAuthToken({ clientId: flow.client.client_id, token: tokens.access_token })
    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
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

    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
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
    const window = createTestExpiryWindow()
    await setTestOAuthArtifactExpiry(flow.client.client_id, window.firstEligibleDate)

    const retention = await deleteExpiredOAuthAuthorizationServerArtifacts(100, {
      lowerBoundDate: window.lowerBoundDate,
      now: window.now,
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

  it('gives every artifact phase a share despite a request backlog in the same run', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      extraRequests: 8,
    })
    const before = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(2, {
      ...window,
      maxBatches: 4,
    })
    const after = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    expect(result).toEqual({ deleted: 8, hasMore: true })
    expect(before.total - after.total).toBe(result.deleted)
    expect(after.requests).toBeGreaterThan(0)
    expect(after).toMatchObject({ codes: 0, access: 0, refresh: 0, families: 0 })
  })

  it('redistributes unused phase shares without exceeding the physical row allowance', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      extraRequests: 2,
      only: 'requests',
    })
    const before = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
      ...window,
      maxBatches: 4,
    })
    const after = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    expect(result).toEqual({ deleted: 3, hasMore: false })
    expect(before.total - after.total).toBe(result.deleted)
    expect(after).toMatchObject({ requests: 0, codes: before.codes })
  })

  it('drains a large expired family over bounded runs before deleting it without a cascade', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      only: 'family',
      extraRefreshTokens: 2,
      childExpiresAt: window.afterUpperBoundDate,
    })
    let before = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    expect(before).toMatchObject({ access: 1, refresh: 3, families: 1 })
    for (const expected of [2, 2, 1]) {
      const result = await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
        ...window,
        maxBatches: 2,
      })
      const after = await getTestOAuthRetentionRowCounts(flow.client.client_id)
      expect(result.deleted).toBe(expected)
      expect(before.total - after.total).toBe(expected)
      expect(result.hasMore).toBe(expected === 2)
      expect(after.families).toBe(expected === 2 ? 1 : 0)
      before = after
    }
    expect(before).toMatchObject({ access: 0, refresh: 0, families: 0, requests: 1, codes: 1 })
  })

  it('drains eligible-family children ahead of unrelated expired access tokens', async () => {
    const window = createTestExpiryWindow()
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const other = await createTestApprovedOAuthAuthorization(owner)
    for (const authorization of [flow, other]) {
      await exchangeOAuthAuthorizationCode({
        clientId: authorization.client.client_id,
        code: authorization.code,
        codeVerifier: authorization.verifier,
        redirectUri: authorization.redirectUri,
      })
    }
    await prepareTestOAuthRetentionRows(other.client.client_id, {
      expiresAt: window.firstEligibleDate,
      only: 'access',
      extraAccessTokens: 2,
    })
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.secondEligibleDate,
      only: 'family',
      childExpiresAt: window.afterUpperBoundDate,
    })
    const before = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    const otherBefore = await getTestOAuthRetentionRowCounts(other.client.client_id)
    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
      ...window,
      maxBatches: 4,
    })
    const after = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    const otherAfter = await getTestOAuthRetentionRowCounts(other.client.client_id)
    expect(after).toMatchObject({ access: 0, refresh: 0 })
    expect(otherAfter.access).toBeGreaterThan(0)
    expect(before.total + otherBefore.total - after.total - otherAfter.total).toBe(result.deleted)
    expect(result.deleted).toBeLessThanOrEqual(4)
  })

  it('rejects a fractional run count even when its row-budget product is an integer', async () => {
    await expect(
      deleteExpiredOAuthAuthorizationServerArtifacts(2, { maxBatches: 1.5 }),
    ).rejects.toThrow('maxBatches must be a positive safe integer')
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

    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })
})
