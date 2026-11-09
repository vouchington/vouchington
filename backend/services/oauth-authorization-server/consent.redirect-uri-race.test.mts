import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { replaceTestOAuthRedirectUrisDuringRead } from '@voucha/test-helpers/entities/oauth-client-management'
import {
  createTestApprovedOAuthAuthorization,
  createTestPendingOAuthAuthorization,
  randomTestOAuthRedirectUri,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { decideOAuthAuthorizationRequest, exchangeOAuthAuthorizationCode } from './index.mts'

describe('OAuth redirect metadata snapshots', () => {
  it('allows consent against committed metadata but rejects its code after redirect removal commits', async () => {
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    const decision = await replaceTestOAuthRedirectUrisDuringRead({
      clientId: pending.client.client_id,
      redirectUris: [randomTestOAuthRedirectUri()],
      start: () =>
        decideOAuthAuthorizationRequest(user.id, pending.requestId, 'approve', pending.bindingHash),
    })
    const code = new URL(decision.redirect_uri).searchParams.get('code')!
    expect(code).toBeTruthy()
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: pending.client.client_id,
        code,
        codeVerifier: pending.verifier,
        redirectUri: pending.redirectUri,
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('allows an exchange that read committed redirect metadata before replacement commits', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    const tokens = await replaceTestOAuthRedirectUrisDuringRead({
      clientId: flow.client.client_id,
      redirectUris: [flow.redirectUri, randomTestOAuthRedirectUri()],
      start: () =>
        exchangeOAuthAuthorizationCode({
          clientId: flow.client.client_id,
          code: flow.code,
          codeVerifier: flow.verifier,
          redirectUri: flow.redirectUri,
        }),
    })
    expect(tokens.access_token).toEqual(expect.any(String))
  })
})
