import { cleanupExpiredOAuthAuthorizations } from './cleanup-oauth-authorizations.mts'
import { cleanupExpiredOAuthAuthorizationServerArtifacts } from './cleanup-oauth-authorization-server.mts'
import { cleanupSoftDeletedUsers } from './cleanup-soft-deleted-users.mts'
import { cleanupOldReferralAttributions } from './cleanup-referral-attributions.mts'
import { cleanupHistories } from './cleanup-histories.mts'
import { cleanupOAuthFriendEdgeWork } from './cleanup-oauth-friend-edges.mts'
import { cleanupOrphanedOAuthAccounts } from './cleanup-orphaned-oauth-accounts.mts'
import { cleanupSecurityRecords } from './cleanup-security-records.mts'
import {
  cleanupAbandonedBlueskyLinkSessions,
  cleanupExpiredBlueskyLinkCompletions,
} from './cleanup-bluesky.mts'
import {
  cleanupExpiredContributionAdmissions,
  cleanupExpiredContributionQuotaConsumptions,
  cleanupExpiredTopicImportAttempts,
} from './cleanup-contribution-expiry.mts'
import { cleanupTerminalNotificationPushIntents } from './cleanup-notification-push-intents.mts'
import { applyRetentionLimits } from './cleanup-options.mts'
import type { DataRetentionLimits } from './config.mts'
import type { DataRetentionCleanupFamily } from './cleanup-run-family.mts'
import type { DataRetentionCleanupOptions } from './cleanup-run-options.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export async function cleanupExpiredAccountFamilies(
  limits: DataRetentionLimits,
  options: DataRetentionCleanupOptions,
  topicImportLimits: DataRetentionLimits,
): Promise<
  Pick<
    DataRetentionCleanupResult,
    | 'expiredOAuthAuthorizations'
    | 'expiredOAuthServerArtifacts'
    | 'softDeletedUsers'
    | 'oldReferralAttributions'
    | 'histories'
    | 'oauthFriendEdges'
    | 'orphanedOAuthAccounts'
    | 'securityRecords'
    | 'expiredBlueskyLinkCompletions'
    | 'abandonedBlueskyLinkSessions'
    | 'expiredContributionAdmissions'
    | 'expiredContributionQuotaConsumptions'
    | 'expiredTopicImportAttempts'
    | 'terminalNotificationPushIntents'
  >
> {
  const active = (family: DataRetentionCleanupFamily) =>
    options.families === undefined || options.families.includes(family)
  const withLimits = (overrides: { batchSize?: number; maxBatches?: number } | undefined) =>
    applyRetentionLimits(limits, overrides)

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
  return {
    expiredOAuthAuthorizations,
    expiredOAuthServerArtifacts,
    softDeletedUsers,
    oldReferralAttributions,
    histories,
    oauthFriendEdges,
    orphanedOAuthAccounts,
    securityRecords,
    expiredBlueskyLinkCompletions,
    abandonedBlueskyLinkSessions,
    expiredContributionAdmissions,
    expiredContributionQuotaConsumptions,
    expiredTopicImportAttempts,
    terminalNotificationPushIntents,
  }
}
