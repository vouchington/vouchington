import { describe, expect, it } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUserDirect,
  insertReferralAttributionAt,
  referralAttributionExistsById,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  cleanupExpiredOAuthAuthorizationServerArtifacts,
  cleanupOldReferralAttributions,
  cleanupOrphanedOAuthAccounts,
  cleanupSoftDeletedUsers,
  runDataRetentionCleanup,
} from '../cleanup.mts'
import { dataRetentionConfig, getDataRetentionLimits } from '../config.mts'

const DAY_MS = 24 * 60 * 60 * 1000

// Every cleanup except the one under test sweeps a window that holds no rows, so the shared
// database's other fixtures are untouched.
function emptyScopedOptions(now: Date) {
  const emptyWindow = { lowerBoundDate: new Date(now.getTime() + DAY_MS), now }
  return {
    retainedIdentityRootIds: {},
    retainedRelationIdentityKeys: {},
    retainedMediaBindingIds: [],
    softDeletedUsers: emptyWindow,
    orphanedOAuthAccounts: emptyWindow,
    expiredOAuthAuthorizations: { ...emptyWindow, authorizationIds: [] },
    expiredOAuthServerArtifacts: emptyWindow,
    expiredBlueskyLinkCompletions: emptyWindow,
    abandonedBlueskyLinkSessions: emptyWindow,
    expiredContributionAdmissions: emptyWindow,
    expiredContributionQuotaConsumptions: emptyWindow,
    expiredTopicImportAttempts: emptyWindow,
    terminalNotificationPushIntents: emptyWindow,
  }
}

describe('data retention per-run caps', () => {
  it('stops after max_batches_per_run batches and reports hasMore while rows remain', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    const eligibleDates = [
      window.firstEligibleDate,
      new Date(window.firstEligibleDate.getTime() + 30_000),
      window.secondEligibleDate,
    ]
    const ids = await Promise.all(
      eligibleDates.map(date => insertReferralAttributionAt(referrer.id, date)),
    )
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 1,
      max_batches_per_run: 2,
    })
    const options = {
      ...emptyScopedOptions(window.now),
      oldReferralAttributions: {
        retentionDays: window.retentionDays,
        lowerBoundDate: window.lowerBoundDate,
        now: window.now,
      },
    }

    const first = await runDataRetentionCleanup(getDataRetentionLimits(), options)
    expect(first.oldReferralAttributions).toEqual({ deleted: 2, hasMore: true })
    expect(
      (await Promise.all(ids.map(id => referralAttributionExistsById(id)))).filter(Boolean),
    ).toHaveLength(1)

    const second = await runDataRetentionCleanup(getDataRetentionLimits(), options)
    expect(second.oldReferralAttributions).toEqual({ deleted: 1, hasMore: false })
    expect(await Promise.all(ids.map(id => referralAttributionExistsById(id)))).toEqual([
      false,
      false,
      false,
    ])
  }, 60_000)

  it('lets a per-cleanup override replace the run limits', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    const ids = await Promise.all([
      insertReferralAttributionAt(referrer.id, window.firstEligibleDate),
      insertReferralAttributionAt(referrer.id, window.secondEligibleDate),
    ])

    const result = await runDataRetentionCleanup(
      { batchSize: 1, maxBatches: 1 },
      {
        ...emptyScopedOptions(window.now),
        oldReferralAttributions: {
          retentionDays: window.retentionDays,
          lowerBoundDate: window.lowerBoundDate,
          now: window.now,
          maxBatches: 10,
        },
      },
    )

    expect(result.oldReferralAttributions).toEqual({ deleted: 2, hasMore: false })
    expect(await Promise.all(ids.map(id => referralAttributionExistsById(id)))).toEqual([
      false,
      false,
    ])
  }, 60_000)

  it.each([
    ['soft-deleted users', cleanupSoftDeletedUsers],
    ['referral attributions', cleanupOldReferralAttributions],
    ['orphaned OAuth accounts', cleanupOrphanedOAuthAccounts],
    ['OAuth server artifacts', cleanupExpiredOAuthAuthorizationServerArtifacts],
  ])('rejects an uncapped or invalid maxBatches for %s', async (_name, cleanup) => {
    for (const maxBatches of [Infinity, 0, -1, 1.5]) {
      await expect(cleanup({ maxBatches })).rejects.toThrow('maxBatches must be a positive integer')
    }
  })
})
