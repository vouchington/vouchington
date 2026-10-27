import type { TransactionQuery } from '@data-stores/psql'
import type { TopicMergeOperationRow } from './merge-operation-types.mts'
import type { TopicMergeStagePageResult } from './merge-stage-result.mts'
import { processTopicMergeCaptureStagePage } from './merge-stage-capture.mts'
import { processTopicMergeReferenceStagePage } from './merge-stage-reference.mts'
import { processTopicMergeSettlementStagePage } from './merge-stage-settlement.mts'

export async function executeTopicMergeStagePage(
  query: TransactionQuery,
  operation: TopicMergeOperationRow,
  limit: number,
): Promise<TopicMergeStagePageResult> {
  return (
    (await processTopicMergeCaptureStagePage(query, operation, limit)) ??
    (await processTopicMergeReferenceStagePage(query, operation, limit)) ??
    (await processTopicMergeSettlementStagePage(query, operation, limit)) ??
    unknownTopicMergeStage()
  )
}

function unknownTopicMergeStage(): never {
  throw new Error('Unknown topic merge stage')
}
