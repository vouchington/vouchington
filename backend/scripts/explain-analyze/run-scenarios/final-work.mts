import { continueAfterFailure as runStep } from '../scenario-failures.mts'
import { runFkActorIndexScenarios } from './fk-actor-indexes.mts'
import { runPaymentLedgerRetentionScenarios } from './payment-ledger-retention.mts'
import { runVoteScoreRankingScenarios } from './vote-score-ranking.mts'
import { runCommentDescendantPartitionedPages } from './comment-descendant-partitioned-pages.mts'
import { runCategoryProjectionScenarios } from './category-projection.mts'

/** Keep late fixture changes after every ordinary capture. */
export async function runFinalWorkScenarios(): Promise<void> {
  await runStep(runFkActorIndexScenarios.name, runFkActorIndexScenarios)
  await runStep(runPaymentLedgerRetentionScenarios.name, runPaymentLedgerRetentionScenarios)
  await runStep(runVoteScoreRankingScenarios.name, runVoteScoreRankingScenarios)
  await runStep(runCommentDescendantPartitionedPages.name, runCommentDescendantPartitionedPages)
  await runStep(runCategoryProjectionScenarios.name, runCategoryProjectionScenarios)
}
