import { continueAfterFailure as runStep } from '../scenario-failures.mts'
import { runPostDiscoveryFixtureScenarios } from './post-discovery-search.mts'

/** Keep large owned post cohorts after ordinary captures and separate from each other. */
export async function runLatePostPageScenarios(): Promise<void> {
  await runStep(runPostDiscoveryFixtureScenarios.name, runPostDiscoveryFixtureScenarios)
}
