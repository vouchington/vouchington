import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { assignTestOAuthClientOwner } from '@voucha/test-helpers/entities/oauth-client-management'
import { getTestOAuthTokenRevocationState } from '@voucha/test-helpers/entities/oauth-authorization-server'
import { createTestUserDirect, softDeleteUser } from '@voucha/test-helpers/entities/users'
import {
  createTestApprovedOAuthAuthorization,
  createTestPendingOAuthAuthorization,
  issueTestOAuthTokens,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  beginOAuthAuthorizationRequest,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  getOAuthAuthorizationRequestForUser,
  revokeOAuthToken,
  getOAuthResourceUrl,
} from './index.mts'
import { validateOAuthAccessToken } from './access-tokens.mts'

describe('OAuth authority after participant deletion', () => {
  it('rejects a deleted grant subject across bearer, code, refresh, and revocation', async () => {
    const user = await createTestUserDirect()
    const codeFlow = await createTestApprovedOAuthAuthorization(user)
    const tokenFlow = await createTestApprovedOAuthAuthorization(user)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: tokenFlow.client.client_id,
      code: tokenFlow.code,
      codeVerifier: tokenFlow.verifier,
      redirectUri: tokenFlow.redirectUri,
    })
    await softDeleteUser(user.id)

    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: codeFlow.client.client_id,
        code: codeFlow.code,
        codeVerifier: codeFlow.verifier,
        redirectUri: codeFlow.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(
      exchangeOAuthRefreshToken({
        clientId: tokenFlow.client.client_id,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(
      revokeOAuthToken({ clientId: tokenFlow.client.client_id, token: tokens.access_token }),
    ).resolves.toBeUndefined()
    await expect(
      getTestOAuthTokenRevocationState({ accessToken: tokens.access_token }),
    ).resolves.toMatchObject({ accessTokenRevoked: false })
  })

  it('rejects an owned client after its owner is deleted while an unrelated client remains usable', async () => {
    const grantUser = await createTestUserDirect()
    const owner = await createTestUserDirect()
    const owned = await createTestApprovedOAuthAuthorization(grantUser)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: owned.client.client_id,
      code: owned.code,
      codeVerifier: owned.verifier,
      redirectUri: owned.redirectUri,
    })
    await assignTestOAuthClientOwner(owned.client.client_id, owner.id)
    const control = await issueTestOAuthTokens(grantUser)
    await softDeleteUser(owner.id)

    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: owned.client.client_id,
        code: owned.code,
        codeVerifier: owned.verifier,
        redirectUri: owned.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_client' })
    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    await expect(
      exchangeOAuthRefreshToken({
        clientId: owned.client.client_id,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_client' })
    await expect(
      revokeOAuthToken({ clientId: owned.client.client_id, token: tokens.access_token }),
    ).rejects.toMatchObject({ code: 'invalid_client' })
    await expect(validateOAuthAccessToken(control.access_token, 'user')).resolves.not.toBeNull()
  })

  it('returns invalid_client first for both participant UUID orders and every token endpoint', async () => {
    for (const ownerFirst of [false, true]) {
      const first = await createTestUserDirect()
      const second = await createTestUserDirect()
      const owner = ownerFirst ? first : second
      const grantUser = ownerFirst ? second : first
      const flow = await createTestApprovedOAuthAuthorization(grantUser)
      const tokens = await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      const pendingCode = await createTestApprovedOAuthAuthorization(grantUser)
      await assignTestOAuthClientOwner(flow.client.client_id, owner.id)
      await assignTestOAuthClientOwner(pendingCode.client.client_id, owner.id)
      expect(owner.id < grantUser.id).toBe(ownerFirst)
      await softDeleteUser(grantUser.id)
      await softDeleteUser(owner.id)

      await expect(
        exchangeOAuthAuthorizationCode({
          clientId: pendingCode.client.client_id,
          code: pendingCode.code,
          codeVerifier: pendingCode.verifier,
          redirectUri: pendingCode.redirectUri,
        }),
      ).rejects.toMatchObject({ code: 'invalid_client' })
      await expect(
        exchangeOAuthRefreshToken({
          clientId: flow.client.client_id,
          refreshToken: tokens.refresh_token,
        }),
      ).rejects.toMatchObject({ code: 'invalid_client' })
      await expect(
        revokeOAuthToken({ clientId: flow.client.client_id, token: tokens.access_token }),
      ).rejects.toMatchObject({ code: 'invalid_client' })
      await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    }
  })

  it('returns invalid_grant for an unavailable artifact owner after authenticating a different client', async () => {
    const grantUser = await createTestUserDirect()
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(grantUser)
    await assignTestOAuthClientOwner(flow.client.client_id, owner.id)
    const inputClient = await createTestApprovedOAuthAuthorization(await createTestUserDirect())
    await softDeleteUser(owner.id)

    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: inputClient.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('hides a pending consent request when its app owner is deleted', async () => {
    const user = await createTestUserDirect()
    const owner = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    await assignTestOAuthClientOwner(pending.client.client_id, owner.id)
    await softDeleteUser(owner.id)

    await expect(
      getOAuthAuthorizationRequestForUser(user.id, pending.requestId, pending.bindingHash),
    ).resolves.toBeNull()
    await expect(
      decideOAuthAuthorizationRequest(user.id, pending.requestId, 'approve', pending.bindingHash),
    ).rejects.toMatchObject({ code: 'access_denied' })
    await expect(
      beginOAuthAuthorizationRequest({
        clientId: pending.client.client_id,
        codeChallenge: createHash('sha256').update(pending.verifier).digest('base64url'),
        codeChallengeMethod: 'S256',
        deviceId: pending.requestId,
        redirectUri: pending.redirectUri,
        resource: getOAuthResourceUrl('user'),
        responseType: 'code',
        scope: 'mcp.user:read',
        sessionId: pending.requestId,
        state: pending.requestId,
        userId: user.id,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized_client' })
  })

  it('does not create or approve authorization after the consenting user is deleted', async () => {
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    await softDeleteUser(user.id)

    await expect(
      decideOAuthAuthorizationRequest(user.id, pending.requestId, 'approve', pending.bindingHash),
    ).rejects.toMatchObject({ code: 'access_denied' })
    await expect(
      beginOAuthAuthorizationRequest({
        clientId: pending.client.client_id,
        codeChallenge: pending.verifier,
        codeChallengeMethod: 'S256',
        deviceId: pending.requestId,
        redirectUri: pending.redirectUri,
        resource: getOAuthResourceUrl('user'),
        responseType: 'code',
        scope: 'mcp.user:read',
        sessionId: pending.requestId,
        state: pending.requestId,
        userId: user.id,
      }),
    ).rejects.toMatchObject({ code: 'access_denied' })
  })
})
