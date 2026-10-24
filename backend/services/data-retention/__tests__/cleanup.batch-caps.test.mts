import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  acquireModerationOperationRetentionTestLock,
  createTestRetentionWindow,
  createTestUserDirect,
  insertReferralAttributionAt,
  referralAttributionExistsById,
} from '@voucha/test-helpers'
import {
  createDynamicConfigTestKey,
  createDynamicConfigForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { dynamicConfigValkeyClient } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import {
  insertTestRetainedIdentityRoot,
  insertTestRetainedRelationIdentity,
} from '@voucha/test-helpers/entities/retained-identities'
import { seedTestRetainedMediaOrphan } from '@voucha/test-helpers/entities/retained-media'
import { acquirePaymentOperationRetentionTestLock } from '@voucha/test-helpers/payment-operation-retention'
import * as cleanupBatches from '../cleanup-batches.mts'
import * as retainedRoots from '../cleanup-retained-identities.mts'
import * as retainedMedia from '../cleanup-retained-media-bindings.mts'
import * as retainedRelations from '../cleanup-retained-relation-identities.mts'
import {
  cleanupExpiredOAuthAuthorizationServerArtifacts,
  cleanupOldReferralAttributions,
  cleanupOrphanedOAuthAccounts,
  cleanupSoftDeletedUsers,
  runDataRetentionCleanup,
} from '../cleanup.mts'
import {
  DATA_RETENTION_MAX_VALUES,
  DEFAULT_DATA_RETENTION_CONFIG,
  dataRetentionConfig,
  getDataRetentionLimits,
} from '../config.mts'

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
    terminalStripeEventWork: emptyWindow,
    abandonedMembershipPurchaseIntents: emptyWindow,
    emailAddressLoginTokens: emptyWindow,
    phoneNumberLoginTokens: emptyWindow,
    expiredUserSessions: emptyWindow,
    webPushSubscriptionTombstones: emptyWindow,
    oldModerationQueueClaims: emptyWindow,
    oldModerationMediaReveals: emptyWindow,
    classifierRecords: emptyWindow,
  }
}

describe('data retention per-run caps', () => {
  it.each([
    [1, 1],
    [DATA_RETENTION_MAX_VALUES.batch_size, 1_000],
  ])('uses a bounded retained page for batch size %i', async (batchSize, pageSize) => {
    const moderationLock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => moderationLock.release())
    const lock = await acquirePaymentOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    const roots = vi.spyOn(retainedRoots, 'cleanupRetainedIdentityRoots')
    const media = vi.spyOn(retainedMedia, 'cleanupRetainedMediaBindings')
    const relations = vi.spyOn(retainedRelations, 'cleanupRetainedRelationIdentities')
    onTestFinished(() => {
      roots.mockRestore()
      media.mockRestore()
      relations.mockRestore()
    })
    const postId = randomUUID()
    const relationId = randomUUID()
    const imageId = randomUUID()
    const placementId = randomUUID()
    const relationTable = 'relation__post__category__topic'
    await insertTestRetainedIdentityRoot('post', postId)
    await insertTestRetainedRelationIdentity(relationTable, postId, relationId)
    await seedTestRetainedMediaOrphan({ imageId, placementId, bindingFamily: 'post' })
    const now = new Date()
    const options = {
      ...emptyScopedOptions(now),
      oldReferralAttributions: { now, lowerBoundDate: new Date(now.getTime() + DAY_MS) },
      retainedIdentityRootIds: { post: [postId], image: [imageId] },
      retainedRelationIdentityKeys: {
        [relationTable]: [{ subjectId: postId, relationId }],
      },
      retainedMediaBindingIds: [placementId],
    }

    const result = await runDataRetentionCleanup({ batchSize, maxBatches: 1 }, options)

    expect(relations).toHaveBeenCalledExactlyOnceWith(
      pageSize,
      options.retainedRelationIdentityKeys,
    )
    expect(media).toHaveBeenCalledExactlyOnceWith(pageSize, options.retainedMediaBindingIds)
    expect(roots).toHaveBeenCalledExactlyOnceWith(pageSize, options.retainedIdentityRootIds)
    expect(result.retainedRelationIdentities).toEqual([
      { relationTable, scanned: 1, deleted: 1, hasMore: false },
    ])
    expect(result.retainedMediaBindings).toEqual({ scanned: 1, deleted: 1, hasMore: false })
    expect(result.retainedIdentityRoots).toEqual([
      { family: 'post', scanned: 1, deleted: 1, hasMore: false },
      { family: 'image', scanned: 1, deleted: 1, hasMore: false },
    ])
  })

  it('loads persisted limits into a fresh config before its first read', async () => {
    const configOptions = {
      key: createDynamicConfigTestKey('retention-cold-start'),
      fieldTypes: dataRetentionConfig.fieldTypes,
      defaultFields: DEFAULT_DATA_RETENTION_CONFIG,
    }
    const writer = createDynamicConfigForTest(configOptions)
    try {
      await writer.waitForInitialization()
      await writer.setFields({ batch_size: 7, max_batches_per_run: 3 })
      const coldReader = createDynamicConfigForTest(configOptions)
      try {
        await coldReader.waitForInitialization()
        expect(
          getBoundedPositiveIntegerField(coldReader, 'batch_size', {
            defaultValue: configOptions.defaultFields.batch_size,
            maxValue: DATA_RETENTION_MAX_VALUES.batch_size,
          }),
        ).toBe(7)
        expect(
          getBoundedPositiveIntegerField(coldReader, 'max_batches_per_run', {
            defaultValue: configOptions.defaultFields.max_batches_per_run,
            maxValue: DATA_RETENTION_MAX_VALUES.max_batches_per_run,
          }),
        ).toBe(3)
      } finally {
        await coldReader.close()
      }
    } finally {
      await writer.close()
      await dynamicConfigValkeyClient.del([writer.key])
    }
  })

  it('stops after max_batches_per_run batches and reports hasMore while rows remain', async () => {
    const moderationLock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => moderationLock.release())
    const lock = await acquirePaymentOperationRetentionTestLock()
    onTestFinished(() => lock.release())
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
    await dataRetentionConfig.waitForInitialization()
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

    expect(getDataRetentionLimits()).toEqual({ batchSize: 1, maxBatches: 2 })
    const batches = vi.spyOn(cleanupBatches, 'deleteOldReferralAttributionBatch')
    onTestFinished(() => batches.mockRestore())
    const first = await runDataRetentionCleanup(getDataRetentionLimits(), options)
    expect({
      limits: batches.mock.calls.map(call => call[1]),
      result: first.oldReferralAttributions,
      remaining: (await Promise.all(ids.map(id => referralAttributionExistsById(id)))).filter(
        Boolean,
      ).length,
    }).toEqual({ limits: [1, 1], result: { deleted: 2, hasMore: true }, remaining: 1 })
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
  })

  it('lets a per-cleanup override replace the run limits', async () => {
    const moderationLock = await acquireModerationOperationRetentionTestLock()
    onTestFinished(() => moderationLock.release())
    const lock = await acquirePaymentOperationRetentionTestLock()
    onTestFinished(() => lock.release())
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
  })

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
