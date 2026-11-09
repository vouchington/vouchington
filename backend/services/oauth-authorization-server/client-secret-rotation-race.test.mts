import { describe, expect, it } from 'vitest'
import { hashToken } from '@modules/token-secrets'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { rotateTestOAuthClientSecretDuringRead } from '@voucha/test-helpers/entities/oauth-client-management'
import { generateOpaqueToken } from '@vouchington/oauth-server'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  revokeOAuthToken,
} from './index.mts'

function duringSecretRotation<T>(clientId: string, start: () => Promise<T>): Promise<T> {
  return rotateTestOAuthClientSecretDuringRead({
    clientId,
    clientSecretHash: hashToken(
      OAUTH_SECRET_PURPOSES.clientSecret,
      generateOpaqueToken('voucha_secret_'),
    ),
    start,
  })
}

async function confidentialFlow() {
  const user = await createTestUserDirect()
  return createTestApprovedOAuthAuthorization(user, {
    tokenEndpointAuthMethod: 'client_secret_basic',
  })
}

function exchangeCode(flow: Awaited<ReturnType<typeof confidentialFlow>>) {
  return exchangeOAuthAuthorizationCode({
    clientId: flow.client.client_id,
    clientSecret: flow.client.client_secret,
    code: flow.code,
    codeVerifier: flow.verifier,
    redirectUri: flow.redirectUri,
  })
}

describe('OAuth client secret rotation snapshots', () => {
  it('checks the committed secret for code exchange and rejects the old secret after rotation commits', async () => {
    const flow = await confidentialFlow()
    const tokens = await duringSecretRotation(flow.client.client_id, () => exchangeCode(flow))
    expect(tokens.access_token).toEqual(expect.any(String))
    await expect(exchangeCode(flow)).rejects.toMatchObject({ code: 'invalid_client' })
  })

  it('checks the committed secret for refresh and rejects the old secret on the next request', async () => {
    const flow = await confidentialFlow()
    const tokens = await exchangeCode(flow)
    const refreshed = await duringSecretRotation(flow.client.client_id, () =>
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        clientSecret: flow.client.client_secret,
        refreshToken: tokens.refresh_token,
      }),
    )
    expect(refreshed.access_token).toEqual(expect.any(String))
    await expect(
      exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        clientSecret: flow.client.client_secret,
        refreshToken: refreshed.refresh_token,
      }),
    ).rejects.toMatchObject({ code: 'invalid_client' })
  })

  it('checks the committed secret for revocation and rejects the old secret after commit', async () => {
    const flow = await confidentialFlow()
    const tokens = await exchangeCode(flow)
    const revoke = () =>
      revokeOAuthToken({
        clientId: flow.client.client_id,
        clientSecret: flow.client.client_secret,
        token: tokens.refresh_token,
      })
    await expect(duringSecretRotation(flow.client.client_id, revoke)).resolves.toBeUndefined()
    await expect(revoke()).rejects.toMatchObject({ code: 'invalid_client' })
  })
})
