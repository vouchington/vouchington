import { runAggregateExistenceScenarios } from './run-scenarios/aggregate-existence.mts'
import { runExistenceFilterScenarios } from './run-scenarios/existence-filters.mts'
import { runMembershipExpiryPageScenarios } from './run-scenarios/membership-expiry-pages.mts'
import { runMembershipOrphanedQueuedGrantScenarios } from './run-scenarios/membership-orphaned-queued-grants.mts'
import { runCategoryProjectionScenarios } from './run-scenarios/category-projection.mts'
import { runAiUsageLookupScenarios } from './run-scenarios/ai-usage-lookups.mts'
import { runMembershipScenarios } from './run-scenarios/memberships.mts'
import { continueAfterFailure as runStep } from './scenario-failures.mts'
import { runEarlyScenarios } from './run-ordered-scenarios-early.mts'
import { runLateScenarios } from './run-ordered-scenarios-late.mts'

// Order matters: earlier scenarios mutate the one shared corpus. See the comments in the
// early and late files before moving a runner.
export async function runScenariosBeforePartition(): Promise<void> {
  await runEarlyScenarios()
  await runLateScenarios()
}

// Late fixture writers seed after every ordinary plan and never read the comment partitions.
export async function runScenariosAfterPartition(): Promise<void> {
  await runStep(runCategoryProjectionScenarios.name, runCategoryProjectionScenarios)
  await runStep(runExistenceFilterScenarios.name, runExistenceFilterScenarios)
  await runStep(runAiUsageLookupScenarios.name, runAiUsageLookupScenarios)
  await runStep(runMembershipScenarios.name, runMembershipScenarios)
  // Expiry fixtures come after the shared membership writer's corpus and all ordinary plans.
  await runStep(runMembershipExpiryPageScenarios.name, runMembershipExpiryPageScenarios)
  await runStep(
    runMembershipOrphanedQueuedGrantScenarios.name,
    runMembershipOrphanedQueuedGrantScenarios,
  )
  // These fixtures change crawler-table statistics; keep them after every existing plan.
  await runStep(runAggregateExistenceScenarios.name, runAggregateExistenceScenarios)
}
