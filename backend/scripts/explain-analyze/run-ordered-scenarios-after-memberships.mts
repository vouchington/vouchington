import { runCategoryProjectionScenarios } from './run-scenarios/category-projection.mts'
import { runExistenceFilterScenarios } from './run-scenarios/existence-filters.mts'
import { runAiUsageLookupScenarios } from './run-scenarios/ai-usage-lookups.mts'
import { runMembershipScenarios } from './run-scenarios/memberships.mts'
import { runMembershipExpiryPageScenarios } from './run-scenarios/membership-expiry-pages.mts'
import { runMembershipOrphanedQueuedGrantScenarios } from './run-scenarios/membership-orphaned-queued-grants.mts'
import { runMembershipReadCapacityScenarios } from './run-scenarios/membership-read-capacity.mts'

export const AFTER_MEMBERSHIPS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runCategoryProjectionScenarios,
  runExistenceFilterScenarios,
  runAiUsageLookupScenarios,
  runMembershipScenarios,
  // Expiry fixtures come after the shared membership writer's corpus and all ordinary plans.
  runMembershipExpiryPageScenarios,
  runMembershipOrphanedQueuedGrantScenarios,
]

export const AFTER_MEMBERSHIP_CAPACITY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runMembershipReadCapacityScenarios,
]
