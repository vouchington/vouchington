/* oxlint-disable max-lines -- central retention orchestration keeps all bounded cleanup results together. */
// Data retention necessarily accesses tables owned by other services. This cross-service SQL is intentional:
// the retention job must hard-delete orphaned OAuth rows that have no owning service
// to delegate to (user_id is already NULL). Exposing hardDelete helpers from each
// OAuth provider would add significant boilerplate for a single use case.
import { providerTableConfigs } from '@services/oauth/providers'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { cleanupLocalAnalyticsRetention } from '@data-stores/analytics/retention'
import { flush as flushLocalAnalytics } from '@data-stores/analytics/backend-local'
import {
  DEFAULT_BATCH_SIZE,
  cleanupSoftDeletedUserBatch,
  deleteOldReferralAttributionBatch,
  deleteOrphanedOAuthAccountBatch,
} from './cleanup-batches.mts'
import { getTopicImportAttemptDeletionBatchSize, type DataRetentionLimits } from './config.mts'
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
  applyRetentionLimits,
  getRetentionCutoffDate,
  normalizeRetentionDays,
  type OptionalRetentionLimits,
} from './cleanup-options.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'
import { pruneExpiredContributionAdmissions } from '@services/contribution-gating/admission'
import { pruneExpiredContributionAdmissionConsumptions } from '@services/contribution-gating/admission-quota'
import { pruneExpiredTopicImportAttempts } from '@services/user-import-export/topic-import-attempts'
import {
  cleanupRetainedIdentityRoots,
  type RetainedIdentityFamily,
  type RetainedIdentityCleanupPage,
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

export { cleanupAbandonedBlueskyLinkSessions, cleanupExpiredBlueskyLinkCompletions }
export { cleanupExpiredOAuthAuthorizations }
export { cleanupExpiredOAuthAuthorizationServerArtifacts }
export { cleanupTerminalNotificationPushIntents }
export { cleanupTerminalStripeEventWork, cleanupAbandonedMembershipPurchaseIntents }
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
}

type CleanupResult = {
  deleted: number
  hasMore: boolean
}

type ExpiryCleanupOptions = Pick<
  CleanupOptions,
  'batchSize' | 'maxBatches' | 'lowerBoundDate' | 'now'
>

// Each cleanup in a run takes its batch size and per-run cap from the required run limits; a
// per-cleanup option can override either one (tests use this to scope windows and shrink limits).
type DataRetentionCleanupOptions = {
  voteBallotIdsByTable?: Readonly<Record<string, readonly string[]>>
  userAgentStringIds?: readonly string[]
  voteIntegrityFlagIds?: readonly string[]
  retainedIdentityRootIds?: Partial<Record<RetainedIdentityFamily, readonly string[]>>
  retainedRelationIdentityKeys?: Readonly<Record<string, readonly RetainedRelationIdentityKey[]>>
  retainedMediaBindingIds?: readonly string[]
  softDeletedUsers?: OptionalRetentionLimits<CleanupOptions>
  oldReferralAttributions?: OptionalRetentionLimits<CleanupOptions>
  orphanedOAuthAccounts?: OptionalRetentionLimits<CleanupOptions>
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
}

type DataRetentionCleanupResult = {
  retainedRelationIdentities: RetainedRelationIdentityCleanupPage[]
  retainedMediaBindings: RetainedMediaBindingCleanupPage
  retainedIdentityRoots: RetainedIdentityCleanupPage[]
  softDeletedUsers: CleanupResult
  oldReferralAttributions: CleanupResult
  orphanedOAuthAccounts: CleanupResult
  expiredOAuthAuthorizations: CleanupResult
  expiredOAuthServerArtifacts: CleanupResult
  expiredBlueskyLinkCompletions: CleanupResult
  abandonedBlueskyLinkSessions: CleanupResult
  expiredContributionAdmissions: CleanupResult
  expiredContributionQuotaConsumptions: CleanupResult
  expiredTopicImportAttempts: CleanupResult
  terminalNotificationPushIntents: CleanupResult
  terminalStripeEventWork: PaymentOperationCleanupResult
  abandonedMembershipPurchaseIntents: PaymentOperationCleanupResult
  emailAddressLoginTokens: AuthSessionCleanupResult
  phoneNumberLoginTokens: AuthSessionCleanupResult
  expiredUserSessions: AuthSessionCleanupResult
  webPushSubscriptionTombstones: AuthSessionCleanupResult
  oldPendingNotificationPushIntents: PendingNotificationPushIntentCleanupResult
  oldModerationQueueClaims: CleanupResult & { cursorId: string | null }
  oldModerationMediaReveals: CleanupResult & { cursorId: string | null }
  supersededVoteBallots: VoteBallotCleanupPage[]
  orphanedUserAgentStrings: UserAgentStringCleanupPage
  voteIntegrityDetails: VoteIntegrityDetailCleanupPage
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
  const orphanedOAuthAccounts = await cleanupOrphanedOAuthAccounts(
    withLimits(options.orphanedOAuthAccounts),
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
  const retainedRelationIdentities = await cleanupRetainedRelationIdentities(
    retainedPageSize,
    options.retainedRelationIdentityKeys,
  )
  const retainedMediaBindings = await cleanupRetainedMediaBindings(
    retainedPageSize,
    options.retainedMediaBindingIds,
  )
  const retainedIdentityRoots = await cleanupRetainedIdentityRoots(
    retainedPageSize,
    options.retainedIdentityRootIds,
  )
  await cleanupAnalyticsLocalFiles()

  return {
    retainedRelationIdentities,
    retainedMediaBindings,
    retainedIdentityRoots,
    softDeletedUsers,
    oldReferralAttributions,
    orphanedOAuthAccounts,
    expiredOAuthAuthorizations,
    expiredOAuthServerArtifacts,
    expiredBlueskyLinkCompletions,
    abandonedBlueskyLinkSessions,
    expiredContributionAdmissions,
    expiredContributionQuotaConsumptions,
    expiredTopicImportAttempts,
    terminalNotificationPushIntents,
    terminalStripeEventWork,
    abandonedMembershipPurchaseIntents,
    emailAddressLoginTokens,
    phoneNumberLoginTokens,
    expiredUserSessions,
    webPushSubscriptionTombstones,
    oldPendingNotificationPushIntents,
    oldModerationQueueClaims,
    oldModerationMediaReveals,
    supersededVoteBallots,
    orphanedUserAgentStrings,
    voteIntegrityDetails,
  }
}

export async function cleanupExpiredContributionAdmissions(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(options, async batchSize =>
    pruneExpiredContributionAdmissions(options.now, batchSize, options.lowerBoundDate),
  )
}

export async function cleanupExpiredContributionQuotaConsumptions(
  options: ExpiryCleanupOptions,
): Promise<CleanupResult> {
  return runBoundedBatches(options, async batchSize =>
    pruneExpiredContributionAdmissionConsumptions(options.now, batchSize, options.lowerBoundDate),
  )
}

export async function cleanupExpiredTopicImportAttempts(
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

export async function cleanupSoftDeletedUsers(options: CleanupOptions): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // oxlint-disable-next-line no-await-in-loop -- a committed publication page may progress without purging its user.
    const result = await cleanupSoftDeletedUserBatch(cutoffDate, batchSize, options.lowerBoundDate)
    deleted += result.deleted
    hasMore = result.hasMore
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
