import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { replaceTestOAuthRedirectUrisWhileWaiting } from '@voucha/test-helpers/entities/oauth-client-management'
import {
  createTestApprovedOAuthAuthorization,
  createTestPendingOAuthAuthorization,
  randomTestOAuthRedirectUri,
} from './test-support.mts'
import { decideOAuthAuthorizationRequest, exchangeOAuthAuthorizationCode } from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

describe('OAuth redirect URI replacement racing consent and code exchange', () => {
  let owner: TestUser

  beforeAll(async () => {
    owner = await createTestUserDirect()
  })

  it('refuses a consent decision that waited on a removal of its redirect URI', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)

    await expect(
      replaceTestOAuthRedirectUrisWhileWaiting({
        clientId: pending.client.client_id,
        redirectUris: [randomTestOAuthRedirectUri()],
        waiterQueryMarker: '/* lockAuthorizationRequest */',
        start: () =>
          decideOAuthAuthorizationRequest(
            owner.id,
            pending.requestId,
            'approve',
            pending.bindingHash,
          ),
      }),
    ).rejects.toMatchObject({ code: 'access_denied' })
  })

  it('returns a consent decision that waited on a retained redirect URI', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)

    const decision = await replaceTestOAuthRedirectUrisWhileWaiting({
      clientId: pending.client.client_id,
      redirectUris: [pending.redirectUri, randomTestOAuthRedirectUri()],
      waiterQueryMarker: '/* lockAuthorizationRequest */',
      start: () =>
        decideOAuthAuthorizationRequest(
          owner.id,
          pending.requestId,
          'approve',
          pending.bindingHash,
        ),
    })

    expect(new URL(decision.redirect_uri).searchParams.get('code')).toBeTruthy()
  })

  it('refuses a code exchange that waited on a removal of its redirect URI', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)

    await expect(
      replaceTestOAuthRedirectUrisWhileWaiting({
        clientId: flow.client.client_id,
        redirectUris: [randomTestOAuthRedirectUri()],
        waiterQueryMarker: '/* authenticateLockedOAuthClient */',
        start: () =>
          exchangeOAuthAuthorizationCode({
            clientId: flow.client.client_id,
            code: flow.code,
            codeVerifier: flow.verifier,
            redirectUri: flow.redirectUri,
          }),
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('handles an operation rejected before it can wait on the client lock', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)
    const operationFailure = new Error('operation failed before client lock')

    await expect(
      replaceTestOAuthRedirectUrisWhileWaiting({
        clientId: pending.client.client_id,
        redirectUris: [randomTestOAuthRedirectUri()],
        waiterQueryMarker: '/* lockAuthorizationRequest */',
        start: () => Promise.reject(operationFailure),
      }),
    ).rejects.toThrow('Operation did not wait for the test lock')
  })
})
