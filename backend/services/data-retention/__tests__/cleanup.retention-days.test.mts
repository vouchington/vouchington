import { describe, expect, it } from 'vitest'
import { runDataRetentionCleanup } from '../cleanup.mts'

describe('retention day validation', () => {
  it('rejects unsafe soft-deleted user retention windows', async () => {
    await expect(
      runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        { families: ['softDeletedUsers'], softDeletedUsers: { retentionDays: 0, maxBatches: 1 } },
      ).then(result => result.softDeletedUsers),
    ).rejects.toThrow('retentionDays must be a positive integer')
    await expect(
      runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        {
          families: ['softDeletedUsers'],
          softDeletedUsers: { retentionDays: Infinity, maxBatches: 1 },
        },
      ).then(result => result.softDeletedUsers),
    ).rejects.toThrow('retentionDays must be a positive integer')
  })

  it('rejects unsafe referral attribution retention windows', async () => {
    await expect(
      runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        {
          families: ['oldReferralAttributions'],
          oldReferralAttributions: { retentionDays: 0, maxBatches: 1 },
        },
      ).then(result => result.oldReferralAttributions),
    ).rejects.toThrow('retentionDays must be a positive integer')
    await expect(
      runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        {
          families: ['oldReferralAttributions'],
          oldReferralAttributions: { retentionDays: Infinity, maxBatches: 1 },
        },
      ).then(result => result.oldReferralAttributions),
    ).rejects.toThrow('retentionDays must be a positive integer')
  })

  it('rejects unsafe OAuth account retention windows', async () => {
    await expect(
      runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        {
          families: ['orphanedOAuthAccounts'],
          orphanedOAuthAccounts: { retentionDays: 0, maxBatches: 1 },
        },
      ).then(result => result.orphanedOAuthAccounts),
    ).rejects.toThrow('retentionDays must be a positive integer')
    await expect(
      runDataRetentionCleanup(
        { batchSize: 500, maxBatches: 1 },
        {
          families: ['orphanedOAuthAccounts'],
          orphanedOAuthAccounts: { retentionDays: Infinity, maxBatches: 1 },
        },
      ).then(result => result.orphanedOAuthAccounts),
    ).rejects.toThrow('retentionDays must be a positive integer')
  })
})
