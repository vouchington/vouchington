import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { runDataRetentionCleanup } from '@services/data-retention'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import processPsql from '../processors.mts'

type CleanupResult = Awaited<ReturnType<typeof runDataRetentionCleanup>>

const done = { deleted: 0, hasMore: false }
const scannedDone = { ...done, scanned: 0 }
const continuationDone = { ...done, continuation: null }
const historyDone = { scanned: 0, changed: 0, hasMore: false }
const settled = {
  retainedRelationIdentities: [],
  retainedMediaBindings: scannedDone,
  retainedIdentityRoots: [],
  softDeletedUsers: done,
  oldReferralAttributions: done,
  histories: {
    dynamic_configuration_revisions: historyDone,
    rss_feed_setting_changes: historyDone,
    fediverse_instance_integration_changes: historyDone,
    community_agent_prompt_revisions: historyDone,
    followed_user_import_requests: historyDone,
    pending_user_import_requests: historyDone,
    referral_attribution_scrub: historyDone,
    referral_attribution_expiry: historyDone,
  },
  orphanedOAuthAccounts: done,
  oauthFriendEdges: { ...done, resolved: 0 },
  securityRecords: done,
  expiredOAuthAuthorizations: done,
  expiredOAuthServerArtifacts: done,
  expiredBlueskyLinkCompletions: done,
  abandonedBlueskyLinkSessions: done,
  expiredContributionAdmissions: done,
  expiredContributionQuotaConsumptions: done,
  expiredTopicImportAttempts: done,
  terminalNotificationPushIntents: done,
  deliveredMembershipEntitlementEffects: done,
  endedMembershipRenewalNotices: done,
  terminalGooglePlayAcknowledgments: done,
  terminalStripeEventWork: { ...done, cursorId: null },
  abandonedMembershipPurchaseIntents: { ...done, cursorId: null },
  emailAddressLoginTokens: continuationDone,
  phoneNumberLoginTokens: continuationDone,
  expiredUserSessions: continuationDone,
  webPushSubscriptionTombstones: continuationDone,
  oldPendingNotificationPushIntents: continuationDone,
  oldModerationQueueClaims: { ...done, cursorId: null },
  oldModerationMediaReveals: { ...done, cursorId: null },
  postModerationLedger: {
    deletedVersions: 0,
    clearedPassEvidence: 0,
    hasMore: false,
    remainingKinds: [],
  },
  agentModerations: { ...scannedDone, continuation: null },
  textEmbeddingCache: done,
  terminalEmbeddingBatches: done,
  completedAdminImportBatches: continuationDone,
  completedRssImportBatches: continuationDone,
  expiredUserDataRequestAttempts: continuationDone,
  oldMediaDeliveryChanges: done,
  classifierRecords: {
    runCandidates: scannedDone,
    agentTopics: scannedDone,
    localOutcomes: scannedDone,
    runs: scannedDone,
    topicResults: scannedDone,
    storyResults: scannedDone,
    communityPromptResults: scannedDone,
    decisionCandidates: scannedDone,
    calls: scannedDone,
    batches: scannedDone,
    requests: scannedDone,
    deletedSubjectIdentities: scannedDone,
    versionedIdentities: scannedDone,
    identities: scannedDone,
  },
  sesBounceEvents: continuationDone,
  systemPrunedNotifications: continuationDone,
  userDeletedNotifications: continuationDone,
  moderationEmailSends: continuationDone,
  federationRetention: {
    followerDistributions: { ...done, continuationPosition: null },
    inboxReplay: { ...done, continuationPosition: null },
    terminalFollowIdentities: done,
    terminalLikeIdentities: done,
  },
  supersededVoteBallots: [],
  orphanedUserAgentStrings: scannedDone,
  voteIntegrityDetails: { scanned: 0, redacted: 0, hasMore: false },
  undoneActivityPubLikes: continuationDone,
  staleRemoteActors: continuationDone,
  feedHostnameBlocks: continuationDone,
  otherHostnameBlocks: continuationDone,
  deletedConversations: continuationDone,
  appAttestationKeys: continuationDone,
} satisfies CleanupResult

describe('final user purge continuation', () => {
  it('carries the cursor through sensitive continuations until the purge settles', async () => {
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const userPurge = {
      userId: randomUUID(),
      communityId: randomUUID(),
      afterModeratorId: randomUUID(),
    }
    const pending = {
      ...settled,
      softDeletedUsers: { deleted: 0, hasMore: true, userPurge },
    } satisfies CleanupResult
    const cleanup = vi
      .fn<typeof runDataRetentionCleanup>()
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(settled)

    await processPsql('dataRetentionCleanup', {}, { dataRetentionCleanup: cleanup }, initialJobId)
    const first = await psql.getJob(ids[0]!)
    expect(first?.data).toMatchObject({ continuation: { runId, step: 1, userPurge } })
    expect(first?.opts).toMatchObject({ sensitive: true })

    await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      { dataRetentionCleanup: cleanup },
      first!.id,
    )
    expect(cleanup).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ softDeletedUsers: { userPurge } }),
    )
    expect(await psql.getJob(ids[1]!)).toBeNull()
  })
})
