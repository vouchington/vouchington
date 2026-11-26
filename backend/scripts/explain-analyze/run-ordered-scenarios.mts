import { runMessageNotificationWriteCapacity } from './run-scenarios/message-notification-write-capacity.mts'
import { runAggregateExistenceScenarios } from './run-scenarios/aggregate-existence.mts'
import { runAccountHistoryScenarios } from './run-scenarios/account-history-pages.mts'
import { runAccountMessagingScenarios } from './run-scenarios/account-messaging-pages.mts'
import { runConversationListCapacityScenario } from './run-scenarios/conversation-list-capacity.mts'
import { runAccountListCapacityScenarios } from './run-scenarios/account-lists-at-cap.mts'
import { runCommunitySearchCapacityScenario } from './run-scenarios/community-search-capacity.mts'
import { runCommunityMembershipReadCapacityScenarios } from './run-scenarios/community-membership-read-capacity.mts'
import { runExistenceFilterScenarios } from './run-scenarios/existence-filters.mts'
import { runMembershipExpiryPageScenarios } from './run-scenarios/membership-expiry-pages.mts'
import { runMembershipOrphanedQueuedGrantScenarios } from './run-scenarios/membership-orphaned-queued-grants.mts'
import { runPostImageWriteScenarios } from './run-scenarios/post-image-writes.mts'
import { runCategoryProjectionScenarios } from './run-scenarios/category-projection.mts'
import { runAiUsageLookupScenarios } from './run-scenarios/ai-usage-lookups.mts'
import { runMembershipScenarios } from './run-scenarios/memberships.mts'
import { runAiUsageTotalsScenarios } from './run-scenarios/ai-usage-totals.mts'
import { continueAfterFailure as runStep } from './scenario-failures.mts'
import { EARLY_RUNNERS } from './run-ordered-scenarios-early.mts'
import { LATE_RUNNERS } from './run-ordered-scenarios-late.mts'
import { ORDINARY_EXPLAIN_SHARDS, type OrdinaryExplainShard } from './explain-shards.mts'
import {
  prepareCrawlDispatchScale,
  prepareReferralCrawlScale,
  prepareReferralUnfurlScale,
} from './seed-data/dispatch-work-plans.mts'
import { runAnalyze } from './seed-data/maintenance.mts'
import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { runConversationMessageCapacityScenario } from './run-scenarios/conversation-message-capacity.mts'
import {
  runMarkNotificationInboxCapacityScenario,
  runNotificationInboxCapacityScenario,
} from './run-scenarios/notification-inbox-capacity.mts'
import { runTopicClaimCapacityScenarios } from './run-scenarios/topic-claim-capacity.mts'
import { runRssFeedCrawlCapacityScenario } from './run-scenarios/rss-feed-crawl-capacity.mts'
import { runAdminReviewAndGuestReadScenarios } from './run-scenarios/admin-review-and-guest-reads.mts'
import { runRelatedPostUrlCapacityScenario } from './run-scenarios/related-post-url-capacity.mts'
import { runRssIngestCapacityScenario } from './run-scenarios/rss-ingest-capacity.mts'
import { runRssHardDeleteSourceCapacityScenario } from './run-scenarios/rss-hard-delete-source-capacity.mts'
import { runRssWriteCapacityScenarios } from './run-scenarios/rss-write-capacity.mts'
import {
  runReviewRatingWriteCapacity,
  runDataPointTopicInsertCapacity,
  runDataPointTopicReplaceCapacity,
} from './run-scenarios/post-topic-write-capacity.mts'
import { runApplicationQuestions } from './run-scenarios/community-application-question-write.mts'

import { runUserListCapacityScenario } from './run-scenarios/user-list-capacity.mts'
import {
  runTopicAliasCapacityScenario,
  runTopicHostnameCapacityScenario,
} from './run-scenarios/topic-identity-capacity.mts'
import { runTopHashtagCapacityScenario } from './run-scenarios/top-hashtag-capacity.mts'
import { runTopicChildCapacityScenario } from './run-scenarios/topic-child-capacity.mts'
import { runUrlEmbedCapacityScenario } from './run-scenarios/url-embed-capacity.mts'
import { runCopyrightRetainedEmailLookupScenarios } from './run-scenarios/copyright-retained-email-lookup.mts'
import { runCopyrightAiRunRetentionCapacityScenario } from './run-scenarios/copyright-ai-run-retention-capacity.mts'

export type OrderedRunner = () => Promise<unknown>

// Order matters: earlier scenarios mutate the one shared corpus. See the comments in the
// early and late files before moving a runner.
//
// A scenario that needs a corpus seeds it itself or names it in an explicit shard prelude; it
// never relies on another segment's leftovers. Each shard runs on its own database.
export const BEFORE_PARTITION_RUNNERS: readonly OrderedRunner[] = [
  ...EARLY_RUNNERS,
  ...LATE_RUNNERS,
]

// Each ordinary shard after `main` starts at one of these runners and runs to the next start. A
// shard starts from the seeded corpus without the writes of the segments before it, so cut only
// where the opening runner does not read what earlier segments leave behind:
// - Post moderation retention reads its own fixtures (the agent moderation seed follows it).
// - Notification visibility is the first hot publication fixture; it re-analyzes the seeded
//   tables itself and every ordinary plan has already run.
// - Embedding reconciliation seeds its own corpora; the mixed membership corpus from the vote
//   weight seed belongs to the segment before it.
export const ORDERED_SHARD_STARTS = [
  'runPostModerationRetentionScenarios',
  'runNotificationVisibilityScenarios',
  'runEmbeddingReconciliationScenarios',
] as const

// The referral link plans read the crawl and referral link volume the dispatch work plan seeds
// add in main-2, so the last shard replays those seeds without their captures. Without them the
// referral-links follow scan (hostname-exclusion-referral-links) stopped being a near tie.
async function replayDispatchWorkPlanSeeds(): Promise<void> {
  await prepareCrawlDispatchScale()
  await prepareReferralCrawlScale()
  await prepareReferralUnfurlScale()
}

// Steps a later shard replays before its own segment, in the original order, because plans in it
// read corpora that main-2 or main-3 wrote. Only add a step that is deterministic and idempotent.
const SHARD_PRELUDES: Partial<Record<OrdinaryExplainShard, readonly OrderedRunner[]>> = {
  'main-4': [
    // main-2 seeds this: the referral-links follow scan (hostname-exclusion-referral-links).
    replayDispatchWorkPlanSeeds,
    // main-2 seeds this: the membership renewal selection and orphaned queued grant plans chose
    // sequential scans without the mixed membership corpus.
    seedVoteWeightDispatch,
    // Notification visibility (main-3) runs this. Kept for fidelity with the original order; on
    // its own it fixed no flip.
    runAnalyze,
  ],
}

export function getShardPrelude(shard: OrdinaryExplainShard): readonly OrderedRunner[] {
  return SHARD_PRELUDES[shard] ?? []
}

// Late fixture writers seed after every ordinary plan and never read the comment partitions.
// They run at the end of the last ordinary shard.
export const AFTER_PARTITION_RUNNERS: readonly OrderedRunner[] = [
  runCategoryProjectionScenarios,
  runExistenceFilterScenarios,
  runAiUsageLookupScenarios,
  runMembershipScenarios,
  // Expiry fixtures come after the shared membership writer's corpus and all ordinary plans.
  runMembershipExpiryPageScenarios,
  runMembershipOrphanedQueuedGrantScenarios,
  runConversationListCapacityScenario,
  runCommunitySearchCapacityScenario,
  runCommunityMembershipReadCapacityScenarios,
  // These fixtures change crawler-table statistics; keep them after every existing plan.
  runAggregateExistenceScenarios,
  // Keep the extra communities out of ordinary search and ranking plan captures.
  runAiUsageTotalsScenarios,
  runPostImageWriteScenarios,
  runConversationMessageCapacityScenario,
  runNotificationInboxCapacityScenario,
  runMarkNotificationInboxCapacityScenario,
  runTopicClaimCapacityScenarios,
  runRssFeedCrawlCapacityScenario,
  runAdminReviewAndGuestReadScenarios,
  runMessageNotificationWriteCapacity,
  runRelatedPostUrlCapacityScenario,
  runAccountMessagingScenarios,
  runRssIngestCapacityScenario,
  runRssHardDeleteSourceCapacityScenario,
  runAccountListCapacityScenarios,
  runRssWriteCapacityScenarios,
  runAccountHistoryScenarios,
  runUserListCapacityScenario,
  runTopicAliasCapacityScenario,
  runTopicHostnameCapacityScenario,
  runTopHashtagCapacityScenario,
  runTopicChildCapacityScenario,
  runUrlEmbedCapacityScenario,
  runReviewRatingWriteCapacity,
  runDataPointTopicInsertCapacity,
  runDataPointTopicReplaceCapacity,
  // The retained form corpus changes question statistics. Analyze it after ordinary plans.
  runApplicationQuestions,
  runCopyrightAiRunRetentionCapacityScenario,
  runCopyrightRetainedEmailLookupScenarios,
]

/**
 * Cuts the ordered runners into the leading segment plus one contiguous segment per start. Every
 * runner lands in exactly one segment, in its original order.
 */
export function sliceOrderedRunners(
  runners: readonly OrderedRunner[],
  starts: readonly string[] = ORDERED_SHARD_STARTS,
): readonly (readonly OrderedRunner[])[] {
  let previous = 0
  const cuts = starts.map(start => {
    const index = runners.findIndex(
      (runner, position) => position > previous && runner.name === start,
    )
    if (index === -1) throw new Error(`Ordered runner start ${start} is missing or out of order`)
    previous = index
    return index
  })
  return [0, ...cuts].map((cut, segment) => runners.slice(cut, cuts[segment] ?? runners.length))
}

/** The runners one ordinary shard owns before the partition fixture; no shard means all of them. */
export function getOrderedRunners(
  shard: OrdinaryExplainShard | undefined,
): readonly OrderedRunner[] {
  if (shard === undefined) return BEFORE_PARTITION_RUNNERS
  const segment =
    sliceOrderedRunners(BEFORE_PARTITION_RUNNERS)[ORDINARY_EXPLAIN_SHARDS.indexOf(shard)] ?? []
  return [...getShardPrelude(shard), ...segment]
}

export async function runOrderedRunners(runners: readonly OrderedRunner[]): Promise<void> {
  for (const runner of runners) await runStep(runner.name, runner)
}
