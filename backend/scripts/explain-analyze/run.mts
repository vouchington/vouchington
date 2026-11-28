import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import { CAPACITY_AUDIT_RUNNERS } from './run-capacity-audit-scenarios.mts'
import {
  getCompletedScenarioIds,
  getResults,
  prepareOutputDir,
  writeResults,
} from './run-support.mts'
import { assertScenarioManifest } from './scenario-manifest-check.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import {
  type ExplainShard,
  ORDINARY_EXPLAIN_SHARDS,
  assertShardDeclarations,
  getShardScenarioIds,
  isOrdinaryExplainShard,
  parseExplainShard,
} from './explain-shards.mts'
import { assertSeedAnchorMatches } from './seed-anchor-check.mts'
import { SEED_ANCHOR_DATE_ENV, assertSeedAnchorNotFuture } from './seed-data/seed-anchor.mts'
import { assertNoScenarioFailures, continueAfterFailure as runStep } from './scenario-failures.mts'
import { assertPlanRegistry } from './plan-expectations.mts'
import {
  AFTER_PARTITION_RUNNERS,
  getOrderedRunners,
  runOrderedRunners,
} from './run-ordered-scenarios.mts'
import { runCommentDescendantPartitionedPages } from './run-scenarios/comment-descendant-partitioned-pages.mts'
import { assertNoLeftoverCommentPartitions } from './seed-data/comment-descendant-partition-storage.mts'
import { assertNoLeftoverHackerNewsScalePartitions } from './seed-data/hacker-news-scale-fixture.mts'
import { runHackerNewsScaleScenarios } from './run-scenarios/hacker-news-scale.mts'
import { runCommunityHistoryReadScenarios } from './run-scenarios/community-history-reads.mts'
import { runCommunityModerationListCapacityScenarios } from './run-scenarios/community-moderation-list-capacity.mts'
import { runCommunityPublicationCapacityScenarios } from './run-scenarios/community-publication-capacity.mts'
import { runCommunityModerationQueueCapacityScenarios } from './run-scenarios/community-moderation-queue-capacity.mts'
import { runDeletedConversationRetentionCapacityScenarios } from './run-scenarios/deleted-conversation-retention-capacity.mts'
import { runAiUsageRetentionCapacityScenario } from './run-scenarios/ai-usage-retention-capacity.mts'
import { runTextEmbeddingRetentionCapacityScenario } from './run-scenarios/text-embedding-retention-capacity.mts'
import { runCommunityRosterReadCapacityScenario } from './run-scenarios/community-roster-read-capacity.mts'
import { runNotificationUnreadCapacityScenario } from './run-scenarios/notification-unread-capacity.mts'

// The ordinary step times out at 13 minutes in explain-analyze.yml; warn well before that so a
// growing shard shows up as an annotation instead of a timeout. It never fails the run.
const SLOW_SHARD_WARNING_MS = 11 * 60_000

function warnWhenShardRunsSlow(shard: ExplainShard | undefined, startedAt: number): void {
  const elapsedMs = Date.now() - startedAt
  if (!isOrdinaryExplainShard(shard) || elapsedMs <= SLOW_SHARD_WARNING_MS) return
  const minutes = (elapsedMs / 60_000).toFixed(1)
  console.log(
    `::warning title=EXPLAIN shard ${shard} is near its limit::The ${shard} scenarios took ${minutes} minutes against the 13 minute step limit; see #6653 for sharding the late fixture writers.`,
  )
}

// EXPLAIN_SHARD splits the CI run (explain-shards.mts); unset runs everything.
async function main() {
  const startedAt = Date.now()
  const shard = parseExplainShard(process.env.EXPLAIN_SHARD)
  assertShardDeclarations(EXPLAIN_SCENARIO_MANIFEST)
  prepareOutputDir()
  try {
    assertSeedAnchorNotFuture(process.env[SEED_ANCHOR_DATE_ENV])
    await assertSeedAnchorMatches()
    await assertNoLeftoverCommentPartitions()
    await assertNoLeftoverHackerNewsScalePartitions()
    if (shard === undefined || isOrdinaryExplainShard(shard))
      await runOrderedRunners(getOrderedRunners(shard))
    if (shard === undefined || shard === 'partition')
      await runStep(runCommentDescendantPartitionedPages.name, runCommentDescendantPartitionedPages)
    // The late fixture writers close the last ordinary shard, after every ordinary plan.
    if (shard === undefined || shard === ORDINARY_EXPLAIN_SHARDS.at(-1)) {
      await runOrderedRunners(AFTER_PARTITION_RUNNERS)
      // The mixed-recipient fixture updates notification statistics after other notification plans.
      await runStep(
        runNotificationUnreadCapacityScenario.name,
        runNotificationUnreadCapacityScenario,
      )
      await runStep(
        runCommunityRosterReadCapacityScenario.name,
        runCommunityRosterReadCapacityScenario,
      )
      await runStep(runCommunityHistoryReadScenarios.name, runCommunityHistoryReadScenarios)
      await runStep(
        runCommunityModerationListCapacityScenarios.name,
        runCommunityModerationListCapacityScenarios,
      )
      await runStep(
        runCommunityPublicationCapacityScenarios.name,
        runCommunityPublicationCapacityScenarios,
      )
      await runStep(
        runCommunityModerationQueueCapacityScenarios.name,
        runCommunityModerationQueueCapacityScenarios,
      )
      await runStep(
        runTextEmbeddingRetentionCapacityScenario.name,
        runTextEmbeddingRetentionCapacityScenario,
      )
      await runStep(runAiUsageRetentionCapacityScenario.name, runAiUsageRetentionCapacityScenario)
      await runStep(
        runDeletedConversationRetentionCapacityScenarios.name,
        runDeletedConversationRetentionCapacityScenarios,
      )
      await runOrderedRunners(CAPACITY_AUDIT_RUNNERS)
    }
    // The million-post fixture comes last in a full run so its future leaves never touch ordinary plans.
    if (shard === undefined || shard === 'hn-scale')
      await runStep(runHackerNewsScaleScenarios.name, runHackerNewsScaleScenarios)
    const runErrors: unknown[] = []
    try {
      assertScenarioManifest(
        getCompletedScenarioIds(),
        getShardScenarioIds(shard, EXPLAIN_SCENARIO_MANIFEST),
        shard,
      )
    } catch (err) {
      runErrors.push(err)
    }
    try {
      assertPlanRegistry(
        getResults().map(result => result.scenario_id ?? ''),
        getShardScenarioIds(shard, EXPLAIN_SCENARIO_MANIFEST),
      )
    } catch (err) {
      runErrors.push(err)
    }
    assertNoScenarioFailures(runErrors)
  } finally {
    writeResults()
    warnWhenShardRunsSlow(shard, startedAt)
  }
}
async function run(): Promise<void> {
  await main().finally(gracefulShutdown)
}
run().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
