import { describe, expect, it, onTestFinished } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import {
  getTestOAuthRetentionRowCounts,
  lockTestOAuthRetentionPredecessor,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { exchangeOAuthAuthorizationCode, exchangeOAuthRefreshToken } from './index.mts'
import { deleteExpiredOAuthRetentionTokens } from './retention-tokens.mts'

describe('OAuth retention replacement-chain locking', () => {
  it('retains a replacement while its predecessor is locked, then drains the chain after release', async () => {
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: tokens.refresh_token,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      childExpiresAt: window.firstEligibleDate,
      only: 'family',
    })
    await using predecessor = await beginTransaction()
    let released = false
    onTestFinished(async () => {
      if (!released) await predecessor.rollback()
    })
    // Completion of this lock acquisition is the concurrency boundary; no timing assumption.
    await lockTestOAuthRetentionPredecessor(flow.client.client_id, predecessor)
    await using skipped = await beginTransaction()
    expect(
      await deleteExpiredOAuthRetentionTokens(skipped, 'oauth_refresh_tokens', window, 2),
    ).toBe(0)
    await skipped.commit()
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(2)
    await predecessor.rollback()
    released = true
    await using resumed = await beginTransaction()
    expect(
      await deleteExpiredOAuthRetentionTokens(resumed, 'oauth_refresh_tokens', window, 2),
    ).toBe(2)
    await resumed.commit()
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(0)
  })
})
