import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { insertTestLinkedInOAuthAccount } from '@voucha/test-helpers/entities/linkedin-oauth-accounts'
import {
  createRandomString,
  createTestRetentionWindow,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  setOAuthAccountCreatedAt,
} from '@voucha/test-helpers'
import { oauthProviders, providerTableConfigs } from '@services/oauth/providers'
import { cleanupOrphanedOAuthAccounts } from '../cleanup.mts'
import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'

const DAY_MS = 24 * 60 * 60 * 1000

function nextRunStartingAtFirstProvider(now: Date): Date {
  const utcDay = Math.floor(now.getTime() / DAY_MS)
  const daysUntilFirstProvider =
    (oauthProviders.length - (utcDay % oauthProviders.length)) % oauthProviders.length
  return new Date(now.getTime() + daysUntilFirstProvider * DAY_MS)
}

describe('orphaned OAuth account cleanup', () => {
  it('deletes old orphaned accounts and retains newer accounts', async () => {
    const window = createTestRetentionWindow()
    const oldId = `old-${createRandomString(12)}`
    const recentId = `recent-${createRandomString(12)}`
    await insertTestOAuthAccount('github', oldId)
    await insertTestOAuthAccount('github', recentId)
    await setOAuthAccountCreatedAt('github', oldId, window.firstEligibleDate)
    await setOAuthAccountCreatedAt('github', recentId, window.afterUpperBoundDate)

    await expect(cleanupOrphanedOAuthAccounts(window)).resolves.toMatchObject({ deleted: 1 })
    expect(await oauthAccountExistsByProviderUserId('github', oldId)).toBe(false)
    expect(await oauthAccountExistsByProviderUserId('github', recentId)).toBe(true)
  }, 30_000)

  it('keeps deletion bounded by the configured batch count', async () => {
    const window = createTestRetentionWindow()
    const firstId = `batch-first-${createRandomString(12)}`
    const secondId = `batch-second-${createRandomString(12)}`
    await insertTestOAuthAccount('facebook', firstId)
    await insertTestOAuthAccount('facebook', secondId)
    await setOAuthAccountCreatedAt('facebook', firstId, window.firstEligibleDate)
    await setOAuthAccountCreatedAt('facebook', secondId, window.secondEligibleDate)

    const result = await cleanupOrphanedOAuthAccounts({
      ...window,
      now: nextRunStartingAtFirstProvider(window.now),
      batchSize: 1,
      maxBatches: 1,
    })
    expect(result).toEqual({ deleted: 1, hasMore: true })
    expect(
      [
        await oauthAccountExistsByProviderUserId('facebook', firstId),
        await oauthAccountExistsByProviderUserId('facebook', secondId),
      ].filter(Boolean),
    ).toHaveLength(1)
  }, 30_000)

  it('reaches later providers on the next daily capped run despite an early backlog', async () => {
    const window = createTestRetentionWindow()
    const firstNow = nextRunStartingAtFirstProvider(window.now)
    const secondNow = new Date(firstNow.getTime() + DAY_MS)
    const firstProvider = oauthProviders[0]!
    const laterProvider = oauthProviders[1]!
    const firstIds = [createRandomString(12), createRandomString(12)]
    const laterId = createRandomString(12)
    for (const id of firstIds) {
      await insertTestOAuthAccount(firstProvider, id)
      await setOAuthAccountCreatedAt(firstProvider, id, window.firstEligibleDate)
    }
    await insertTestOAuthAccount(laterProvider, laterId)
    await setOAuthAccountCreatedAt(laterProvider, laterId, window.firstEligibleDate)

    const options = {
      lowerBoundDate: window.lowerBoundDate,
      retentionDays: window.retentionDays,
      batchSize: 1,
      maxBatches: 1,
    }
    expect(await cleanupOrphanedOAuthAccounts({ ...options, now: firstNow })).toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect(await oauthAccountExistsByProviderUserId(laterProvider, laterId)).toBe(true)

    expect(await cleanupOrphanedOAuthAccounts({ ...options, now: secondNow })).toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect(await oauthAccountExistsByProviderUserId(laterProvider, laterId)).toBe(false)
    expect(
      (
        await Promise.all(firstIds.map(id => oauthAccountExistsByProviderUserId(firstProvider, id)))
      ).filter(Boolean),
    ).toHaveLength(1)
  }, 30_000)

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
