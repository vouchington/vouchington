import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import {
  createRandomString,
  createTestRetentionWindow,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  setOAuthAccountCreatedAt,
} from '@voucha/test-helpers'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'

describe('GitHub orphan account cleanup', () => {
  it('preserves an old orphaned account during its active broker completion', async () => {
    const window = createTestRetentionWindow()
    const activeProviderId = `retained-github-${createRandomString(12)}`
    const unrelatedProviderId = `unrelated-github-${createRandomString(12)}`
    const activeAccount = await insertTestOAuthAccount('github', activeProviderId)
    await insertTestOAuthAccount('github', unrelatedProviderId)
    await setOAuthAccountCreatedAt('github', activeProviderId, window.firstEligibleDate)
    await setOAuthAccountCreatedAt('github', unrelatedProviderId, window.secondEligibleDate)
    const authorizationId = v7()
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        githubUserIds: [activeProviderId, unrelatedProviderId],
      })
    })
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: authorizationId,
      provider: 'github',
      status: 'completion_ready',
      providerUserId: activeProviderId,
      callbackReceivedAt: now,
      completionReadyAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })

    await expect(
      deleteOrphanedOAuthAccountBatch(
        'github_accounts',
        'github_user_id',
        window.upperBoundDate,
        2,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(1)
    await expect(oauthAccountExistsByProviderUserId('github', activeProviderId)).resolves.toBe(true)
    await expect(oauthAccountExistsByProviderUserId('github', unrelatedProviderId)).resolves.toBe(
      false,
    )
    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toMatchObject({
      github_account_id: activeAccount.account_id,
    })
  }, 30_000)
})
