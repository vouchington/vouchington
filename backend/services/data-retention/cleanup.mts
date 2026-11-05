import { cleanupHackerNewsReferences } from './cleanup-hacker-news.mts'
import type { UserPurgeCursor, UserPurgeResult } from './user-purge-types.mts'
/* oxlint-disable max-lines, react-doctor/async-parallel -- central retention orchestration preserves dependent cleanup order. */
// Data retention necessarily accesses tables owned by other services. This cross-service SQL is intentional:
// the retention job must hard-delete orphaned OAuth rows that have no owning service
// to delegate to (user_id is already NULL). Exposing hardDelete helpers from each
// OAuth provider would add significant boilerplate for a single use case.
import { providerTableConfigs } from '@services/oauth/providers'
import {
  sweepCopyrightOperationalRetention,
  sweepUnlinkedCopyrightEmailIntakes,
  sweepCopyrightReceiptReviews,
  sweepCopyrightCaseThreads,
} from '@services/copyright-notices'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { cleanupAnalyticsLocalFiles } from './cleanup-analytics-local.mts'
import {
  DEFAULT_BATCH_SIZE,
  cleanupSoftDeletedUserBatch,
  deleteOldReferralAttributionBatch,
  deleteOrphanedOAuthAccountBatch,
} from './cleanup-batches.mts'
import {
  getAiUsageRawRetentionDays,
  getClassifierRetentionDays,
  getDataRetentionLimits,
  readDataRetentionField,
  getPostModerationRetentionDays,
  getTopicImportAttemptDeletionBatchSize,
  type DataRetentionLimits,
} from './config.mts'
import {
  cleanupClassifierRecords,
  type ClassifierCleanupResult,
} from './cleanup-classifier-records.mts'
import { cleanupAiUsageRecords } from './cleanup-ai-usage.mts'
import type { AiUsageCleanupResult } from './cleanup-ai-usage-types.mts'
import {
  cleanupAbandonedBlueskyLinkSessions,
  cleanupExpiredBlueskyLinkCompletions,
} from './cleanup-bluesky.mts'
import { cleanupExpiredOAuthAuthorizations } from './cleanup-oauth-authorizations.mts'
import { cleanupExpiredOAuthAuthorizationServerArtifacts } from './cleanup-oauth-authorization-server.mts'
import {
  cleanupOldPendingNotificationPushIntents,
  cleanupTerminalNotificationPushIntents,
  type PendingNotificationPushIntentCleanupResult,
} from './cleanup-notification-push-intents.mts'
import { cleanupTextEmbeddingCache } from './cleanup-text-embeddings.mts'
import { cleanupTerminalEmbeddingBatches } from './cleanup-embedding-batches.mts'
import { cleanupCompletedImportBatches } from './cleanup-import-batches.mts'
import { cleanupExpiredUserDataRequestAttempts } from './cleanup-user-data-request-attempts.mts'
import { cleanupOldMediaDeliveryChanges } from './cleanup-media-delivery-changes.mts'
import type { MembershipOperationalCleanupOptions } from './cleanup-membership-operational.mts'
import { cleanupMembershipOperational } from './cleanup-membership-operational-families.mts'
import {
  cleanupTerminalStripeEventWork,
  cleanupAbandonedMembershipPurchaseIntents,
  type PaymentOperationCleanupOptions,
  type PaymentOperationCleanupResult,
} from './cleanup-payment-operations.mts'
import { cleanupPaymentLedgers, type PaymentLedgerCleanupPage } from './cleanup-payment-ledgers.mts'
import {
  cleanupEmailAddressLoginTokens,
  cleanupPhoneNumberLoginTokens,
  cleanupExpiredUserSessions,
  cleanupWebPushSubscriptionTombstones,
  type AuthSessionCleanupResult,
} from './cleanup-auth-sessions.mts'
import {
  cleanupOldModerationQueueClaims,
  cleanupOldModerationMediaReveals,
} from './cleanup-moderation-operations.mts'
import {
  cleanupSesBounceEvents,
  cleanupSystemPrunedNotifications,
  cleanupUserDeletedNotifications,
  cleanupModerationEmailSends,
  type NotificationEmailCleanupOptions,
  type NotificationEmailCleanupResult,
} from './cleanup-notification-email.mts'
import {
  cleanupFederationRetention,
  type FederationRetentionResult,
} from './cleanup-federation.mts'
import {
  applyRetentionLimits,
  getRetentionCutoffDate,
  normalizeRetentionDays,
  type OptionalRetentionLimits,
} from './cleanup-options.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'
import {
  cleanupHistories,
  type HistoryCleanupOptions,
  type HistoryCleanupResult,
  type HistoryKind,
} from './cleanup-histories.mts'
import { pruneExpiredContributionAdmissions } from '@services/contribution-gating/admission'
import { pruneExpiredContributionAdmissionConsumptions } from '@services/contribution-gating/admission-quota'
import { pruneExpiredTopicImportAttempts } from '@services/user-import-export/topic-import-attempts'
import {
  cleanupRetainedIdentityRoots,
  type RetainedIdentityCleanupPage,
  type RetainedIdentityFamily,
} from './cleanup-retained-identities.mts'
import {
  cleanupRetainedRelationIdentities,
  type RetainedRelationIdentityKey,
  type RetainedRelationIdentityCleanupPage,
} from './cleanup-retained-relation-identities.mts'
import {
  cleanupRetainedMediaBindings,
  type RetainedMediaBindingCleanupPage,
} from './cleanup-retained-media-bindings.mts'
import { cleanupSecurityRecords } from './cleanup-security-records.mts'
import { cleanupLegalRecords } from './cleanup-legal-records.mts'
import { cleanupOAuthFriendEdgeWork } from './cleanup-oauth-friend-edges.mts'
import {
  cleanupSupersededVoteBallots,
  type VoteBallotCleanupPage,
} from './cleanup-vote-ballots.mts'
import {
  cleanupOrphanedUserAgentStrings,
  type UserAgentStringCleanupPage,
} from './cleanup-user-agent-strings.mts'
import {
  cleanupVoteIntegrityDetails,
  type VoteIntegrityDetailCleanupPage,
} from './cleanup-vote-integrity-details.mts'
import { cleanupOperationalTombstones } from './cleanup-operational-tombstones.mts'
import type { OperationalTombstoneCleanupResult } from './cleanup-operational-tombstone-types.mts'
import {
  cleanupPostModerationLedger,
  type PostModerationLedgerCleanupResult,
  type PostModerationRetentionKind,
} from './cleanup-post-moderation-ledger.mts'
import {
  cleanupObsoleteAgentModerations,
  type AgentModerationCleanupContinuation,
  type AgentModerationCleanupResult,
  type AgentModerationRetentionOptions,
} from './cleanup-agent-moderations.mts'

export { cleanupAbandonedBlueskyLinkSessions, cleanupExpiredBlueskyLinkCompletions }
export { cleanupExpiredOAuthAuthorizations }
export { cleanupExpiredOAuthAuthorizationServerArtifacts }
export { cleanupTerminalNotificationPushIntents }
export { cleanupOldPendingNotificationPushIntents }
export { cleanupOldModerationQueueClaims, cleanupOldModerationMediaReveals }
export { cleanupObsoleteAgentModerations }
export type { AgentModerationRetentionOptions }

export function runAgentModerationRetentionCleanupPage(
  limits: DataRetentionLimits,
  continuation: AgentModerationCleanupContinuation,
  options: AgentModerationRetentionOptions = {},
): Promise<AgentModerationCleanupResult> {
  const overrides = { ...options, continuation }
  return cleanupObsoleteAgentModerations(applyRetentionLimits(limits, overrides))
}

type CleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  lowerBoundDate?: Date
  now?: Date
  userPurge?: UserPurgeCursor
}

type CleanupResult = {
  deleted: number
  hasMore: boolean
}

type ExpiryCleanupOptions = Pick<
  CleanupOptions,
  'batchSize' | 'maxBatches' | 'lowerBoundDate' | 'now'
>

type OperationalCleanupOptions = Parameters<typeof cleanupOperationalTombstones>[1]

export type DataRetentionCleanupFamily = keyof DataRetentionCleanupResult | 'analyticsLocalFiles'

// Each cleanup in a run takes its batch size and per-run cap from the required run limits; a
// per-cleanup option can override either one (tests use this to scope windows and shrink limits).
export type DataRetentionCleanupOptions = {
  /** Omitted runs every family; selected families keep their normal ordering and page limits. */
  families?: readonly DataRetentionCleanupFamily[]
  copyrightFormScreeningAttemptIds?: readonly string[]
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

type DataRetentionCleanupResult = {
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

export type VoteRetentionSelection = {
  voteTables: readonly string[]
  userAgentStrings: boolean
  voteIntegrityDetails: boolean
}

export type VoteRetentionCleanupOptions = {
  voteIdsByTable?: Readonly<Record<string, readonly string[]>>
  userAgentStringIds?: readonly string[]
  voteIntegrityFlagIds?: readonly string[]
  batchSize?: number
  now?: Date
}

type VoteRetentionPage = Pick<
  DataRetentionCleanupResult,
  'supersededVoteBallots' | 'orphanedUserAgentStrings' | 'voteIntegrityDetails'
>

/** Continue only families that reported another page in the previous job. */
export async function runVoteRetentionCleanupPage(
  limits: DataRetentionLimits,
  selection: VoteRetentionSelection,
  options: VoteRetentionCleanupOptions = {},
): Promise<VoteRetentionPage> {
  const now = options.now ?? new Date()
  const batchSize = options.batchSize ?? limits.batchSize
  const supersededVoteBallots = await cleanupSupersededVoteBallots(
    batchSize,
    now,
    options.voteIdsByTable,
    selection.voteTables,
  )
  const orphanedUserAgentStrings = selection.userAgentStrings
    ? await cleanupOrphanedUserAgentStrings(batchSize, options.userAgentStringIds, options.now)
    : { scanned: 0, deleted: 0, hasMore: false }
  const voteIntegrityDetails = selection.voteIntegrityDetails
    ? await cleanupVoteIntegrityDetails(batchSize, now, options.voteIntegrityFlagIds)
    : { scanned: 0, redacted: 0, hasMore: false }
  return { supersededVoteBallots, orphanedUserAgentStrings, voteIntegrityDetails }
}

export type CopyrightRetentionFamily =
  | 'copyrightFormScreeningAttempts'
  | 'copyrightActionAttempts'
  | 'copyrightDeliveryAttempts'
  | 'copyrightGuestCapabilities'
  | 'copyrightUnlinkedEmailIntakes'
  | 'copyrightReceiptReviews'
  | 'copyrightCaseThreads'
  | 'copyrightOrphanEmailThreadTokens'

type CopyrightRetentionCleanupResult = Partial<
  Pick<DataRetentionCleanupResult, CopyrightRetentionFamily>
>

/** A continuation runs only the copyright families that reached their last page cap. */
export async function runCopyrightOperationalRetentionCleanup(
  options: {
    activeFamilies?: readonly CopyrightRetentionFamily[]
    limits?: DataRetentionLimits
    formScreeningAttemptIds?: readonly string[]
    actionAttemptIds?: readonly string[]
    now?: Date
  } = {},
): Promise<CopyrightRetentionCleanupResult> {
  const limits = options.limits ?? getDataRetentionLimits()
  const active = (family: CopyrightRetentionFamily) =>
    options.activeFamilies === undefined || options.activeFamilies.includes(family)
  const result: CopyrightRetentionCleanupResult = {}
  if (active('copyrightFormScreeningAttempts'))
    result.copyrightFormScreeningAttempts = await sweepCopyrightOperationalRetention(
      'form_screening_attempts',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_form_screening_attempt_days'),
        recordIds: options.formScreeningAttemptIds,
        now: options.now,
      },
    )
  if (active('copyrightActionAttempts'))
    result.copyrightActionAttempts = await sweepCopyrightOperationalRetention('action_attempts', {
      ...limits,
      retentionDays: readDataRetentionField('copyright_action_attempt_days'),
      recordIds: options.actionAttemptIds,
      now: options.now,
    })
  if (active('copyrightDeliveryAttempts'))
    result.copyrightDeliveryAttempts = await sweepCopyrightOperationalRetention(
      'delivery_attempts',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_delivery_attempt_days'),
      },
    )
  if (active('copyrightGuestCapabilities'))
    result.copyrightGuestCapabilities = await sweepCopyrightOperationalRetention(
      'guest_capabilities',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_guest_capability_days'),
      },
    )
  if (active('copyrightUnlinkedEmailIntakes'))
    result.copyrightUnlinkedEmailIntakes = await sweepUnlinkedCopyrightEmailIntakes({
      childLimit: limits.batchSize,
      maxBatches: limits.maxBatches,
      retentionDays: readDataRetentionField('copyright_unlinked_email_intake_days'),
    })
  if (active('copyrightReceiptReviews'))
    result.copyrightReceiptReviews = await sweepCopyrightReceiptReviews(limits)
  if (active('copyrightCaseThreads'))
    result.copyrightCaseThreads = await sweepCopyrightCaseThreads({
      batchSize: limits.batchSize,
      maxBatches: limits.maxBatches,
      replyDays: readDataRetentionField('copyright_email_thread_reply_days'),
    })
  if (active('copyrightOrphanEmailThreadTokens'))
    result.copyrightOrphanEmailThreadTokens = await sweepCopyrightOperationalRetention(
      'orphan_email_thread_tokens',
      {
        ...limits,
        retentionDays: readDataRetentionField('copyright_unlinked_email_intake_days'),
      },
    )
  return result
}

export async function runDataRetentionCleanup(
  limits: DataRetentionLimits,
  options: DataRetentionCleanupOptions = {},
): Promise<DataRetentionCleanupResult> {
  const active = (family: DataRetentionCleanupFamily) =>
    options.families === undefined || options.families.includes(family)
  const withLimits = (overrides: { batchSize?: number; maxBatches?: number } | undefined) =>
    applyRetentionLimits(limits, overrides)
  // Topic-import attempts keep their own small batch (each row can retain a 4 MiB response), so the
  // shared batch size can only lower it.
  const topicImportLimits = {
    ...limits,
    batchSize: Math.min(limits.batchSize, getTopicImportAttemptDeletionBatchSize()),
  }
  const hackerNewsReferences = active('hackerNewsReferences')
    ? await cleanupHackerNewsReferences()
    : { deleted: 0, hasMore: false }
  const retainedPageSize = Math.min(limits.batchSize, 1_000)
  // Ephemeral broker rows reference users and provider accounts. Remove expired rows first so a
  // long-interrupted cleanup run cannot retain avoidable references ahead of parent cleanup.
  const expiredOAuthAuthorizations = active('expiredOAuthAuthorizations')
    ? await cleanupExpiredOAuthAuthorizations(withLimits(options.expiredOAuthAuthorizations))
    : { deleted: 0, hasMore: false }
  const expiredOAuthServerArtifacts = active('expiredOAuthServerArtifacts')
    ? await cleanupExpiredOAuthAuthorizationServerArtifacts(
        withLimits(options.expiredOAuthServerArtifacts),
      )
    : { deleted: 0, hasMore: false }
  const softDeletedUsers = active('softDeletedUsers')
    ? await cleanupSoftDeletedUsers(withLimits(options.softDeletedUsers))
    : { deleted: 0, hasMore: false }
  const oldReferralAttributions = active('oldReferralAttributions')
    ? await cleanupOldReferralAttributions(withLimits(options.oldReferralAttributions))
    : { deleted: 0, hasMore: false }
  const histories = active('histories')
    ? await cleanupHistories(withLimits(options.histories))
    : {
        dynamic_configuration_revisions: { scanned: 0, changed: 0, hasMore: false },
        rss_feed_setting_changes: { scanned: 0, changed: 0, hasMore: false },
        fediverse_instance_integration_changes: { scanned: 0, changed: 0, hasMore: false },
        community_agent_prompt_revisions: { scanned: 0, changed: 0, hasMore: false },
        followed_user_import_requests: { scanned: 0, changed: 0, hasMore: false },
        pending_user_import_requests: { scanned: 0, changed: 0, hasMore: false },
        referral_attribution_scrub: { scanned: 0, changed: 0, hasMore: false },
        referral_attribution_expiry: { scanned: 0, changed: 0, hasMore: false },
      }
  const oauthFriendEdges = active('oauthFriendEdges')
    ? await cleanupOAuthFriendEdgeWork(
        withLimits(options.oauthFriendEdges),
        options.oauthFriendEdges?.now,
      )
    : { deleted: 0, resolved: 0, hasMore: false }
  const orphanedOAuthAccounts = active('orphanedOAuthAccounts')
    ? await cleanupOrphanedOAuthAccounts(withLimits(options.orphanedOAuthAccounts))
    : { deleted: 0, hasMore: false }
  const securityRecords = active('securityRecords')
    ? await cleanupSecurityRecords(
        withLimits(options.securityRecords),
        options.securityRecords?.now,
      )
    : { deleted: 0, hasMore: false }
  const expiredBlueskyLinkCompletions = active('expiredBlueskyLinkCompletions')
    ? await cleanupExpiredBlueskyLinkCompletions(withLimits(options.expiredBlueskyLinkCompletions))
    : { deleted: 0, hasMore: false }
  const abandonedBlueskyLinkSessions = active('abandonedBlueskyLinkSessions')
    ? await cleanupAbandonedBlueskyLinkSessions(withLimits(options.abandonedBlueskyLinkSessions))
    : { deleted: 0, hasMore: false }
  const expiredContributionAdmissions = active('expiredContributionAdmissions')
    ? await cleanupExpiredContributionAdmissions(withLimits(options.expiredContributionAdmissions))
    : { deleted: 0, hasMore: false }
  const expiredContributionQuotaConsumptions = active('expiredContributionQuotaConsumptions')
    ? await cleanupExpiredContributionQuotaConsumptions(
        withLimits(options.expiredContributionQuotaConsumptions),
      )
    : { deleted: 0, hasMore: false }
  const expiredTopicImportAttempts = active('expiredTopicImportAttempts')
    ? await cleanupExpiredTopicImportAttempts(
        applyRetentionLimits(topicImportLimits, options.expiredTopicImportAttempts),
      )
    : { deleted: 0, hasMore: false }
  const terminalNotificationPushIntents = active('terminalNotificationPushIntents')
    ? await cleanupTerminalNotificationPushIntents(
        withLimits(options.terminalNotificationPushIntents),
      )
    : { deleted: 0, hasMore: false }
  const {
    deliveredMembershipEntitlementEffects,
    endedMembershipRenewalNotices,
    terminalGooglePlayAcknowledgments,
  } = await cleanupMembershipOperational(
    {
      deliveredMembershipEntitlementEffects: withLimits(
        options.deliveredMembershipEntitlementEffects,
      ),
      endedMembershipRenewalNotices: withLimits(options.endedMembershipRenewalNotices),
      terminalGooglePlayAcknowledgments: withLimits(options.terminalGooglePlayAcknowledgments),
    },
    options.families?.filter(
      family =>
        options.activeMembershipFamilies === undefined ||
        options.activeMembershipFamilies.includes(family),
    ) ?? options.activeMembershipFamilies,
  )
  const terminalStripeEventWork = active('terminalStripeEventWork')
    ? await cleanupTerminalStripeEventWork(withLimits(options.terminalStripeEventWork))
    : { deleted: 0, hasMore: false, cursorId: null }
  const abandonedMembershipPurchaseIntents = active('abandonedMembershipPurchaseIntents')
    ? await cleanupAbandonedMembershipPurchaseIntents(
        withLimits(options.abandonedMembershipPurchaseIntents),
      )
    : { deleted: 0, hasMore: false, cursorId: null }
  const paymentLedgers = active('paymentLedgers')
    ? await cleanupPaymentLedgers(
        withLimits(options.paymentLedgers),
        options.paymentLedgers?.recordIds,
      )
    : []
  const emailAddressLoginTokens = active('emailAddressLoginTokens')
    ? await cleanupEmailAddressLoginTokens(withLimits(options.emailAddressLoginTokens))
    : { deleted: 0, hasMore: false, continuation: null }
  const phoneNumberLoginTokens = active('phoneNumberLoginTokens')
    ? await cleanupPhoneNumberLoginTokens(withLimits(options.phoneNumberLoginTokens))
    : { deleted: 0, hasMore: false, continuation: null }
  const expiredUserSessions = active('expiredUserSessions')
    ? await cleanupExpiredUserSessions(withLimits(options.expiredUserSessions))
    : { deleted: 0, hasMore: false, continuation: null }
  const oldPendingNotificationPushIntents = active('oldPendingNotificationPushIntents')
    ? await cleanupOldPendingNotificationPushIntents(
        withLimits(options.oldPendingNotificationPushIntents),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  // Receipts for surviving intents retain their subscription generation. Each page checks them
  // again under the subscription row lock, even after the push-intent cleanup above has run.
  const webPushSubscriptionTombstones = active('webPushSubscriptionTombstones')
    ? await cleanupWebPushSubscriptionTombstones(withLimits(options.webPushSubscriptionTombstones))
    : { deleted: 0, hasMore: false, continuation: null }
  // These four cleanups touch different tables and share no data, so they run together.
  const [
    oldModerationQueueClaims,
    oldModerationMediaReveals,
    postModerationLedger,
    agentModerations,
  ] = await Promise.all([
    active('oldModerationQueueClaims')
      ? cleanupOldModerationQueueClaims(withLimits(options.oldModerationQueueClaims))
      : { deleted: 0, hasMore: false, cursorId: null },
    active('oldModerationMediaReveals')
      ? cleanupOldModerationMediaReveals(withLimits(options.oldModerationMediaReveals))
      : { deleted: 0, hasMore: false, cursorId: null },
    active('postModerationLedger')
      ? cleanupPostModerationLedger({
          ...withLimits(options.postModerationLedger),
          retentionDays: getPostModerationRetentionDays(),
        })
      : { deletedVersions: 0, clearedPassEvidence: 0, hasMore: false, remainingKinds: [] },
    !active('agentModerations') || options.includeAgentModerations === false
      ? { scanned: 0, deleted: 0, hasMore: false, continuation: null }
      : cleanupObsoleteAgentModerations(withLimits(options.agentModerations)),
  ])
  // Embedding-cache and import-batch cleanups touch separate tables and feed nothing else.
  const [
    textEmbeddingCache,
    terminalEmbeddingBatches,
    completedAdminImportBatches,
    completedRssImportBatches,
  ] = await Promise.all([
    active('textEmbeddingCache')
      ? cleanupTextEmbeddingCache(withLimits(options.textEmbeddingCache))
      : { deleted: 0, hasMore: false, continuation: null },
    active('terminalEmbeddingBatches')
      ? cleanupTerminalEmbeddingBatches(withLimits(options.terminalEmbeddingBatches))
      : { deleted: 0, hasMore: false, continuation: null },
    active('completedAdminImportBatches')
      ? cleanupCompletedImportBatches('admin', withLimits(options.completedAdminImportBatches))
      : { deleted: 0, hasMore: false, continuation: null },
    active('completedRssImportBatches')
      ? cleanupCompletedImportBatches('rss', withLimits(options.completedRssImportBatches))
      : { deleted: 0, hasMore: false, continuation: null },
  ])
  // Request-attempt, media-change, classifier and SES-bounce cleanups read and delete separate tables.
  const [
    expiredUserDataRequestAttempts,
    oldMediaDeliveryChanges,
    classifierRecords,
    sesBounceEvents,
  ] = await Promise.all([
    active('expiredUserDataRequestAttempts')
      ? cleanupExpiredUserDataRequestAttempts(withLimits(options.expiredUserDataRequestAttempts))
      : { deleted: 0, hasMore: false, continuation: null },
    active('oldMediaDeliveryChanges')
      ? cleanupOldMediaDeliveryChanges(withLimits(options.oldMediaDeliveryChanges))
      : { deleted: 0, hasMore: false, continuation: null },
    active('classifierRecords')
      ? cleanupClassifierRecords({
          ...withLimits(options.classifierRecords),
          retentionDays: getClassifierRetentionDays(),
        })
      : {
          runCandidates: { scanned: 0, deleted: 0, hasMore: false },
          agentTopics: { scanned: 0, deleted: 0, hasMore: false },
          localOutcomes: { scanned: 0, deleted: 0, hasMore: false },
          runs: { scanned: 0, deleted: 0, hasMore: false },
          topicResults: { scanned: 0, deleted: 0, hasMore: false },
          storyResults: { scanned: 0, deleted: 0, hasMore: false },
          communityPromptResults: { scanned: 0, deleted: 0, hasMore: false },
          decisionCandidates: { scanned: 0, deleted: 0, hasMore: false },
          calls: { scanned: 0, deleted: 0, hasMore: false },
          batches: { scanned: 0, deleted: 0, hasMore: false },
          requests: { scanned: 0, deleted: 0, hasMore: false },
          deletedSubjectIdentities: { scanned: 0, deleted: 0, hasMore: false },
          versionedIdentities: { scanned: 0, deleted: 0, hasMore: false },
          identities: { scanned: 0, deleted: 0, hasMore: false },
        },
    active('sesBounceEvents')
      ? cleanupSesBounceEvents(withLimits(options.sesBounceEvents))
      : { deleted: 0, hasMore: false, continuation: null },
  ])
  // Tombstone deletion checks for surviving intents, so interrupted intent cleanup cannot
  // discard delivery state; running it first only makes already-terminal rows eligible sooner.
  const [systemPrunedNotifications, userDeletedNotifications, moderationEmailSends] =
    await Promise.all([
      active('systemPrunedNotifications')
        ? cleanupSystemPrunedNotifications(withLimits(options.systemPrunedNotifications))
        : { deleted: 0, hasMore: false, continuation: null },
      active('userDeletedNotifications')
        ? cleanupUserDeletedNotifications(withLimits(options.userDeletedNotifications))
        : { deleted: 0, hasMore: false, continuation: null },
      active('moderationEmailSends')
        ? cleanupModerationEmailSends(withLimits(options.moderationEmailSends))
        : { deleted: 0, hasMore: false, continuation: null },
    ])
  const federationRetention = active('federationRetention')
    ? await cleanupFederationRetention({
        ...limits,
        ...options.federationRetention,
      })
    : {
        followerDistributions: { deleted: 0, hasMore: false, continuationPosition: null },
        inboxReplay: { deleted: 0, hasMore: false, continuationPosition: null },
        terminalFollowIdentities: { deleted: 0, hasMore: false },
        terminalLikeIdentities: { deleted: 0, hasMore: false },
      }
  const supersededVoteBallots = active('supersededVoteBallots')
    ? await cleanupSupersededVoteBallots(
        options.voteRetention?.batchSize ?? limits.batchSize,
        options.voteRetention?.now ?? new Date(),
        options.voteBallotIdsByTable,
      )
    : []
  const orphanedUserAgentStrings = active('orphanedUserAgentStrings')
    ? await cleanupOrphanedUserAgentStrings(
        options.voteRetention?.batchSize ?? limits.batchSize,
        options.userAgentStringIds,
        options.voteRetention?.now,
      )
    : { scanned: 0, deleted: 0, hasMore: false }
  const voteIntegrityDetails = active('voteIntegrityDetails')
    ? await cleanupVoteIntegrityDetails(
        options.voteRetention?.batchSize ?? limits.batchSize,
        options.voteRetention?.now ?? new Date(),
        options.voteIntegrityFlagIds,
      )
    : { scanned: 0, redacted: 0, hasMore: false }
  const copyright = await runCopyrightOperationalRetentionCleanup({
    limits,
    formScreeningAttemptIds: options.copyrightFormScreeningAttemptIds,
    now: options.copyrightNow,
    activeFamilies:
      options.activeCopyrightFamilies?.filter(active) ??
      options.families?.filter((family): family is CopyrightRetentionFamily =>
        family.startsWith('copyright'),
      ),
  })
  const undoneActivityPubLikes = active('undoneActivityPubLikes')
    ? await cleanupOperationalTombstones(
        'activitypub_post_likes',
        withLimits(options.undoneActivityPubLikes),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const staleRemoteActors = active('staleRemoteActors')
    ? await cleanupOperationalTombstones('remote_actors', withLimits(options.staleRemoteActors))
    : { deleted: 0, hasMore: false, continuation: null }
  const feedHostnameBlocks = active('feedHostnameBlocks')
    ? await cleanupOperationalTombstones(
        'feed_hostname_blocks',
        withLimits(options.feedHostnameBlocks),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const otherHostnameBlocks = active('otherHostnameBlocks')
    ? await cleanupOperationalTombstones(
        'other_hostname_blocks',
        withLimits(options.otherHostnameBlocks),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const deletedConversations = active('deletedConversations')
    ? await cleanupOperationalTombstones(
        'deleted_conversations',
        withLimits(options.deletedConversations),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const appAttestationKeys = active('appAttestationKeys')
    ? await cleanupOperationalTombstones(
        'app_attestation_keys',
        withLimits(options.appAttestationKeys),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  const aiUsageRecords =
    !active('aiUsageRecords') || options.aiUsageRecords?.active === false
      ? { deleted: 0, hasMore: false, cursorId: null }
      : await cleanupAiUsageRecords({
          ...withLimits(options.aiUsageRecords),
          retentionDays: getAiUsageRawRetentionDays(),
        })
  const retainedRelationIdentities = active('retainedRelationIdentities')
    ? await cleanupRetainedRelationIdentities(
        retainedPageSize,
        options.retainedRelationIdentityKeys,
      )
    : []
  const retainedMediaBindings = active('retainedMediaBindings')
    ? await cleanupRetainedMediaBindings(retainedPageSize, options.retainedMediaBindingIds)
    : { scanned: 0, deleted: 0, hasMore: false }
  // Expired legal proof no longer keeps a retained user identity alive.
  const legalRecords = active('legalRecords')
    ? await cleanupLegalRecords(limits, options.legalRecords?.now, options.legalRecords?.recordIds)
    : []
  const retainedIdentityRoots = active('retainedIdentityRoots')
    ? await cleanupRetainedIdentityRoots(retainedPageSize, options.retainedIdentityRootIds)
    : []
  if (active('analyticsLocalFiles')) await cleanupAnalyticsLocalFiles()

  return {
    hackerNewsReferences,
    ...copyright,
    retainedRelationIdentities,
    retainedMediaBindings,
    legalRecords,
    retainedIdentityRoots,
    softDeletedUsers,
    oldReferralAttributions,
    histories,
    orphanedOAuthAccounts,
    oauthFriendEdges,
    securityRecords,
    expiredOAuthAuthorizations,
    expiredOAuthServerArtifacts,
    expiredBlueskyLinkCompletions,
    abandonedBlueskyLinkSessions,
    expiredContributionAdmissions,
    expiredContributionQuotaConsumptions,
    expiredTopicImportAttempts,
    terminalNotificationPushIntents,
    deliveredMembershipEntitlementEffects,
    endedMembershipRenewalNotices,
    terminalGooglePlayAcknowledgments,
    terminalStripeEventWork,
    abandonedMembershipPurchaseIntents,
    paymentLedgers,
    emailAddressLoginTokens,
    phoneNumberLoginTokens,
    expiredUserSessions,
    webPushSubscriptionTombstones,
    oldPendingNotificationPushIntents,
    oldModerationQueueClaims,
    oldModerationMediaReveals,
    postModerationLedger,
    agentModerations,
    textEmbeddingCache,
    terminalEmbeddingBatches,
    completedAdminImportBatches,
    completedRssImportBatches,
    expiredUserDataRequestAttempts,
    oldMediaDeliveryChanges,
    classifierRecords,
    sesBounceEvents,
    systemPrunedNotifications,
    userDeletedNotifications,
    moderationEmailSends,
    federationRetention,
    supersededVoteBallots,
    orphanedUserAgentStrings,
    voteIntegrityDetails,
    undoneActivityPubLikes,
    staleRemoteActors,
    feedHostnameBlocks,
    otherHostnameBlocks,
    deletedConversations,
    appAttestationKeys,
    aiUsageRecords,
  }
}

async function cleanupExpiredContributionAdmissions(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(options, async batchSize =>
    pruneExpiredContributionAdmissions(options.now, batchSize, options.lowerBoundDate),
  )
}

async function cleanupExpiredContributionQuotaConsumptions(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(options, async batchSize =>
    pruneExpiredContributionAdmissionConsumptions(options.now, batchSize, options.lowerBoundDate),
  )
}

async function cleanupExpiredTopicImportAttempts(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(
    {
      batchSize: options.batchSize ?? getTopicImportAttemptDeletionBatchSize(),
      maxBatches: options.maxBatches,
    },
    async batchSize =>
      pruneExpiredTopicImportAttempts(options.now, batchSize, options.lowerBoundDate),
  )
}

async function cleanupSoftDeletedUsers(
  options: CleanupOptions & { userIds?: readonly string[] },
): Promise<UserPurgeResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- a committed publication page may progress without purging its user.
    const result = await cleanupSoftDeletedUserBatch(
      cutoffDate,
      batchSize,
      options.lowerBoundDate,
      options.userPurge,
      options.userIds,
    )
    deleted += result.deleted
    hasMore = result.hasMore
    if (result.userPurge) return { deleted, hasMore, userPurge: result.userPurge }
    if (options.userPurge) return { deleted, hasMore }
    if (!hasMore) break
  }
  return { deleted, hasMore }
}

async function cleanupOldReferralAttributions(options: CleanupOptions): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 30)
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  return runBoundedBatches(options, async batchSize =>
    deleteOldReferralAttributionBatch(
      getMinUUIDv7ForDate(cutoffDate),
      batchSize,
      options.lowerBoundDate === undefined
        ? undefined
        : getMinUUIDv7ForDate(options.lowerBoundDate),
    ),
  )
}

async function cleanupOrphanedOAuthAccounts(options: CleanupOptions): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const now = options.now ?? new Date()
  const cutoffDate = getRetentionCutoffDate(retentionDays, now)
  const configs = Object.values(providerTableConfigs)
  // Daily rotation lets a capped run reach every provider even when an earlier one stays backlogged.
  const utcDay = Math.floor(now.getTime() / (24 * 60 * 60 * 1_000))
  const start = ((utcDay % configs.length) + configs.length) % configs.length
  const providerConfigs = [...configs.slice(start), ...configs.slice(0, start)]
  let batchesRun = 0
  let deleted = 0
  let hasMore = false

  for (const config of providerConfigs) {
    if (batchesRun >= maxBatches) {
      hasMore = true
      break
    }

    let providerHasMore = false
    while (batchesRun < maxBatches) {
      // oxlint-disable-next-line no-await-in-loop -- each provider batch commit determines its next page and keeps cross-table write pressure bounded
      const batchDeleted = await deleteOrphanedOAuthAccountBatch(
        config.table,
        config.providerUserIdColumn,
        cutoffDate,
        batchSize,
        options.lowerBoundDate,
      )
      batchesRun += 1
      deleted += batchDeleted
      providerHasMore = batchDeleted === batchSize
      if (!providerHasMore) break
    }

    hasMore ||= providerHasMore
    if (providerHasMore && batchesRun >= maxBatches) break
  }

  return { deleted, hasMore }
}
