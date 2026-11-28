import { runEmbeddingReconciliationScenarios } from './run-scenarios/embedding-reconciliation.mts'
import { runStripeEventRecoveryScenario } from './run-scenarios/stripe-event-recovery.mts'
import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { runMembershipRenewalSelectionScenario } from './run-scenarios/membership-renewal-selection.mts'
import { runPrioritizedReferralCacheMeasurement } from './run-scenarios/prioritized-referral-cache-measurement.mts'
import { runReferralValidationPages } from './run-scenarios/referral-program-validation-pages.mts'
import { runPaymentLedgerRetentionScenarios } from './run-scenarios/payment-ledger-retention.mts'
import { runVoteScoreRankingScenarios } from './run-scenarios/vote-score-ranking.mts'
import { runLatePostPageScenarios } from './run-scenarios/late-post-pages.mts'

export const EMBEDDINGS_PAYMENTS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runEmbeddingReconciliationScenarios,
  runStripeEventRecoveryScenario,
  // Membership renewal selection needs the mixed membership corpus to stay on the live-source index.
  seedVoteWeightDispatch,
  runMembershipRenewalSelectionScenario,
  runPrioritizedReferralCacheMeasurement,
  runReferralValidationPages,
  runPaymentLedgerRetentionScenarios,
  runVoteScoreRankingScenarios,
  runLatePostPageScenarios,
]
