import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  getCompletedScenarioIds,
  getResults,
  prepareOutputDir,
  writeResults,
} from './run-support.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import {
  type ExplainShard,
  assertFixedShardDeclarations,
  assertOrdinaryCompletedScenarios,
  assertShardCompletedScenarios,
  isOrdinaryExplainShard,
  parseExplainShard,
} from './explain-shards.mts'
import { assertSeedAnchorMatches } from './seed-anchor-check.mts'
import { SEED_ANCHOR_DATE_ENV, assertSeedAnchorNotFuture } from './seed-data/seed-anchor.mts'
import { assertNoScenarioFailures, continueAfterFailure as runStep } from './scenario-failures.mts'
import { assertPlanRegistry } from './plan-expectations.mts'
import {
  getDomainRunners,
  getOrderedRunners,
  parseExplainDomain,
  runOrderedRunners,
} from './run-ordered-scenarios.mts'
import { runCommentDescendantPartitionedPages } from './run-scenarios/comment-descendant-partitioned-pages.mts'
import { assertNoLeftoverCommentPartitions } from './seed-data/comment-descendant-partition-storage.mts'
import { assertNoLeftoverHackerNewsScalePartitions } from './seed-data/hacker-news-scale-fixture.mts'
import { runHackerNewsScaleScenarios } from './run-scenarios/hacker-news-scale.mts'

// The ordinary step times out at 13 minutes in explain-analyze.yml; warn well before that so a
// growing shard shows up as an annotation instead of a timeout. It never fails the run.
const SLOW_SHARD_WARNING_MS = 11 * 60_000

function warnWhenShardRunsSlow(shard: ExplainShard | undefined, startedAt: number): void {
  const elapsedMs = Date.now() - startedAt
  if (!isOrdinaryExplainShard(shard) || elapsedMs <= SLOW_SHARD_WARNING_MS) return
  const minutes = (elapsedMs / 60_000).toFixed(1)
  console.log(
    `::warning title=EXPLAIN shard ${shard} is near its limit::The ${shard} scenarios took ${minutes} minutes against the 13 minute step limit; move a domain in ORDINARY_SHARD_DOMAINS to rebalance.`,
  )
}

// EXPLAIN_SHARD splits the CI run (explain-shards.mts); EXPLAIN_DOMAIN runs one domain file alone;
// neither runs everything.
async function main() {
  const startedAt = Date.now()
  const shard = parseExplainShard(process.env.EXPLAIN_SHARD)
  const domain = parseExplainDomain(process.env.EXPLAIN_DOMAIN)
  if (shard !== undefined && domain !== undefined)
    throw new Error('Set either EXPLAIN_SHARD or EXPLAIN_DOMAIN, not both')
  assertFixedShardDeclarations(EXPLAIN_SCENARIO_MANIFEST)
  prepareOutputDir()
  try {
    assertSeedAnchorNotFuture(process.env[SEED_ANCHOR_DATE_ENV])
    await assertSeedAnchorMatches()
    await assertNoLeftoverCommentPartitions()
    await assertNoLeftoverHackerNewsScalePartitions()
    if (domain !== undefined) {
      await runOrderedRunners(getDomainRunners(domain))
    } else {
      if (shard === undefined || isOrdinaryExplainShard(shard))
        await runOrderedRunners(getOrderedRunners(shard))
      if (shard === undefined || shard === 'partition')
        await runStep(
          runCommentDescendantPartitionedPages.name,
          runCommentDescendantPartitionedPages,
        )
      // The million-post fixture comes last in a full run so its future leaves never touch ordinary plans.
      if (shard === undefined || shard === 'hn-scale')
        await runStep(runHackerNewsScaleScenarios.name, runHackerNewsScaleScenarios)
    }
    const runErrors: unknown[] = []
    try {
      if (domain !== undefined)
        assertOrdinaryCompletedScenarios(
          getCompletedScenarioIds(),
          EXPLAIN_SCENARIO_MANIFEST,
          domain,
        )
      else
        assertShardCompletedScenarios(getCompletedScenarioIds(), shard, EXPLAIN_SCENARIO_MANIFEST)
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
