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
import { getTestAuthorizationAccountId } from '@voucha/test-helpers/entities/oauth-authorization-account-id'

describe('X orphan account cleanup', () => {
  it('preserves an old orphaned account during its active broker completion', async () => {
    const window = createTestRetentionWindow()
    const activeProviderId = `retained-x-${createRandomString(12)}`
    const unrelatedProviderId = `unrelated-x-${createRandomString(12)}`
    await insertTestOAuthAccount('x', activeProviderId)
    await insertTestOAuthAccount('x', unrelatedProviderId)
    await setOAuthAccountCreatedAt('x', activeProviderId, window.firstEligibleDate)
    await setOAuthAccountCreatedAt('x', unrelatedProviderId, window.secondEligibleDate)
    const activeAccountId = await getTestAuthorizationAccountId('x', activeProviderId)
    const authorizationId = v7()
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        xUserIds: [activeProviderId, unrelatedProviderId],
      })
    })
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: authorizationId,
      provider: 'x',
      status: 'completion_ready',
      providerUserId: activeProviderId,
      callbackReceivedAt: now,
      completionReadyAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })

    await expect(
      deleteOrphanedOAuthAccountBatch(
        'x_accounts',
        'x_user_id',
        window.upperBoundDate,
        2,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(1)
    await expect(oauthAccountExistsByProviderUserId('x', activeProviderId)).resolves.toBe(true)
    await expect(oauthAccountExistsByProviderUserId('x', unrelatedProviderId)).resolves.toBe(false)
    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toMatchObject({
      x_account_id: activeAccountId,
    })
  }, 30_000)
})
