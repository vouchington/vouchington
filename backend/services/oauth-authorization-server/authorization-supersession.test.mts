import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { insertTestOverlappingOAuthRequest } from '@voucha/test-helpers/oauth-authority-snapshots'
import {
  createTestPendingOAuthAuthorization,
  createTestApprovedOAuthAuthorization,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  decideOAuthAuthorizationRequest,
  getOAuthAuthorizationRequestForUser,
  exchangeOAuthAuthorizationCode,
} from './index.mts'

describe('OAuth overlapping request snapshots', () => {
  it('keeps only the newest request usable and does not revive the older request after denial', async () => {
    const user = await createTestUserDirect()
    const old = await createTestPendingOAuthAuthorization(user)
    const newerId = await insertTestOverlappingOAuthRequest(old.requestId)
    expect(newerId.localeCompare(old.requestId)).toBeGreaterThan(0)
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, old.requestId, old.bindingHash),
    ).resolves.toBeNull()
    await expect(
      decideOAuthAuthorizationRequest(user.id, old.requestId, 'approve', old.bindingHash),
    ).rejects.toMatchObject({ code: 'access_denied' })
    await decideOAuthAuthorizationRequest(user.id, newerId, 'deny', old.bindingHash)
    await expect(
      getOAuthAuthorizationRequestForUser(user.id, old.requestId, old.bindingHash),
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
