import { cleanupExpiredUserDataRequestAttempts } from './cleanup-user-data-request-attempts.mts'
import { cleanupOldMediaDeliveryChanges } from './cleanup-media-delivery-changes.mts'
import { cleanupClassifierRecords } from './cleanup-classifier-records.mts'
import {
  cleanupModerationEmailSends,
  cleanupSesBounceEvents,
  cleanupSystemPrunedNotifications,
  cleanupUserDeletedNotifications,
} from './cleanup-notification-email.mts'
import { cleanupFederationRetention } from './cleanup-federation.mts'
import { cleanupSupersededVoteBallots } from './cleanup-vote-ballots.mts'
import { cleanupOrphanedUserAgentStrings } from './cleanup-user-agent-strings.mts'
import { cleanupVoteIntegrityDetails } from './cleanup-vote-integrity-details.mts'
import { applyRetentionLimits } from './cleanup-options.mts'
import { getClassifierRetentionDays, type DataRetentionLimits } from './config.mts'
import type { DataRetentionCleanupFamily } from './cleanup-run-family.mts'
import type { DataRetentionCleanupOptions } from './cleanup-run-options.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export async function cleanupClassifierVoteFamilies(
  limits: DataRetentionLimits,
  options: DataRetentionCleanupOptions,
): Promise<
  Pick<
    DataRetentionCleanupResult,
    | 'expiredUserDataRequestAttempts'
    | 'oldMediaDeliveryChanges'
    | 'classifierRecords'
    | 'sesBounceEvents'
    | 'systemPrunedNotifications'
    | 'userDeletedNotifications'
    | 'moderationEmailSends'
    | 'federationRetention'
    | 'supersededVoteBallots'
    | 'orphanedUserAgentStrings'
    | 'voteIntegrityDetails'
  >
> {
  const active = (family: DataRetentionCleanupFamily) =>
    options.families === undefined || options.families.includes(family)
  const withLimits = (overrides: { batchSize?: number; maxBatches?: number } | undefined) =>
    applyRetentionLimits(limits, overrides)

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
  return {
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
  }
}
