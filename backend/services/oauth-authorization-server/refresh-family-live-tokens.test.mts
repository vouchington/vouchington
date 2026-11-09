import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  expireTestOAuthRefreshToken,
  getTestOAuthTokenRevocationState,
} from '@voucha/test-helpers/entities/oauth-authorization-server'
import { expireTestOAuthAccessToken } from '@voucha/test-helpers/entities/oauth-refresh-family-live-tokens'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { validateOAuthAccessToken } from './access-tokens.mts'
import { exchangeOAuthAuthorizationCode, exchangeOAuthRefreshToken } from './index.mts'
import { getTestOAuthLifecycleEvents } from '@voucha/test-helpers/entities/oauth-authorization-server-events'

describe('OAuth refresh family live-token revocation', () => {
  let owner: Awaited<ReturnType<typeof createTestUserDirect>>

  beforeAll(async () => {
    owner = await createTestUserDirect()
  })

  it('revokes live children after replay while leaving expired children untouched', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const rotated = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: initial.refresh_token,
    })
    await expireTestOAuthAccessToken(initial.access_token)
    await expireTestOAuthRefreshToken(initial.refresh_token)
    await expect(validateOAuthAccessToken(initial.access_token, 'user')).resolves.toBeNull()

    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: initial.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })

    await expect(
      getTestOAuthTokenRevocationState({
        accessToken: initial.access_token,
        refreshToken: initial.refresh_token,
      }),
    ).resolves.toEqual({
      accessTokenRevoked: false,
      refreshTokenRevoked: false,
      refreshFamilyRevoked: true,
    })
    await expect(
      getTestOAuthTokenRevocationState({
        accessToken: rotated.access_token,
        refreshToken: rotated.refresh_token,
      }),
    ).resolves.toEqual({
      accessTokenRevoked: true,
      refreshTokenRevoked: true,
      refreshFamilyRevoked: true,
    })
    await expect(getTestOAuthLifecycleEvents(flow.client.client_id)).resolves.toContain(
      'refresh_reuse_detected',
    )
    await expect(validateOAuthAccessToken(rotated.access_token, 'user')).resolves.toBeNull()
  })
})
