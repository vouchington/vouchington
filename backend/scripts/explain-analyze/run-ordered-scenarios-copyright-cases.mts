import { runClassifierHumanVoteComparisonScenarios } from './run-scenarios/classifier-human-vote-comparison.mts'
import { runCopyrightStatementFactsScenarios } from './run-scenarios/copyright-statement-facts.mts'
import { runCopyrightDeliveryBatchScenarios } from './run-scenarios/copyright-delivery-batches.mts'
import { runCopyrightCasePurgeScenarios } from './run-scenarios/copyright-case-purge.mts'
import { runCopyrightStuckRunCapacityScenarios } from './run-scenarios/copyright-stuck-runs.mts'
import { runClaimantMisuseWindowScenarios } from './run-scenarios/claimant-misuse-windows.mts'
import { runCopyrightGuestRetentionScenario } from './run-scenarios/copyright-guest-retention.mts'

export const COPYRIGHT_CASES_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runClassifierHumanVoteComparisonScenarios,
  runCopyrightStatementFactsScenarios,
  runCopyrightDeliveryBatchScenarios,
  runCopyrightCasePurgeScenarios,
  runCopyrightStuckRunCapacityScenarios,
  runClaimantMisuseWindowScenarios,
  runCopyrightGuestRetentionScenario,
]
