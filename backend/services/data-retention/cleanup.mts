import type { UserPurgeCursor, UserPurgeResult } from './user-purge-types.mts'
/* oxlint-disable max-lines -- central retention orchestration keeps all bounded cleanup results together. */
// Data retention necessarily accesses tables owned by other services. This cross-service SQL is intentional:
// the retention job must hard-delete orphaned OAuth rows that have no owning service
// to delegate to (user_id is already NULL). Exposing hardDelete helpers from each
// OAuth provider would add significant boilerplate for a single use case.
import { providerTableConfigs } from '@services/oauth/providers'
import {
  sweepCopyrightOperationalRetention,
  sweepUnlinkedCopyrightEmailIntakes,
  sweepCopyrightCaseThreads,
} from '@services/copyright-notices'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { cleanupLocalAnalyticsRetention } from '@data-stores/analytics/retention'
import { flush as flushLocalAnalytics } from '@data-stores/analytics/backend-local'
import {
  DEFAULT_BATCH_SIZE,
  cleanupSoftDeletedUserBatch,
  deleteOldReferralAttributionBatch,
  deleteOrphanedOAuthAccountBatch,
} from './cleanup-batches.mts'
import {
  getClassifierRetentionDays,
  getDataRetentionLimits,
  readDataRetentionField,
  getTopicImportAttemptDeletionBatchSize,
  type DataRetentionLimits,
} from './config.mts'
import {
  cleanupClassifierRecords,
  type ClassifierCleanupResult,
} from './cleanup-classifier-records.mts'
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

export { cleanupAbandonedBlueskyLinkSessions, cleanupExpiredBlueskyLinkCompletions }
export { cleanupExpiredOAuthAuthorizations }
export { cleanupExpiredOAuthAuthorizationServerArtifacts }
export { cleanupTerminalNotificationPushIntents }
export { cleanupOldPendingNotificationPushIntents }
export { cleanupOldModerationQueueClaims, cleanupOldModerationMediaReveals }

export async function cleanupAnalyticsLocalFiles(): Promise<void> {
  if (process.env.ANALYTICS_BACKEND !== 'local') return
  await flushLocalAnalytics()
  await cleanupLocalAnalyticsRetention()
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

// Each cleanup in a run takes its batch size and per-run cap from the required run limits; a
// per-cleanup option can override either one (tests use this to scope windows and shrink limits).
type DataRetentionCleanupOptions = {
  /** Continuations name the membership families that exceeded the previous run's cap. */
  activeMembershipFamilies?: readonly string[]
  voteBallotIdsByTable?: Readonly<Record<string, readonly string[]>>
  userAgentStringIds?: readonly string[]
  voteIntegrityFlagIds?: readonly string[]
  /** Non-copyright continuations omit the independent copyright retention chain. */
  activeCopyrightFamilies?: readonly CopyrightRetentionFamily[]
  retainedIdentityRootIds?: Partial<Record<RetainedIdentityFamily, readonly string[]>>
  retainedRelationIdentityKeys?: Readonly<Record<string, readonly RetainedRelationIdentityKey[]>>
  retainedMediaBindingIds?: readonly string[]
  softDeletedUsers?: OptionalRetentionLimits<CleanupOptions>
  oldReferralAttributions?: OptionalRetentionLimits<CleanupOptions>
  histories?: OptionalRetentionLimits<HistoryCleanupOptions>
  orphanedOAuthAccounts?: OptionalRetentionLimits<CleanupOptions>
  oauthFriendEdges?: Partial<DataRetentionLimits> & { now?: Date }
  securityRecords?: Partial<DataRetentionLimits> & { now?: Date }
  expiredOAuthAuthorizations?: OptionalRetentionLimits<ExpiryCleanupOptions> & {
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
  textEmbeddingCache?: OptionalRetentionLimits<CleanupOptions>
  terminalEmbeddingBatches?: OptionalRetentionLimits<CleanupOptions>
  completedAdminImportBatches?: OptionalRetentionLimits<CleanupOptions>
  completedRssImportBatches?: OptionalRetentionLimits<CleanupOptions>
  expiredUserDataRequestAttempts?: OptionalRetentionLimits<CleanupOptions>
  oldMediaDeliveryChanges?: OptionalRetentionLimits<CleanupOptions>
  classifierRecords?: OptionalRetentionLimits<Omit<CleanupOptions, 'retentionDays'>> & {
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
}

type DataRetentionCleanupResult = {
  copyrightFormScreeningAttempts?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightActionAttempts?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightDeliveryAttempts?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightGuestCapabilities?: { scanned: number; deleted: number; hasMore: boolean }
  copyrightUnlinkedEmailIntakes?: { scanned: number; erased: number; hasMore: boolean }
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
  emailAddressLoginTokens: AuthSessionCleanupResult
  phoneNumberLoginTokens: AuthSessionCleanupResult
  expiredUserSessions: AuthSessionCleanupResult
  webPushSubscriptionTombstones: AuthSessionCleanupResult
  oldPendingNotificationPushIntents: PendingNotificationPushIntentCleanupResult
  oldModerationQueueClaims: CleanupResult & { cursorId: string | null }
  oldModerationMediaReveals: CleanupResult & { cursorId: string | null }
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
}

export type VoteRetentionSelection = {
  voteTables: readonly string[]
  userAgentStrings: boolean
  voteIntegrityDetails: boolean
}

type VoteRetentionPage = Pick<
  DataRetentionCleanupResult,
  'supersededVoteBallots' | 'orphanedUserAgentStrings' | 'voteIntegrityDetails'
>

/** Continue only families that reported another page in the previous job. */
export async function runVoteRetentionCleanupPage(
  limits: DataRetentionLimits,
  selection: VoteRetentionSelection,
): Promise<VoteRetentionPage> {
  const now = new Date()
  const supersededVoteBallots = await cleanupSupersededVoteBallots(
    limits.batchSize,
    now,
    undefined,
    selection.voteTables,
  )
  const orphanedUserAgentStrings = selection.userAgentStrings
    ? await cleanupOrphanedUserAgentStrings(limits.batchSize)
    : { scanned: 0, deleted: 0, hasMore: false }
  const voteIntegrityDetails = selection.voteIntegrityDetails
    ? await cleanupVoteIntegrityDetails(limits.batchSize, now)
    : { scanned: 0, redacted: 0, hasMore: false }
  return { supersededVoteBallots, orphanedUserAgentStrings, voteIntegrityDetails }
}

export type CopyrightRetentionFamily =
  | 'copyrightFormScreeningAttempts'
  | 'copyrightActionAttempts'
  | 'copyrightDeliveryAttempts'
  | 'copyrightGuestCapabilities'
  | 'copyrightUnlinkedEmailIntakes'
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
      },
    )
  if (active('copyrightActionAttempts'))
    result.copyrightActionAttempts = await sweepCopyrightOperationalRetention('action_attempts', {
      ...limits,
      retentionDays: readDataRetentionField('copyright_action_attempt_days'),
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
  const withLimits = <T extends { batchSize?: number; maxBatches?: number }>(
    overrides: T | undefined,
  ) => applyRetentionLimits(limits, overrides)
  // Topic-import attempts keep their own small batch (each row can retain a 4 MiB response), so the
  // shared batch size can only lower it.
  const topicImportLimits = {
    ...limits,
    batchSize: Math.min(limits.batchSize, getTopicImportAttemptDeletionBatchSize()),
  }
  const retainedPageSize = Math.min(limits.batchSize, 1_000)
  // Ephemeral broker rows reference users and provider accounts. Remove expired rows first so a
  // long-interrupted cleanup run cannot retain avoidable references ahead of parent cleanup.
  const expiredOAuthAuthorizations = await cleanupExpiredOAuthAuthorizations(
    withLimits(options.expiredOAuthAuthorizations),
  )
  const expiredOAuthServerArtifacts = await cleanupExpiredOAuthAuthorizationServerArtifacts(
    withLimits(options.expiredOAuthServerArtifacts),
  )
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const softDeletedUsers = await cleanupSoftDeletedUsers(withLimits(options.softDeletedUsers))
  const oldReferralAttributions = await cleanupOldReferralAttributions(
    withLimits(options.oldReferralAttributions),
  )
  const histories = await cleanupHistories(withLimits(options.histories))
  const oauthFriendEdges = await cleanupOAuthFriendEdgeWork(
    withLimits(options.oauthFriendEdges),
    options.oauthFriendEdges?.now,
  )
  const orphanedOAuthAccounts = await cleanupOrphanedOAuthAccounts(
    withLimits(options.orphanedOAuthAccounts),
  )
  const securityRecords = await cleanupSecurityRecords(
    withLimits(options.securityRecords),
    options.securityRecords?.now,
  )
  const expiredBlueskyLinkCompletions = await cleanupExpiredBlueskyLinkCompletions(
    withLimits(options.expiredBlueskyLinkCompletions),
  )
  const abandonedBlueskyLinkSessions = await cleanupAbandonedBlueskyLinkSessions(
    withLimits(options.abandonedBlueskyLinkSessions),
  )
  const expiredContributionAdmissions = await cleanupExpiredContributionAdmissions(
    withLimits(options.expiredContributionAdmissions),
  )
  const expiredContributionQuotaConsumptions = await cleanupExpiredContributionQuotaConsumptions(
    withLimits(options.expiredContributionQuotaConsumptions),
  )
  const expiredTopicImportAttempts = await cleanupExpiredTopicImportAttempts(
    applyRetentionLimits(topicImportLimits, options.expiredTopicImportAttempts),
  )
  const terminalNotificationPushIntents = await cleanupTerminalNotificationPushIntents(
    withLimits(options.terminalNotificationPushIntents),
  )
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
    options.activeMembershipFamilies,
  )
  const terminalStripeEventWork = await cleanupTerminalStripeEventWork(
    withLimits(options.terminalStripeEventWork),
  )
  const abandonedMembershipPurchaseIntents = await cleanupAbandonedMembershipPurchaseIntents(
    withLimits(options.abandonedMembershipPurchaseIntents),
  )
  const emailAddressLoginTokens = await cleanupEmailAddressLoginTokens(
    withLimits(options.emailAddressLoginTokens),
  )
  const phoneNumberLoginTokens = await cleanupPhoneNumberLoginTokens(
    withLimits(options.phoneNumberLoginTokens),
  )
  const expiredUserSessions = await cleanupExpiredUserSessions(
    withLimits(options.expiredUserSessions),
  )
  const oldPendingNotificationPushIntents = await cleanupOldPendingNotificationPushIntents(
    withLimits(options.oldPendingNotificationPushIntents),
  )
  // Receipts for surviving intents retain their subscription generation. Each page checks them
  // again under the subscription row lock, even after the push-intent cleanup above has run.
  // ast-grep-ignore: no-three-sequential-awaits -- tombstone deletion follows push-intent cleanup before later retention phases
  const webPushSubscriptionTombstones = await cleanupWebPushSubscriptionTombstones(
    withLimits(options.webPushSubscriptionTombstones),
  )
  const oldModerationQueueClaims = await cleanupOldModerationQueueClaims(
    withLimits(options.oldModerationQueueClaims),
  )
  const oldModerationMediaReveals = await cleanupOldModerationMediaReveals(
    withLimits(options.oldModerationMediaReveals),
  )
  const textEmbeddingCache = await cleanupTextEmbeddingCache(withLimits(options.textEmbeddingCache))
  const terminalEmbeddingBatches = await cleanupTerminalEmbeddingBatches(
    withLimits(options.terminalEmbeddingBatches),
  )
  const completedAdminImportBatches = await cleanupCompletedImportBatches(
    'admin',
    withLimits(options.completedAdminImportBatches),
  )
  const completedRssImportBatches = await cleanupCompletedImportBatches(
    'rss',
    withLimits(options.completedRssImportBatches),
  )
  const expiredUserDataRequestAttempts = await cleanupExpiredUserDataRequestAttempts(
    withLimits(options.expiredUserDataRequestAttempts),
  )
  const oldMediaDeliveryChanges = await cleanupOldMediaDeliveryChanges(
    withLimits(options.oldMediaDeliveryChanges),
  )
  const classifierRecords = await cleanupClassifierRecords({
    ...withLimits(options.classifierRecords),
    retentionDays: getClassifierRetentionDays(),
  })
  const sesBounceEvents = await cleanupSesBounceEvents(withLimits(options.sesBounceEvents))
  // Tombstone deletion checks for surviving intents, so interrupted intent cleanup cannot
  // discard delivery state; running it first only makes already-terminal rows eligible sooner.
  const [systemPrunedNotifications, userDeletedNotifications, moderationEmailSends] =
    await Promise.all([
      cleanupSystemPrunedNotifications(withLimits(options.systemPrunedNotifications)),
      cleanupUserDeletedNotifications(withLimits(options.userDeletedNotifications)),
      cleanupModerationEmailSends(withLimits(options.moderationEmailSends)),
    ])
  // ast-grep-ignore: no-three-sequential-awaits -- retention families run serially to cap concurrent database work
  const federationRetention = await cleanupFederationRetention({
    ...limits,
    ...options.federationRetention,
  })
  const supersededVoteBallots = await cleanupSupersededVoteBallots(
    limits.batchSize,
    new Date(),
    options.voteBallotIdsByTable,
  )
  const orphanedUserAgentStrings = await cleanupOrphanedUserAgentStrings(
    limits.batchSize,
    options.userAgentStringIds,
  )
  const voteIntegrityDetails = await cleanupVoteIntegrityDetails(
    limits.batchSize,
    new Date(),
    options.voteIntegrityFlagIds,
  )
  // ast-grep-ignore: no-three-sequential-awaits -- retained relation and media bindings must be pruned before their identity roots
  const copyright = await runCopyrightOperationalRetentionCleanup({
    limits,
    activeFamilies: options.activeCopyrightFamilies,
  })
  const undoneActivityPubLikes = await cleanupOperationalTombstones(
    'activitypub_post_likes',
    withLimits(options.undoneActivityPubLikes),
  )
  const staleRemoteActors = await cleanupOperationalTombstones(
    'remote_actors',
    withLimits(options.staleRemoteActors),
  )
  const feedHostnameBlocks = await cleanupOperationalTombstones(
    'feed_hostname_blocks',
    withLimits(options.feedHostnameBlocks),
  )
  const otherHostnameBlocks = await cleanupOperationalTombstones(
    'other_hostname_blocks',
    withLimits(options.otherHostnameBlocks),
  )
  const deletedConversations = await cleanupOperationalTombstones(
    'deleted_conversations',
    withLimits(options.deletedConversations),
  )
  const appAttestationKeys = await cleanupOperationalTombstones(
    'app_attestation_keys',
    withLimits(options.appAttestationKeys),
  )
  const retainedRelationIdentities = await cleanupRetainedRelationIdentities(
    retainedPageSize,
    options.retainedRelationIdentityKeys,
  )
  const retainedMediaBindings = await cleanupRetainedMediaBindings(
    retainedPageSize,
    options.retainedMediaBindingIds,
  )
  // ast-grep-ignore: no-three-sequential-awaits -- retained relation and media bindings must be pruned before their identity roots
  const retainedIdentityRoots = await cleanupRetainedIdentityRoots(
    retainedPageSize,
    options.retainedIdentityRootIds,
  )
  await cleanupAnalyticsLocalFiles()

  return {
    ...copyright,
    retainedRelationIdentities,
    retainedMediaBindings,
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
    emailAddressLoginTokens,
    phoneNumberLoginTokens,
    expiredUserSessions,
    webPushSubscriptionTombstones,
    oldPendingNotificationPushIntents,
    oldModerationQueueClaims,
    oldModerationMediaReveals,
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

export async function cleanupSoftDeletedUsers(options: CleanupOptions): Promise<UserPurgeResult> {
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
    )
    deleted += result.deleted
    hasMore = result.hasMore
    if (result.userPurge) return { deleted, hasMore, userPurge: result.userPurge }
    if (options.userPurge) return { deleted, hasMore }
    if (!hasMore) break
  }
  return { deleted, hasMore }
}

export async function cleanupOldReferralAttributions(
  options: CleanupOptions,
): Promise<CleanupResult> {
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

export async function cleanupOrphanedOAuthAccounts(
  options: CleanupOptions,
): Promise<CleanupResult> {
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
