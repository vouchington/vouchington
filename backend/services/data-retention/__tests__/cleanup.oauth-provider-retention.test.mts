import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { insertTestLinkedInOAuthAccount } from '@voucha/test-helpers/entities/linkedin-oauth-accounts'
import {
  backdateOAuthAccountUnlinkedAt,
  createRandomString,
  createTestRetentionWindow,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  setOAuthAccountRetentionTime,
} from '@voucha/test-helpers'
import { providerTableConfigs } from '@services/oauth/providers'
import { insertTestMicrosoftOAuthAccount } from '@voucha/test-helpers/entities/microsoft-oauth-accounts'
import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'

describe('orphaned OAuth account cleanup', () => {
  // no-mistakes-timeout-reason: shared-database setup and multi-row writes exceed the 5s default in CI
  it('preserves an old orphaned LinkedIn account during its active broker completion', async () => {
    const window = createTestRetentionWindow()
    const activeAccountId = `retained-linkedin-${createRandomString(12)}`
    const unrelatedAccountId = `unrelated-linkedin-${createRandomString(12)}`
    const authorizationId = v7()
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        linkedinUserIds: [activeAccountId, unrelatedAccountId],
      })
    })

    const activeAccount = await insertTestLinkedInOAuthAccount(
      activeAccountId,
      v7({ msecs: window.firstEligibleDate.getTime() }),
    )
    await insertTestLinkedInOAuthAccount(
      unrelatedAccountId,
      v7({ msecs: window.secondEligibleDate.getTime() }),
    )
    await backdateOAuthAccountUnlinkedAt('linkedin', activeAccountId, window.firstEligibleDate)
    await backdateOAuthAccountUnlinkedAt('linkedin', unrelatedAccountId, window.secondEligibleDate)
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: authorizationId,
      provider: 'linkedin',
      status: 'completion_ready',
      providerUserId: activeAccountId,
      callbackReceivedAt: now,
      completionReadyAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })

    await expect(
      deleteOrphanedOAuthAccountBatch(
        'linkedin_accounts',
        'linkedin_user_id',
        window.upperBoundDate,
        2,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(1)
    await expect(oauthAccountExistsByProviderUserId('linkedin', activeAccountId)).resolves.toBe(
      true,
    )
    await expect(oauthAccountExistsByProviderUserId('linkedin', unrelatedAccountId)).resolves.toBe(
      false,
    )
    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toMatchObject({
      linkedin_account_id: activeAccount.account_id,
    })
  }, 30_000)

  // no-mistakes-timeout-reason: shared-database setup and multi-row writes exceed the 5s default in CI
  it('preserves an old orphaned Facebook account during its active broker completion', async () => {
    const window = createTestRetentionWindow()
    const activeProviderId = `retained-facebook-${createRandomString(12)}`
    const unrelatedProviderId = `unrelated-facebook-${createRandomString(12)}`
    await insertTestOAuthAccount('facebook', activeProviderId)
    await insertTestOAuthAccount('facebook', unrelatedProviderId)
    const activeAccountId = await setOAuthAccountRetentionTime(
      'facebook',
      activeProviderId,
      window.firstEligibleDate,
    )
    await setOAuthAccountRetentionTime('facebook', unrelatedProviderId, window.secondEligibleDate)
    if (!activeAccountId) throw new Error('Retained Facebook account fixture is missing')
    const authorizationId = v7()
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        facebookUserIds: [activeProviderId, unrelatedProviderId],
      })
    })
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: authorizationId,
      provider: 'facebook',
      status: 'completion_ready',
      providerUserId: activeProviderId,
      callbackReceivedAt: now,
      completionReadyAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })

    await expect(
      deleteOrphanedOAuthAccountBatch(
        'facebook_accounts',
        'facebook_user_id',
        window.upperBoundDate,
        2,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(1)
    await expect(oauthAccountExistsByProviderUserId('facebook', activeProviderId)).resolves.toBe(
      true,
    )
    await expect(oauthAccountExistsByProviderUserId('facebook', unrelatedProviderId)).resolves.toBe(
      false,
    )
    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toMatchObject({
      facebook_account_id: activeAccountId,
    })
  }, 30_000)

  // no-mistakes-timeout-reason: shared-database setup and multi-row writes exceed the 5s default in CI
  it('preserves an old orphaned Microsoft account during its active broker completion', async () => {
    const window = createTestRetentionWindow()
    const activeProviderId = `retained-microsoft-${createRandomString(12)}`
    const unrelatedProviderId = `unrelated-microsoft-${createRandomString(12)}`
    const activeAccount = await insertTestMicrosoftOAuthAccount(
      activeProviderId,
      v7({ msecs: window.firstEligibleDate.getTime() }),
    )
    const unrelatedAccount = await insertTestMicrosoftOAuthAccount(
      unrelatedProviderId,
      v7({ msecs: window.secondEligibleDate.getTime() }),
    )
    await backdateOAuthAccountUnlinkedAt('microsoft', activeProviderId, window.firstEligibleDate)
    await backdateOAuthAccountUnlinkedAt(
      'microsoft',
      unrelatedProviderId,
      window.secondEligibleDate,
    )
    if (!activeAccount.account_id || !unrelatedAccount.account_id) {
      throw new Error('Microsoft test accounts must return their internal IDs')
    }
    const authorizationId = v7()
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        microsoftUserIds: [activeProviderId, unrelatedProviderId],
      })
    })

    const now = new Date()
    await insertTestOAuthAuthorization({
      id: authorizationId,
      provider: 'microsoft',
      status: 'completion_ready',
      microsoftAccountId: activeAccount.account_id,
      callbackReceivedAt: now,
      completionReadyAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })

    await expect(
      deleteOrphanedOAuthAccountBatch(
        'microsoft_accounts',
        'microsoft_user_id',
        window.upperBoundDate,
        2,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(1)
    await expect(oauthAccountExistsByProviderUserId('microsoft', activeProviderId)).resolves.toBe(
      true,
    )
    await expect(
      oauthAccountExistsByProviderUserId('microsoft', unrelatedProviderId),
    ).resolves.toBe(false)
    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toMatchObject({
      microsoft_account_id: activeAccount.account_id,
    })
  }, 30_000)

  it('rejects table and column identifiers outside the configured provider allowlist', async () => {
    await expect(
      deleteOrphanedOAuthAccountBatch('bad_table', 'github_user_id', new Date(), 1),
    ).rejects.toThrow('Invalid OAuth cleanup table: bad_table')
    for (const config of Object.values(providerTableConfigs)) {
      await expect(
        deleteOrphanedOAuthAccountBatch(config.table, config.providerUserIdColumn, new Date(0), 1),
      ).resolves.toBeGreaterThanOrEqual(0)
    }
  })
})
