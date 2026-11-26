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
import {
  AFTER_MEMBERSHIPS_RUNNERS,
  AFTER_MEMBERSHIP_CAPACITY_RUNNERS,
} from './run-ordered-scenarios-after-memberships.mts'
import { AFTER_COMMUNITIES_RUNNERS } from './run-ordered-scenarios-after-communities.mts'
import { AFTER_NOTIFICATIONS_RUNNERS } from './run-ordered-scenarios-after-notifications.mts'
import { AFTER_ACCOUNTS_RSS_RUNNERS } from './run-ordered-scenarios-after-accounts-rss.mts'
import { AFTER_TOPICS_RUNNERS } from './run-ordered-scenarios-after-topics.mts'
import { AFTER_RETENTION_RUNNERS } from './run-ordered-scenarios-after-retention.mts'
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
  ...AFTER_MEMBERSHIPS_RUNNERS,
  ...AFTER_COMMUNITIES_RUNNERS,
  ...AFTER_NOTIFICATIONS_RUNNERS,
  ...AFTER_ACCOUNTS_RSS_RUNNERS,
  ...AFTER_TOPICS_RUNNERS,
  ...AFTER_RETENTION_RUNNERS,
  ...AFTER_MEMBERSHIP_CAPACITY_RUNNERS,
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
