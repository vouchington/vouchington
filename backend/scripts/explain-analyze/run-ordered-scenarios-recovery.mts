import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { seedClaimantMisuseWindows } from './seed-data/claimant-misuse-windows.mts'
import { seedMediaDeliveryReplay } from './seed-data/media-delivery-replay.mts'
import { seedAndAnalyzeAgentModerationRetention } from './seed-data/agent-moderation-retention.mts'
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
import { runCopyrightDsaRecoveryCapacityScenarios } from './run-scenarios/copyright-dsa-recovery.mts'
import { runCopyrightStaffCaseQueueScenarios } from './run-scenarios/copyright-staff-case-queue.mts'

export const RECOVERY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // Keep the mixed membership corpus out of unrelated aggregate and candidate plans.
  seedVoteWeightDispatch,
  runVoteWeightDispatchScenarios,
  // Copyright recovery plans expect the copyright notice, submission, and target corpora.
  seedClaimantMisuseWindows,
  seedMediaDeliveryReplay,
  runCopyrightSuspendedClaimantRecoveryCapacityScenarios,
  runCopyrightStatutoryRestorationCapacityScenarios,
  runCopyrightPendingEnforcementScenarios,
  runCopyrightActionIntentRecoveryCapacityScenarios,
  runCopyrightDeliveryIntentRecoveryCapacityScenarios,
  runMembershipProviderRecoveryScenarios,
  runCopyrightHoldRestoreRecoveryCapacityScenarios,
  runCopyrightFormReviewRecoveryScenarios,
  runCopyrightTrustedFlaggerCapacityScenarios,
  // The actor probes read the agent moderation retention corpus; seed it when this domain runs alone.
  seedAndAnalyzeAgentModerationRetention,
  runFkActorIndexScenarios,
  runPostCommunityHydrationCapacityScenario,
  // The staff-case fixture analyzes deadlines. Keep the recovery plans ahead of it.
  runCopyrightStaffCaseQueueScenarios,
  // The immutable submission ledger stays in the last fixture of main-2.
  runCopyrightDsaRecoveryCapacityScenarios,
]
