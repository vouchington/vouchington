import { runCategoryProjectionScenarios } from './run-scenarios/category-projection.mts'
import { ensureDispatchWorkPlanSeeds } from './seed-data/dispatch-work-plans.mts'
import { seedVoteScorePublisherAndPostFixture } from './seed-data/vote-score-ranking.mts'
import { runExistenceFilterScenarios } from './run-scenarios/existence-filters.mts'
import { runAiUsageLookupScenarios } from './run-scenarios/ai-usage-lookups.mts'
import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { runMembershipScenarios } from './run-scenarios/memberships.mts'
import { runMembershipExpiryPageScenarios } from './run-scenarios/membership-expiry-pages.mts'
import { runMembershipOrphanedQueuedGrantScenarios } from './run-scenarios/membership-orphaned-queued-grants.mts'
import { runMembershipReadCapacityScenarios } from './run-scenarios/membership-read-capacity.mts'
import { runMembershipPendingStateCapacity } from './run-scenarios/membership-pending-state-capacity.mts'
import { runMembershipEntitlementEffectCapacityScenarios } from './run-scenarios/membership-entitlement-effect-capacity.mts'
import { runMembershipRefundDispatchScenario } from './run-scenarios/membership-refund-dispatch.mts'

export const AFTER_MEMBERSHIPS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runCategoryProjectionScenarios,
  // Existence filters read the dispatch referral-link corpus and the publisher-ranking fixture.
  ensureDispatchWorkPlanSeeds,
  seedVoteScorePublisherAndPostFixture,
  runExistenceFilterScenarios,
  runAiUsageLookupScenarios,
  // Membership refund-target and orphaned-grant plans need the mixed membership corpus.
  seedVoteWeightDispatch,
  runMembershipScenarios,
  // Expiry fixtures come after the shared membership writer's corpus and all ordinary plans.
  runMembershipExpiryPageScenarios,
  runMembershipOrphanedQueuedGrantScenarios,
  runMembershipReadCapacityScenarios,
  runMembershipPendingStateCapacity,
  runMembershipRefundDispatchScenario,
  runMembershipEntitlementEffectCapacityScenarios,
]
