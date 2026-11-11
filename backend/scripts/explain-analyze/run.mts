import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  getCompletedScenarioIds,
  getResults,
  prepareOutputDir,
  writeResults,
} from './run-support.mts'
import { assertScenarioManifest } from './scenario-manifest-check.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import {
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

// EXPLAIN_SHARD splits the CI run (explain-shards.mts); unset runs everything.
async function main() {
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
    if (shard === undefined || shard === ORDINARY_EXPLAIN_SHARDS.at(-1))
      await runOrderedRunners(AFTER_PARTITION_RUNNERS)
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
  }
}
async function run(): Promise<void> {
  await main().finally(gracefulShutdown)
}
run().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
