import type {
  CopyrightRetentionScopes,
  CopyrightRetentionFamily,
} from './cleanup-copyright-operational.mts'
import type { AgentModerationCleanupContinuation } from './cleanup-agent-moderations.mts'
import type { AiRerunOutcomeCleanupOptions } from './cleanup-ai-rerun-outcomes.mts'
import type { MembershipOperationalCleanupOptions } from './cleanup-membership-operational.mts'
import type { PaymentOperationCleanupOptions } from './cleanup-payment-operations.mts'
import type { NotificationEmailCleanupOptions } from './cleanup-notification-email.mts'
import type { HistoryCleanupOptions } from './cleanup-histories.mts'
import type { OptionalRetentionLimits } from './cleanup-options.mts'
import type { DataRetentionLimits } from './config.mts'
import type { PostModerationRetentionKind } from './cleanup-post-moderation-ledger.mts'
import type { RetainedIdentityFamily } from './cleanup-retained-identities.mts'
import type { RetainedRelationIdentityKey } from './cleanup-retained-relation-identities.mts'
import type { VoteRetentionCleanupOptions } from './cleanup-vote-retention.mts'
import type {
  CleanupOptions,
  ExpiryCleanupOptions,
  OperationalCleanupOptions,
} from './cleanup-run-shapes.mts'
import { cleanupFederationRetention } from './cleanup-federation.mts'
import type { DataRetentionCleanupFamily } from './cleanup-run-family.mts'

// Each cleanup in a run takes its batch size and per-run cap from the required run limits; a
// per-cleanup option can override either one (tests use this to scope windows and shrink limits).
export type DataRetentionCleanupOptions = {
  /** Omitted runs every family; selected families keep their normal ordering and page limits. */
  families?: readonly DataRetentionCleanupFamily[]
  copyrightScopes?: CopyrightRetentionScopes
  copyrightNow?: Date
  /** Continuations name the membership families that exceeded the previous run's cap. */
  activeMembershipFamilies?: readonly string[]
  includeAgentModerations?: boolean
  voteRetention?: Pick<VoteRetentionCleanupOptions, 'batchSize' | 'now'>
  voteBallotIdsByTable?: Readonly<Record<string, readonly string[]>>
  userAgentStringIds?: readonly string[]
  voteIntegrityFlagIds?: readonly string[]
  /** Non-copyright continuations omit the independent copyright retention chain. */
  activeCopyrightFamilies?: readonly CopyrightRetentionFamily[]
  retainedIdentityRootIds?: Partial<Record<RetainedIdentityFamily, readonly string[]>>
  retainedRelationIdentityKeys?: Readonly<Record<string, readonly RetainedRelationIdentityKey[]>>
  retainedMediaBindingIds?: readonly string[]
  softDeletedUsers?: OptionalRetentionLimits<CleanupOptions> & { userIds?: readonly string[] }
  oldReferralAttributions?: OptionalRetentionLimits<CleanupOptions>
  histories?: OptionalRetentionLimits<HistoryCleanupOptions>
  orphanedOAuthAccounts?: OptionalRetentionLimits<CleanupOptions>
  oauthFriendEdges?: Partial<DataRetentionLimits> & { now?: Date }
  securityRecords?: Partial<DataRetentionLimits> & { now?: Date }
  legalRecords?: { now?: Date; recordIds?: readonly string[] }
  expiredOAuthAuthorizations?: OptionalRetentionLimits<
    Pick<CleanupOptions, 'batchSize' | 'maxBatches'>
  > & {
    authorizationIds?: readonly string[]
  }
  expiredOAuthServerArtifacts?: OptionalRetentionLimits<ExpiryCleanupOptions>
  expiredBlueskyLinkCompletions?: OptionalRetentionLimits<Omit<CleanupOptions, 'retentionDays'>>
  abandonedBlueskyLinkSessions?: OptionalRetentionLimits<Omit<CleanupOptions, 'retentionDays'>>
  expiredContributionAdmissions?: OptionalRetentionLimits<ExpiryCleanupOptions>
  expiredContributionQuotaConsumptions?: OptionalRetentionLimits<ExpiryCleanupOptions>
  expiredTopicImportAttempts?: OptionalRetentionLimits<ExpiryCleanupOptions>
  terminalNotificationPushIntents?: OptionalRetentionLimits<CleanupOptions>
  deliveredMembershipEntitlementEffects?: OptionalRetentionLimits<MembershipOperationalCleanupOptions>
  endedMembershipRenewalNotices?: OptionalRetentionLimits<MembershipOperationalCleanupOptions>
  terminalGooglePlayAcknowledgments?: OptionalRetentionLimits<MembershipOperationalCleanupOptions>
  terminalStripeEventWork?: OptionalRetentionLimits<PaymentOperationCleanupOptions>
  abandonedMembershipPurchaseIntents?: OptionalRetentionLimits<PaymentOperationCleanupOptions>
  paymentLedgers?: OptionalRetentionLimits<{
    maxBatches?: number
    recordIds?: readonly string[]
  }>
  emailAddressLoginTokens?: OptionalRetentionLimits<ExpiryCleanupOptions>
  phoneNumberLoginTokens?: OptionalRetentionLimits<ExpiryCleanupOptions>
  expiredUserSessions?: OptionalRetentionLimits<ExpiryCleanupOptions>
  webPushSubscriptionTombstones?: OptionalRetentionLimits<ExpiryCleanupOptions>
  oldPendingNotificationPushIntents?: OptionalRetentionLimits<{
    batchSize?: number
    maxBatches: number
    now?: Date
  }>
  oldModerationQueueClaims?: OptionalRetentionLimits<CleanupOptions>
  reportJudgementRuns?: OptionalRetentionLimits<AiRerunOutcomeCleanupOptions>
  appealResolutionRuns?: OptionalRetentionLimits<AiRerunOutcomeCleanupOptions>
  oldModerationMediaReveals?: OptionalRetentionLimits<CleanupOptions>
  postModerationLedger?: Partial<DataRetentionLimits> & {
    postIds?: readonly string[]
    now?: Date
    kinds?: readonly PostModerationRetentionKind[]
  }
  agentModerations?: OptionalRetentionLimits<{
    postIds?: readonly string[]
    batchSize?: number
    maxBatches: number
    now?: Date
    lowerBoundDate?: Date
    upperBoundDate?: Date
    continuation?: AgentModerationCleanupContinuation
  }>
  textEmbeddingCache?: OptionalRetentionLimits<CleanupOptions>
  terminalEmbeddingBatches?: OptionalRetentionLimits<CleanupOptions> & {
    batchIds?: readonly string[]
  }
  completedAdminImportBatches?: OptionalRetentionLimits<CleanupOptions>
  completedRssImportBatches?: OptionalRetentionLimits<CleanupOptions>
  expiredUserDataRequestAttempts?: OptionalRetentionLimits<CleanupOptions>
  oldMediaDeliveryChanges?: OptionalRetentionLimits<CleanupOptions> & {
    changeIds?: readonly string[]
  }
  classifierRecords?: OptionalRetentionLimits<Omit<CleanupOptions, 'retentionDays'>> & {
    runIds?: readonly string[]
    requestIds?: readonly string[]
    topicResultBatchIds?: readonly string[]
    activeSweeps?: readonly string[]
  }
  sesBounceEvents?: OptionalRetentionLimits<NotificationEmailCleanupOptions>
  systemPrunedNotifications?: OptionalRetentionLimits<NotificationEmailCleanupOptions>
  userDeletedNotifications?: OptionalRetentionLimits<NotificationEmailCleanupOptions>
  moderationEmailSends?: OptionalRetentionLimits<NotificationEmailCleanupOptions>
  federationRetention?: Omit<
    Parameters<typeof cleanupFederationRetention>[0],
    'batchSize' | 'maxBatches'
  >
  undoneActivityPubLikes?: OptionalRetentionLimits<OperationalCleanupOptions>
  staleRemoteActors?: OptionalRetentionLimits<OperationalCleanupOptions>
  feedHostnameBlocks?: OptionalRetentionLimits<OperationalCleanupOptions>
  otherHostnameBlocks?: OptionalRetentionLimits<OperationalCleanupOptions>
  deletedConversations?: OptionalRetentionLimits<OperationalCleanupOptions>
  appAttestationKeys?: OptionalRetentionLimits<OperationalCleanupOptions>
  aiUsageRecords?: OptionalRetentionLimits<Omit<CleanupOptions, 'retentionDays'>> & {
    active?: boolean
    recordIds?: readonly string[]
  }
}
