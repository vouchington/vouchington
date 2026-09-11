import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestRetentionWindow,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  setOAuthAccountCreatedAt,
} from '@voucha/test-helpers'
import { providerTableConfigs } from '@services/oauth/providers'
import { cleanupOrphanedOAuthAccounts } from '../cleanup.mts'
import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'

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

    const result = await cleanupOrphanedOAuthAccounts({ ...window, batchSize: 1, maxBatches: 1 })
    expect(result).toEqual({ deleted: 1, hasMore: true })
    expect(
      [
        await oauthAccountExistsByProviderUserId('facebook', firstId),
        await oauthAccountExistsByProviderUserId('facebook', secondId),
      ].filter(Boolean),
    ).toHaveLength(1)
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
