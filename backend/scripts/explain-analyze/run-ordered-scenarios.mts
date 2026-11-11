import { runAggregateExistenceScenarios } from './run-scenarios/aggregate-existence.mts'
import { runExistenceFilterScenarios } from './run-scenarios/existence-filters.mts'
import { runMembershipExpiryPageScenarios } from './run-scenarios/membership-expiry-pages.mts'
import { runMembershipOrphanedQueuedGrantScenarios } from './run-scenarios/membership-orphaned-queued-grants.mts'
import { runCategoryProjectionScenarios } from './run-scenarios/category-projection.mts'
import { runAiUsageLookupScenarios } from './run-scenarios/ai-usage-lookups.mts'
import { runMembershipScenarios } from './run-scenarios/memberships.mts'
import { runAiUsageTotalsScenarios } from './run-scenarios/ai-usage-totals.mts'
import { continueAfterFailure as runStep } from './scenario-failures.mts'
import { EARLY_RUNNERS } from './run-ordered-scenarios-early.mts'
import { LATE_RUNNERS } from './run-ordered-scenarios-late.mts'
import { ORDINARY_EXPLAIN_SHARDS, type OrdinaryExplainShard } from './explain-shards.mts'

export type OrderedRunner = () => Promise<unknown>

// Order matters: earlier scenarios mutate the one shared corpus. See the comments in the
// early and late files before moving a runner.
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
  // These fixtures change crawler-table statistics; keep them after every existing plan.
  runAggregateExistenceScenarios,
  // Keep the extra communities out of ordinary search and ranking plan captures.
  runAiUsageTotalsScenarios,
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
  return sliceOrderedRunners(BEFORE_PARTITION_RUNNERS)[ORDINARY_EXPLAIN_SHARDS.indexOf(shard)] ?? []
}

export async function runOrderedRunners(runners: readonly OrderedRunner[]): Promise<void> {
  for (const runner of runners) await runStep(runner.name, runner)
}
