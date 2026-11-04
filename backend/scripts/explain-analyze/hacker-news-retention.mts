import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  getCompletedScenarioIds,
  getResults,
  prepareOutputDir,
  writeResults,
} from './run-support.mts'
import { assertNoScenarioFailures } from './scenario-failures.mts'
import { assertPlanRegistry } from './plan-expectations.mts'
import { runHackerNewsRetentionScenario } from './run-scenarios/hacker-news-retention.mts'

async function main(): Promise<void> {
  prepareOutputDir()
  try {
    await runHackerNewsRetentionScenario()
    const completed = getCompletedScenarioIds()
    if (completed.length !== 1 || completed[0] !== 'hacker-news-retention-page') {
      throw new Error(`Unexpected Hacker News EXPLAIN scenarios: ${completed.join(', ')}`)
    }
    assertPlanRegistry(getResults().map(result => result.scenario_id ?? ''))
    assertNoScenarioFailures()
  } finally {
    writeResults()
    await gracefulShutdown()
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
