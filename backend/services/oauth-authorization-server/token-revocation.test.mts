import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers/entities/users'
import { getTestOAuthTokenRevocationState } from '@voucha/test-helpers/entities/oauth-authorization-server'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  revokeOAuthToken,
} from './index.mts'
import { validateOAuthAccessToken } from './access-tokens.mts'

describe('OAuth token revocation during suspension', () => {
  it('remains effective after the account is unsuspended', async () => {
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })

    await suspendTestUser(owner.id)
    try {
      await revokeOAuthToken({ clientId: flow.client.client_id, token: tokens.access_token })
      await revokeOAuthToken({ clientId: flow.client.client_id, token: tokens.refresh_token })
      await expect(
        getTestOAuthTokenRevocationState({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        }),
      ).resolves.toMatchObject({
        accessTokenRevoked: true,
        refreshTokenRevoked: true,
        refreshFamilyRevoked: true,
      })
    } finally {
      await unsuspendTestUser(owner.id)
    }

    await expect(validateOAuthAccessToken(tokens.access_token, 'user')).resolves.toBeNull()
    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: tokens.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })
})
