import { beforeAll, describe, expect, it } from 'vitest'
import { hashToken } from '@modules/token-secrets'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { rotateTestOAuthClientSecretWhileWaiting } from '@voucha/test-helpers/entities/oauth-client-management'
import { generateOAuthClientSecret } from './clients.mts'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { createTestApprovedOAuthAuthorization } from './test-support.mts'
import {
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  revokeOAuthToken,
} from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

describe('OAuth client secret rotation racing token-endpoint authentication', () => {
  let owner: TestUser

  beforeAll(async () => {
    owner = await createTestUserDirect()
  })

  function approveConfidentialClient() {
    return createTestApprovedOAuthAuthorization(owner, {
      tokenEndpointAuthMethod: 'client_secret_basic',
    })
  }

  function exchangeCode(flow: Awaited<ReturnType<typeof approveConfidentialClient>>) {
    return exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      clientSecret: flow.client.client_secret,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
  }

  function rotateSecretWhileWaiting<T>(clientId: string, start: () => Promise<T>): Promise<T> {
    return rotateTestOAuthClientSecretWhileWaiting({
      clientId,
      clientSecretHash: hashToken(OAUTH_SECRET_PURPOSES.clientSecret, generateOAuthClientSecret()),
      waiterQueryMarker: '/* authenticateLockedOAuthClient */',
      start,
    })
  }

  it('refuses a code exchange that waited on a rotation of its secret', async () => {
    const flow = await approveConfidentialClient()

    await expect(
      rotateSecretWhileWaiting(flow.client.client_id, () => exchangeCode(flow)),
    ).rejects.toMatchObject({ code: 'invalid_client' })
  })

  it('refuses a refresh that waited on a rotation of its secret', async () => {
    const flow = await approveConfidentialClient()
    const tokens = await exchangeCode(flow)

    await expect(
      rotateSecretWhileWaiting(flow.client.client_id, () =>
        exchangeOAuthRefreshToken({
          clientId: flow.client.client_id,
          clientSecret: flow.client.client_secret,
          refreshToken: tokens.refresh_token,
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_client' })
  })

  it('refuses a revocation that waited on a rotation of its secret', async () => {
    const flow = await approveConfidentialClient()
    const tokens = await exchangeCode(flow)

    await expect(
      rotateSecretWhileWaiting(flow.client.client_id, () =>
        revokeOAuthToken({
          clientId: flow.client.client_id,
          clientSecret: flow.client.client_secret,
          token: tokens.refresh_token,
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_client' })
  })
})
