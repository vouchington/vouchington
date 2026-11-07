import type { UserPurgeResult } from './user-purge-types.mts'
import type { RetainedRelationIdentityCleanupPage } from './cleanup-retained-relation-identities.mts'
import type { RetainedMediaBindingCleanupPage } from './cleanup-retained-media-bindings.mts'
import type { RetainedIdentityCleanupPage } from './cleanup-retained-identities.mts'
import type { HistoryCleanupResult, HistoryKind } from './cleanup-histories.mts'
import type { PaymentOperationCleanupResult } from './cleanup-payment-operations.mts'
import type { PaymentLedgerCleanupPage } from './cleanup-payment-ledgers.mts'
import type { AuthSessionCleanupResult } from './cleanup-auth-sessions.mts'
import type { PendingNotificationPushIntentCleanupResult } from './cleanup-notification-push-intents.mts'
import type { PostModerationLedgerCleanupResult } from './cleanup-post-moderation-ledger.mts'
import type { AgentModerationCleanupResult } from './cleanup-agent-moderations.mts'
import type { ClassifierCleanupResult } from './cleanup-classifier-records.mts'
import type { NotificationEmailCleanupResult } from './cleanup-notification-email.mts'
import type { FederationRetentionResult } from './cleanup-federation.mts'
import type { VoteBallotCleanupPage } from './cleanup-vote-ballots.mts'
import type { UserAgentStringCleanupPage } from './cleanup-user-agent-strings.mts'
import type { VoteIntegrityDetailCleanupPage } from './cleanup-vote-integrity-details.mts'
import type { OperationalTombstoneCleanupResult } from './cleanup-operational-tombstone-types.mts'
import type { AiUsageCleanupResult } from './cleanup-ai-usage-types.mts'
import type { CleanupResult } from './cleanup-run-shapes.mts'
import { cleanupLegalRecords } from './cleanup-legal-records.mts'
import { cleanupCompletedImportBatches } from './cleanup-import-batches.mts'
import { cleanupExpiredUserDataRequestAttempts } from './cleanup-user-data-request-attempts.mts'
import { cleanupHackerNewsReferences } from './cleanup-hacker-news.mts'

export type DataRetentionCleanupResult = {
  hackerNewsReferences: Awaited<ReturnType<typeof cleanupHackerNewsReferences>>
  legalRecords: Awaited<ReturnType<typeof cleanupLegalRecords>>
  copyrightFormScreeningAttempts?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightActionAttempts?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightDeliveryAttempts?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightGuestCapabilities?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightUnlinkedEmailIntakes?: { scanned: number; erased: number; hasMore: boolean }
  copyrightReceiptReviews?: { scanned: number; retired: number; hasMore: boolean }
  copyrightCaseThreads?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightOrphanEmailThreadTokens?: { scanned: number; deleted: number; hasMore: boolean }
  retainedRelationIdentities: RetainedRelationIdentityCleanupPage[]
  retainedMediaBindings: RetainedMediaBindingCleanupPage
  retainedIdentityRoots: RetainedIdentityCleanupPage[]
  softDeletedUsers: UserPurgeResult
  oldReferralAttributions: CleanupResult
  histories: Record<HistoryKind, HistoryCleanupResult>
  orphanedOAuthAccounts: CleanupResult
  oauthFriendEdges: CleanupResult & { resolved: number }
  securityRecords: CleanupResult
  expiredOAuthAuthorizations: CleanupResult
  expiredOAuthServerArtifacts: CleanupResult
  expiredBlueskyLinkCompletions: CleanupResult
  abandonedBlueskyLinkSessions: CleanupResult
  expiredContributionAdmissions: CleanupResult
  expiredContributionQuotaConsumptions: CleanupResult
  expiredTopicImportAttempts: CleanupResult
  terminalNotificationPushIntents: CleanupResult
  deliveredMembershipEntitlementEffects: CleanupResult
  endedMembershipRenewalNotices: CleanupResult
  terminalGooglePlayAcknowledgments: CleanupResult
  terminalStripeEventWork: PaymentOperationCleanupResult
  abandonedMembershipPurchaseIntents: PaymentOperationCleanupResult
  paymentLedgers: PaymentLedgerCleanupPage[]
  emailAddressLoginTokens: AuthSessionCleanupResult
  phoneNumberLoginTokens: AuthSessionCleanupResult
  expiredUserSessions: AuthSessionCleanupResult
  webPushSubscriptionTombstones: AuthSessionCleanupResult
  oldPendingNotificationPushIntents: PendingNotificationPushIntentCleanupResult
  oldModerationQueueClaims: CleanupResult & { cursorId: string | null }
  oldModerationMediaReveals: CleanupResult & { cursorId: string | null }
  postModerationLedger: PostModerationLedgerCleanupResult
  agentModerations: AgentModerationCleanupResult
  textEmbeddingCache: CleanupResult
  terminalEmbeddingBatches: CleanupResult
  completedAdminImportBatches: Awaited<ReturnType<typeof cleanupCompletedImportBatches>>
  completedRssImportBatches: Awaited<ReturnType<typeof cleanupCompletedImportBatches>>
  expiredUserDataRequestAttempts: Awaited<ReturnType<typeof cleanupExpiredUserDataRequestAttempts>>
  oldMediaDeliveryChanges: CleanupResult
  classifierRecords: ClassifierCleanupResult
  sesBounceEvents: NotificationEmailCleanupResult
  systemPrunedNotifications: NotificationEmailCleanupResult
  userDeletedNotifications: NotificationEmailCleanupResult
  moderationEmailSends: NotificationEmailCleanupResult
  federationRetention: FederationRetentionResult
  supersededVoteBallots: VoteBallotCleanupPage[]
  orphanedUserAgentStrings: UserAgentStringCleanupPage
  voteIntegrityDetails: VoteIntegrityDetailCleanupPage
  undoneActivityPubLikes: OperationalTombstoneCleanupResult
  staleRemoteActors: OperationalTombstoneCleanupResult
  feedHostnameBlocks: OperationalTombstoneCleanupResult
  otherHostnameBlocks: OperationalTombstoneCleanupResult
  deletedConversations: OperationalTombstoneCleanupResult
  appAttestationKeys: OperationalTombstoneCleanupResult
  aiUsageRecords: AiUsageCleanupResult
}
