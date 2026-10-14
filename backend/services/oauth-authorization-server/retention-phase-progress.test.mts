import { describe, expect, it } from 'vitest'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  getTestOAuthRetentionRowCounts,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  deleteExpiredOAuthAuthorizationServerArtifacts,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
} from './index.mts'

describe('OAuth retention reserved phase progress', () => {
  it('continues a productive refresh chain before redistributing to request backlog', async () => {
    const owner = await createTestUserDirect()
    const family = await createTestApprovedOAuthAuthorization(owner)
    const initial = await exchangeOAuthAuthorizationCode({
      clientId: family.client.client_id,
      code: family.code,
      codeVerifier: family.verifier,
      redirectUri: family.redirectUri,
    })
    const first = await exchangeOAuthRefreshToken({
      clientId: family.client.client_id,
      refreshToken: initial.refresh_token,
    })
    await exchangeOAuthRefreshToken({
      clientId: family.client.client_id,
      refreshToken: first.refresh_token,
    })
    const requests = await createTestApprovedOAuthAuthorization(owner)
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(family.client.client_id, {
      expiresAt: window.firstEligibleDate,
      childExpiresAt: window.afterUpperBoundDate,
      only: 'family',
    })
    await prepareTestOAuthRetentionRows(requests.client.client_id, {
      expiresAt: window.firstEligibleDate,
      extraRequests: 15,
      only: 'requests',
    })
    await expect(getTestOAuthRetentionRowCounts(family.client.client_id)).resolves.toMatchObject({
      access: 3,
      refresh: 3,
    })
    const beforeRequests = await getTestOAuthRetentionRowCounts(requests.client.client_id)
    expect(beforeRequests.requests).toBeGreaterThanOrEqual(16)

    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(20, {
      ...window,
      maxBatches: 1,
    })

    const afterFamily = await getTestOAuthRetentionRowCounts(family.client.client_id)
    const remaining = await getTestOAuthRetentionRowCounts(requests.client.client_id)
    expect(result.deleted).toBe(20)
    expect(afterFamily).toMatchObject({ access: 0, refresh: 0, families: 0 })
    expect(remaining.requests).toBeGreaterThan(0)
  })
})
