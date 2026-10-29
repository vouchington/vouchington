import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
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
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupRetainedMediaBindings } from '../cleanup-retained-media-bindings.mts'
import { cleanupRetainedRelationIdentities } from '../cleanup-retained-relation-identities.mts'
import {
  cleanupExpiredOAuthAuthorizationServerArtifacts,
  cleanupOldReferralAttributions,
  cleanupOrphanedOAuthAccounts,
  cleanupSoftDeletedUsers,
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
    voteBallotIdsByTable: {},
    userAgentStringIds: [],
    voteIntegrityFlagIds: [],
    retainedIdentityRootIds: {},
    retainedRelationIdentityKeys: {},
    retainedMediaBindingIds: [],
    softDeletedUsers: emptyWindow,
    histories: emptyWindow,
    orphanedOAuthAccounts: emptyWindow,
    oauthFriendEdges: { now: new Date('1970-01-02T00:00:00.000Z') },
    expiredOAuthAuthorizations: { ...emptyWindow, authorizationIds: [] },
    expiredOAuthServerArtifacts: emptyWindow,
    expiredBlueskyLinkCompletions: emptyWindow,
    abandonedBlueskyLinkSessions: emptyWindow,
    expiredContributionAdmissions: emptyWindow,
    expiredContributionQuotaConsumptions: emptyWindow,
    expiredTopicImportAttempts: emptyWindow,
    terminalNotificationPushIntents: emptyWindow,
    deliveredMembershipEntitlementEffects: emptyWindow,
    endedMembershipRenewalNotices: emptyWindow,
    terminalGooglePlayAcknowledgments: emptyWindow,
    terminalStripeEventWork: emptyWindow,
    abandonedMembershipPurchaseIntents: emptyWindow,
    emailAddressLoginTokens: emptyWindow,
    phoneNumberLoginTokens: emptyWindow,
    expiredUserSessions: emptyWindow,
    webPushSubscriptionTombstones: emptyWindow,
    oldModerationQueueClaims: emptyWindow,
    oldModerationMediaReveals: emptyWindow,
    federationRetention: { now: new Date(0) },
    textEmbeddingCache: emptyWindow,
    terminalEmbeddingBatches: emptyWindow,
    oldMediaDeliveryChanges: emptyWindow,
    classifierRecords: emptyWindow,
    sesBounceEvents: emptyWindow,
    systemPrunedNotifications: emptyWindow,
    userDeletedNotifications: emptyWindow,
    moderationEmailSends: emptyWindow,
  }
}

describe('data retention per-run caps', () => {
  it.each([1, 1_000])('cleans exact owned retained pages capped at %i', async pageSize => {
    const postId = randomUUID()
    const relationId = randomUUID()
    const imageId = randomUUID()
    const placementId = randomUUID()
    const relationTable = 'relation__post__category__topic'
    await insertTestRetainedIdentityRoot('post', postId)
    await insertTestRetainedRelationIdentity(relationTable, postId, relationId)
    await seedTestRetainedMediaOrphan({ imageId, placementId, bindingFamily: 'post' })
    const relationResult = await cleanupRetainedRelationIdentities(pageSize, {
      [relationTable]: [{ subjectId: postId, relationId }],
    })
    expect(relationResult).toEqual([{ relationTable, scanned: 1, deleted: 1, hasMore: false }])
    const mediaResult = await cleanupRetainedMediaBindings(pageSize, [placementId])
    expect(mediaResult).toEqual({ scanned: 1, deleted: 1, hasMore: false })
    // Root removal follows the actual deletion of these owned relation and media references.
    const rootResult = await cleanupRetainedIdentityRoots(pageSize, {
      post: [postId],
      image: [imageId],
    })
    expect(rootResult).toEqual([
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
    onTestFinished(
      overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
        batch_size: 1,
        max_batches_per_run: 2,
      }),
    )
    const options = {
      retentionDays: window.retentionDays,
      lowerBoundDate: window.lowerBoundDate,
      now: window.now,
    }

    expect(getDataRetentionLimits()).toEqual({ batchSize: 1, maxBatches: 2 })
    const first = await cleanupOldReferralAttributions({ ...options, ...getDataRetentionLimits() })
    expect(first).toEqual({ deleted: 2, hasMore: true })
    expect(
      (await Promise.all(ids.map(id => referralAttributionExistsById(id)))).filter(Boolean),
    ).toHaveLength(1)

    const second = await cleanupOldReferralAttributions({ ...options, ...getDataRetentionLimits() })
    expect(second).toEqual({ deleted: 1, hasMore: false })
    expect(await Promise.all(ids.map(id => referralAttributionExistsById(id)))).toEqual([
      false,
      false,
      false,
    ])
  })

  it('uses explicit cleanup limits to drain the owned referral window', async () => {
    const window = createTestRetentionWindow()
    const referrer = await createTestUserDirect()
    const ids = await Promise.all([
      insertReferralAttributionAt(referrer.id, window.firstEligibleDate),
      insertReferralAttributionAt(referrer.id, window.secondEligibleDate),
    ])

    const result = await cleanupOldReferralAttributions({
      batchSize: 1,
      maxBatches: 10,
      retentionDays: window.retentionDays,
      lowerBoundDate: window.lowerBoundDate,
      now: window.now,
    })

    expect(result).toEqual({ deleted: 2, hasMore: false })
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
