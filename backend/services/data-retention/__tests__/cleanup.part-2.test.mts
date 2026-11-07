import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestRetentionWindow,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  setOAuthAccountRetentionTime,
} from '@voucha/test-helpers'
import { oauthProviders } from '@services/oauth/providers'
import { runDataRetentionCleanup } from '../cleanup.mts'

const DAY_MS = 24 * 60 * 60 * 1000

function nextRunStartingAtFirstProvider(now: Date): Date {
  const utcDay = Math.floor(now.getTime() / DAY_MS)
  const daysUntilFirstProvider =
    (oauthProviders.length - (utcDay % oauthProviders.length)) % oauthProviders.length
  return new Date(now.getTime() + daysUntilFirstProvider * DAY_MS)
}

describe('orphaned OAuth account cleanup', () => {
  // no-mistakes-timeout-reason: shared-database setup and multi-row writes exceed the 5s default in CI
  it('deletes old orphaned accounts and retains newer accounts', async () => {
    const window = createTestRetentionWindow()
    const oldId = `old-${createRandomString(12)}`
    const recentId = `recent-${createRandomString(12)}`
    await insertTestOAuthAccount('github', oldId)
    await insertTestOAuthAccount('github', recentId)
    await setOAuthAccountRetentionTime('github', oldId, window.firstEligibleDate)
    await setOAuthAccountRetentionTime('github', recentId, window.afterUpperBoundDate)

    await expect(
      runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        { families: ['orphanedOAuthAccounts'], orphanedOAuthAccounts: window },
      ).then(result => result.orphanedOAuthAccounts),
    ).resolves.toMatchObject({ deleted: 1 })
    expect(await oauthAccountExistsByProviderUserId('github', oldId)).toBe(false)
    expect(await oauthAccountExistsByProviderUserId('github', recentId)).toBe(true)
  }, 30_000)

  // no-mistakes-timeout-reason: shared-database setup and multi-row writes exceed the 5s default in CI
  it('keeps deletion bounded by the configured batch count', async () => {
    const window = createTestRetentionWindow()
    const firstId = `batch-first-${createRandomString(12)}`
    const secondId = `batch-second-${createRandomString(12)}`
    await insertTestOAuthAccount('facebook', firstId)
    await insertTestOAuthAccount('facebook', secondId)
    await setOAuthAccountRetentionTime('facebook', firstId, window.firstEligibleDate)
    await setOAuthAccountRetentionTime('facebook', secondId, window.secondEligibleDate)

    const orphanedOAuthAccountsCleanup = await runDataRetentionCleanup(
      { batchSize: 500, maxBatches: 1 },
      {
        families: ['orphanedOAuthAccounts'],
        orphanedOAuthAccounts: {
          ...window,
          now: nextRunStartingAtFirstProvider(window.now),
          batchSize: 1,
          maxBatches: 1,
        },
      },
    ).then(result => result.orphanedOAuthAccounts)
    expect(orphanedOAuthAccountsCleanup).toEqual({ deleted: 1, hasMore: true })
    expect(
      [
        await oauthAccountExistsByProviderUserId('facebook', firstId),
        await oauthAccountExistsByProviderUserId('facebook', secondId),
      ].filter(Boolean),
    ).toHaveLength(1)
  }, 30_000)

  // no-mistakes-timeout-reason: shared-database setup and multi-row writes exceed the 5s default in CI
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
      await setOAuthAccountRetentionTime(firstProvider, id, window.firstEligibleDate)
    }
    await insertTestOAuthAccount(laterProvider, laterId)
    await setOAuthAccountRetentionTime(laterProvider, laterId, window.firstEligibleDate)

    const options = {
      lowerBoundDate: window.lowerBoundDate,
      retentionDays: window.retentionDays,
      batchSize: 1,
      maxBatches: 1,
    }
    expect(
      await runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        {
          families: ['orphanedOAuthAccounts'],
          orphanedOAuthAccounts: { ...options, now: firstNow },
        },
      ).then(result => result.orphanedOAuthAccounts),
    ).toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect(await oauthAccountExistsByProviderUserId(laterProvider, laterId)).toBe(true)

    expect(
      await runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        {
          families: ['orphanedOAuthAccounts'],
          orphanedOAuthAccounts: { ...options, now: secondNow },
        },
      ).then(result => result.orphanedOAuthAccounts),
    ).toEqual({
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
})
