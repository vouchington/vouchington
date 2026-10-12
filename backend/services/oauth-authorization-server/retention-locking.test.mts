import { describe, expect, it, onTestFinished } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import {
  getTestOAuthRetentionFamilyId,
  getTestOAuthRetentionRowCounts,
  lockTestOAuthRetentionRemainingAccessToken,
  lockTestOAuthRetentionPredecessor,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { exchangeOAuthAuthorizationCode, exchangeOAuthRefreshToken } from './index.mts'
import {
  deleteExpiredOAuthRetentionTokens,
  lockExpiredOAuthRetentionFamilies,
} from './retention-tokens.mts'

describe('OAuth retention replacement-chain locking', () => {
  it('locks only the globally selected child when several families have children', async () => {
    const owner = await createTestUserDirect()
    const window = createTestExpiryWindow()
    const familyIds: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const flow = await createTestApprovedOAuthAuthorization(owner)
      await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      await prepareTestOAuthRetentionRows(flow.client.client_id, {
        expiresAt: window.firstEligibleDate,
        childExpiresAt: window.afterUpperBoundDate,
        only: 'family',
      })
      familyIds.push(await getTestOAuthRetentionFamilyId(flow.client.client_id))
    }

    await using deleting = await beginTransaction()
    expect(
      await deleteExpiredOAuthRetentionTokens(
        deleting,
        'oauth_access_tokens',
        window,
        1,
        familyIds,
        false,
      ),
    ).toBe(1)
    await using observer = await beginTransaction()
    expect(await lockTestOAuthRetentionRemainingAccessToken(familyIds, deleting, observer)).toBe(1)
    await observer.rollback()
    await deleting.commit()
  })

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
      await deleteExpiredOAuthRetentionTokens(
        skipped,
        'oauth_refresh_tokens',
        window,
        2,
        await lockExpiredOAuthRetentionFamilies(skipped, window, 2),
      ),
    ).toBe(0)
    await skipped.commit()
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(2)
    await predecessor.rollback()
    released = true
    await using resumed = await beginTransaction()
    expect(
      await deleteExpiredOAuthRetentionTokens(
        resumed,
        'oauth_refresh_tokens',
        window,
        2,
        await lockExpiredOAuthRetentionFamilies(resumed, window, 2),
      ),
    ).toBe(2)
    await resumed.commit()
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(0)
  })
})
