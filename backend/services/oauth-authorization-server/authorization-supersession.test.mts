import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestOverlappingOAuthRequest } from '@voucha/test-helpers/oauth-authority-snapshots'
import {
  createTestPendingOAuthAuthorization,
  createTestApprovedOAuthAuthorization,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  getOAuthAuthorizationRequestForUser,
  beginValidatedOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
} from './index.mts'

describe('OAuth overlapping request snapshots', () => {
  it('rejects a second pending request for the same browser and client', async () => {
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    await expect(insertTestOverlappingOAuthRequest(pending.requestId)).rejects.toMatchObject({
      code: '23505',
      constraint: 'idx_oauth_authorization_requests__pending_browser_client',
    })
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, pending.requestId, pending.bindingHash),
    ).resolves.toMatchObject({ id: pending.requestId })
  })

  it('returns structured conflicts for raced begins and leaves the surviving request readable', async () => {
    const user = await createTestUserDirect()
    const pending = await createTestPendingOAuthAuthorization(user)
    const outcomes = await Promise.allSettled(
      [0, 1].map(() =>
        beginValidatedOAuthAuthorizationRequest(pending.parameters, pending.validated),
      ),
    )
    const admitted = outcomes.filter(outcome => outcome.status === 'fulfilled')
    expect(admitted.length).toBeGreaterThan(0)
    for (const outcome of outcomes.filter(result => result.status === 'rejected')) {
      expect(outcome.reason).toMatchObject({ code: 'invalid_request', status: 409 })
    }
    const views = await Promise.all(
      admitted.map(outcome =>
        getOAuthAuthorizationRequestForUser(user.id, outcome.value.request_id, pending.bindingHash),
      ),
    )
    expect(views.filter(view => view !== null)).toHaveLength(1)
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, pending.requestId, pending.bindingHash),
    ).resolves.toBeNull()
  })

  it('preserves an already-issued code when a newer request is admitted', async () => {
    const user = await createTestUserDirect()
    const old = await createTestApprovedOAuthAuthorization(user)
    await insertTestOverlappingOAuthRequest(old.requestId)
    await expect(
      exchangeOAuthAuthorizationCode({
        clientId: old.client.client_id,
        code: old.code,
        codeVerifier: old.verifier,
        redirectUri: old.redirectUri,
      }),
    ).resolves.toMatchObject({ token_type: 'Bearer' })
  })
})
