import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { runVoteWeightDispatchScenarios } from './run-scenarios/vote-weight-dispatch.mts'
import { runCopyrightSuspendedClaimantRecoveryCapacityScenarios } from './run-scenarios/copyright-suspended-claimant-recovery.mts'
import { runCopyrightStatutoryRestorationCapacityScenarios } from './run-scenarios/copyright-statutory-restoration.mts'
import { runCopyrightPendingEnforcementScenarios } from './run-scenarios/copyright-pending-enforcement.mts'
import { runCopyrightActionIntentRecoveryCapacityScenarios } from './run-scenarios/copyright-action-intent-recovery.mts'
import { runCopyrightDeliveryIntentRecoveryCapacityScenarios } from './run-scenarios/copyright-delivery-intent-recovery.mts'
import { runMembershipProviderRecoveryScenarios } from './run-scenarios/membership-provider-recovery.mts'
import { runCopyrightHoldRestoreRecoveryCapacityScenarios } from './run-scenarios/copyright-hold-restore-recovery.mts'
import { runCopyrightFormReviewRecoveryScenarios } from './run-scenarios/copyright-form-review-recovery.mts'
import { runCopyrightTrustedFlaggerCapacityScenarios } from './run-scenarios/copyright-trusted-flaggers.mts'
import { runFkActorIndexScenarios } from './run-scenarios/fk-actor-indexes.mts'
import { runPostCommunityHydrationCapacityScenario } from './run-scenarios/post-community-hydration-capacity.mts'

export const RECOVERY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // Keep the mixed membership corpus out of unrelated aggregate and candidate plans.
  seedVoteWeightDispatch,
  runVoteWeightDispatchScenarios,
  runCopyrightSuspendedClaimantRecoveryCapacityScenarios,
  runCopyrightStatutoryRestorationCapacityScenarios,
  runCopyrightPendingEnforcementScenarios,
  runCopyrightActionIntentRecoveryCapacityScenarios,
  runCopyrightDeliveryIntentRecoveryCapacityScenarios,
  runMembershipProviderRecoveryScenarios,
  runCopyrightHoldRestoreRecoveryCapacityScenarios,
  runCopyrightFormReviewRecoveryScenarios,
  runCopyrightTrustedFlaggerCapacityScenarios,
  // The actor probes read the agent moderation and report context corpora seeded earlier in this
  // segment, so they stay in it, ahead of the hot publication fixtures.
  runFkActorIndexScenarios,
  runPostCommunityHydrationCapacityScenario,
]
