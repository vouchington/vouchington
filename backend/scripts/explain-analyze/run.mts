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
  EXPLAIN_SHARD_ENV,
  assertShardDeclarations,
  getShardScenarioIds,
  parseExplainShard,
} from './explain-shards.mts'
import { assertSeedAnchorMatches } from './seed-anchor-check.mts'
import { SEED_ANCHOR_DATE_ENV, assertSeedAnchorNotFuture } from './seed-data/seed-anchor.mts'
import { assertNoScenarioFailures, continueAfterFailure as runStep } from './scenario-failures.mts'
import { assertPlanRegistry } from './plan-expectations.mts'
import {
  runScenariosAfterPartition,
  runScenariosBeforePartition,
} from './run-ordered-scenarios.mts'
import { runCommentDescendantPartitionedPages } from './run-scenarios/comment-descendant-partitioned-pages.mts'
import { assertNoLeftoverCommentPartitions } from './seed-data/comment-descendant-partition-storage.mts'

// EXPLAIN_SHARD=main|partition splits the CI run (explain-shards.mts); unset runs everything.
async function main() {
  const shard = parseExplainShard(process.env[EXPLAIN_SHARD_ENV])
  assertShardDeclarations(EXPLAIN_SCENARIO_MANIFEST)
  prepareOutputDir()
  try {
    assertSeedAnchorNotFuture(process.env[SEED_ANCHOR_DATE_ENV])
    await assertSeedAnchorMatches()
    await assertNoLeftoverCommentPartitions()
    if (shard !== 'partition') await runScenariosBeforePartition()
    if (shard !== 'main')
      await runStep(runCommentDescendantPartitionedPages.name, runCommentDescendantPartitionedPages)
    if (shard !== 'partition') await runScenariosAfterPartition()
    const runErrors: unknown[] = []
    try {
      assertScenarioManifest(
        getCompletedScenarioIds(),
        getShardScenarioIds(shard, EXPLAIN_SCENARIO_MANIFEST),
      )
    } catch (err) {
      runErrors.push(err)
    }
    try {
      assertPlanRegistry(getResults().map(result => result.scenario_id ?? ''))
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
