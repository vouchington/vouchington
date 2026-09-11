/* oxlint-disable max-lines -- central retention orchestration keeps all bounded cleanup results together. */
// Data retention necessarily accesses tables owned by other services. This cross-service SQL is intentional:
// the retention job must hard-delete orphaned OAuth rows that have no owning service
// to delegate to (user_id is already NULL). Exposing hardDelete helpers from each
// OAuth provider would add significant boilerplate for a single use case.
// CRM contact/note author FKs are reassigned before deletion because they require a non-null creator.
import { providerTableConfigs } from '@services/oauth/providers'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { cleanupLocalAnalyticsRetention } from '@data-stores/analytics/retention'
import { flush as flushLocalAnalytics } from '@data-stores/analytics/backend-local'
import {
  DEFAULT_BATCH_SIZE,
  cleanupSoftDeletedUserBatch,
  deleteOldReferralAttributionBatch,
  deleteOrphanedOAuthAccountBatch,
  normalizePositiveInteger,
} from './cleanup-batches.mts'
import {
  cleanupAbandonedBlueskyLinkSessions,
  cleanupExpiredBlueskyLinkCompletions,
} from './cleanup-bluesky.mts'
import { cleanupExpiredOAuthAuthorizations } from './cleanup-oauth-authorizations.mts'
import { cleanupTerminalNotificationPushIntents } from './cleanup-notification-push-intents.mts'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { pruneExpiredContributionAdmissions } from '@services/contribution-gating/admission'
import { pruneExpiredContributionAdmissionConsumptions } from '@services/contribution-gating/admission-quota'
import { pruneExpiredTopicImportAttempts } from '@services/user-import-export/topic-import-attempts'

export { cleanupAbandonedBlueskyLinkSessions, cleanupExpiredBlueskyLinkCompletions }
export { cleanupExpiredOAuthAuthorizations }
export { cleanupTerminalNotificationPushIntents }

const TOPIC_IMPORT_ATTEMPT_DELETION_BATCH_SIZE = 25

export async function cleanupAnalyticsLocalFiles(): Promise<void> {
  if (process.env.ANALYTICS_BACKEND !== 'local') return
  await flushLocalAnalytics()
  await cleanupLocalAnalyticsRetention()
}

type CleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches?: number
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

type DataRetentionCleanupOptions = {
  softDeletedUsers?: CleanupOptions
  oldReferralAttributions?: CleanupOptions
  orphanedOAuthAccounts?: CleanupOptions
  expiredOAuthAuthorizations?: ExpiryCleanupOptions
  expiredBlueskyLinkCompletions?: Omit<CleanupOptions, 'retentionDays'>
  abandonedBlueskyLinkSessions?: Omit<CleanupOptions, 'retentionDays'>
  expiredContributionAdmissions?: ExpiryCleanupOptions
  expiredContributionQuotaConsumptions?: ExpiryCleanupOptions
  expiredTopicImportAttempts?: ExpiryCleanupOptions
  terminalNotificationPushIntents?: CleanupOptions
}

type DataRetentionCleanupResult = {
  softDeletedUsers: CleanupResult
  oldReferralAttributions: CleanupResult
  orphanedOAuthAccounts: CleanupResult
  expiredOAuthAuthorizations: CleanupResult
  expiredBlueskyLinkCompletions: CleanupResult
  abandonedBlueskyLinkSessions: CleanupResult
  expiredContributionAdmissions: CleanupResult
  expiredContributionQuotaConsumptions: CleanupResult
  expiredTopicImportAttempts: CleanupResult
  terminalNotificationPushIntents: CleanupResult
}

export async function runDataRetentionCleanup(
  options: DataRetentionCleanupOptions = {},
): Promise<DataRetentionCleanupResult> {
  // Ephemeral broker rows reference users and provider accounts. Remove expired rows first so a
  // long-interrupted cleanup run cannot retain avoidable references ahead of parent cleanup.
  const expiredOAuthAuthorizations = await cleanupExpiredOAuthAuthorizations(
    options.expiredOAuthAuthorizations,
  )
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const softDeletedUsers = await cleanupSoftDeletedUsers(options.softDeletedUsers)
  const oldReferralAttributions = await cleanupOldReferralAttributions(
    options.oldReferralAttributions,
  )
  const orphanedOAuthAccounts = await cleanupOrphanedOAuthAccounts(options.orphanedOAuthAccounts)
  const expiredBlueskyLinkCompletions = await cleanupExpiredBlueskyLinkCompletions(
    options.expiredBlueskyLinkCompletions,
  )
  const abandonedBlueskyLinkSessions = await cleanupAbandonedBlueskyLinkSessions(
    options.abandonedBlueskyLinkSessions,
  )
  const expiredContributionAdmissions = await cleanupExpiredContributionAdmissions(
    options.expiredContributionAdmissions,
  )
  const expiredContributionQuotaConsumptions = await cleanupExpiredContributionQuotaConsumptions(
    options.expiredContributionQuotaConsumptions,
  )
  const expiredTopicImportAttempts = await cleanupExpiredTopicImportAttempts(
    options.expiredTopicImportAttempts,
  )
  const terminalNotificationPushIntents = await cleanupTerminalNotificationPushIntents(
    options.terminalNotificationPushIntents,
  )
  await cleanupAnalyticsLocalFiles()

  return {
    softDeletedUsers,
    oldReferralAttributions,
    orphanedOAuthAccounts,
    expiredOAuthAuthorizations,
    expiredBlueskyLinkCompletions,
    abandonedBlueskyLinkSessions,
    expiredContributionAdmissions,
    expiredContributionQuotaConsumptions,
    expiredTopicImportAttempts,
    terminalNotificationPushIntents,
  }
}

export async function cleanupExpiredContributionAdmissions(
  options: ExpiryCleanupOptions = {},
): Promise<CleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each locked deletion batch determines whether more work remains
    const batchDeleted = await pruneExpiredContributionAdmissions(
      options.now,
      batchSize,
      options.lowerBoundDate,
    )
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }
  return { deleted, hasMore }
}

export async function cleanupExpiredContributionQuotaConsumptions(
  options: ExpiryCleanupOptions = {},
): Promise<CleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each locked deletion batch determines whether more work remains
    const batchDeleted = await pruneExpiredContributionAdmissionConsumptions(
      options.now,
      batchSize,
      options.lowerBoundDate,
    )
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }
  return { deleted, hasMore }
}

export async function cleanupExpiredTopicImportAttempts(
  options: ExpiryCleanupOptions = {},
): Promise<CleanupResult> {
  const batchSize = normalizePositiveInteger(
    options.batchSize,
    TOPIC_IMPORT_ATTEMPT_DELETION_BATCH_SIZE,
    'batchSize',
  )
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  let deleted = 0
  let hasMore = false
  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each locked deletion batch determines whether more work remains
    const batchDeleted = await pruneExpiredTopicImportAttempts(
      options.now,
      batchSize,
      options.lowerBoundDate,
    )
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }
  return { deleted, hasMore }
}

export async function cleanupSoftDeletedUsers(
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  let deleted = 0
  let hasMore = false

  // Null out or reassign FK references that lack ON DELETE CASCADE/SET NULL before
  // hard-deleting users.
  //
  // - crm_contacts.created_by_id: NOT NULL ... ON DELETE RESTRICT — must reassign to tombstone user.
  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded deletion commit determines whether another user batch remains
    const batchDeleted = await cleanupSoftDeletedUserBatch(
      cutoffDate,
      batchSize,
      options.lowerBoundDate,
    )
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }

  return { deleted, hasMore }
}

export async function cleanupOldReferralAttributions(
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 30)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  const cutoffId = getMinUUIDv7ForDate(getRetentionCutoffDate(retentionDays, options.now))
  const lowerBoundId =
    options.lowerBoundDate === undefined ? undefined : getMinUUIDv7ForDate(options.lowerBoundDate)
  let deleted = 0
  let hasMore = false

  for (let batches = 0; batches < maxBatches; batches += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded deletion commit determines whether another attribution batch remains
    const batchDeleted = await deleteOldReferralAttributionBatch(cutoffId, batchSize, lowerBoundId)
    deleted += batchDeleted
    hasMore = batchDeleted === batchSize
    if (!hasMore) break
  }

  return { deleted, hasMore }
}

export async function cleanupOrphanedOAuthAccounts(
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays, 90)
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = normalizePositiveInteger(options.maxBatches, Infinity, 'maxBatches')
  const cutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  const providerConfigs = Object.values(providerTableConfigs)
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
