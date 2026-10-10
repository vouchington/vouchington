import { writeFileSync } from 'node:fs'
import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  assertMediaDeliveryReplayPopulation,
  seedMediaDeliveryReplay,
} from './seed-data/media-delivery-replay.mts'
import {
  MEDIA_REPLAY_SCENARIOS,
  runMediaDeliveryReplayScenarios,
} from './run-scenarios/media-delivery-replay.mts'
import { assertScenarioManifest, getCompletedScenarioIds, getResults } from './run-support.mts'
import { assertPlanRegistry } from './plan-expectations.mts'

/** Focused native entrypoint; the same seed/scenarios also belong to the complete corpus. */
async function main(): Promise<void> {
  const [mode, output, ...rest] = process.argv.slice(2)
  if (!['--seed-only', '--run-only'].includes(mode ?? '') || !output || rest.length)
    throw new Error(
      'Usage: node backend/scripts/explain-analyze/media-delivery-replay.mts <--seed-only|--run-only> <raw-output.json>',
    )
  let success = false
  let effects: Awaited<ReturnType<typeof runMediaDeliveryReplayScenarios>> = []
  let population: Awaited<ReturnType<typeof assertMediaDeliveryReplayPopulation>> | undefined
  try {
    if (mode === '--seed-only') await seedMediaDeliveryReplay()
    else {
      if (process.env.EXPLAIN_PLAN_CACHE_MODE !== 'compare')
        throw new Error('The focused UUID replay proof requires EXPLAIN_PLAN_CACHE_MODE=compare')
      effects = await runMediaDeliveryReplayScenarios()
      assertScenarioManifest(getCompletedScenarioIds(), MEDIA_REPLAY_SCENARIOS)
      assertPlanRegistry(getResults().map(result => result.scenario_id ?? ''))
      if (getResults().length !== MEDIA_REPLAY_SCENARIOS.length * 3 * 2)
        throw new Error(
          'Expected every lock/pending/event statement in both native plan-cache modes',
        )
    }
    population = await assertMediaDeliveryReplayPopulation()
    success = true
  } finally {
    writeFileSync(
      output,
      `${JSON.stringify({ success, mode, population, effects, scenarios: getCompletedScenarioIds(), results: getResults() }, null, 2)}\n`,
    )
  }
}

try {
  await main()
} finally {
  await gracefulShutdown()
}
